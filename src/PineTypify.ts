import * as vscode from 'vscode'
import { VSCode } from './VSCode'
import { Class } from './PineClass'

/** Utility class for making text edits in the active document. */
export class EditorUtils {
  /**
   * Applies a list of text edits to the active document.
   * @param edits - The list of text edits to apply.
   * @returns A promise that resolves to a boolean indicating whether the edits were applied successfully.
   */
  static async applyEditsToDocument(edits: vscode.TextEdit[]): Promise<boolean> {
    const editor = VSCode.Editor
    if (!editor) {
      VSCode.Window.showErrorMessage('No active text editor available.')
      return false
    }
    try {
      await editor.edit((editBuilder) => {
        edits.forEach((edit) => {
          editBuilder.replace(edit.range, edit.newText)
        })
      })
      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }
}

/**
 * Represents a parsed type, including nested structures for UDTs.
 */
export interface ParsedType { // Added export
  baseType: string;
  modifier?: 'series' | 'simple' | 'input' | 'const' | 'literal' | string; // string for other potential modifiers
  containerType?: 'array' | 'matrix' | 'map';
  elementType?: ParsedType; // For array, matrix
  keyType?: ParsedType;   // For map (key type)
  valueType?: ParsedType; // For map (value type) -> renaming elementType for map's value for clarity
  lib?: string;
  // isArray is deprecated in favor of containerType: 'array' and elementType
}

/**
 * Class for applying type annotations to PineScript variables and functions in the active document.
 */
export class PineTypify {
  private typeMap: Map<string, ParsedType> = new Map()
  private functionMap: Map<string, ParsedType> = new Map()
  private udtRegex: RegExp =
    /^\s+(?:(?:(?:(array|matrix|map)<(([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*),)?(([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*))>)|([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*)\s*(\[\])?)\s+)([a-zA-Z_][a-zA-Z0-9_]*)(?:(?=\s*=\s*)(?:('.*')|(\".*\")|(\d*(\.(\d+[eE]?\d+)?\d*|\d+))|(#[a-fA-F0-9]{6,8})|(([a-zA-Z_][a-zA-Z0-9_]*\.)*[a-zA-Z_][a-zA-Z0-9_]*)))?$/gm

  /**
   * Parses a type string into a ParsedType object.
   * @param typeString The type string to parse.
   * @returns The parsed type.
   */
  public static parseType(typeString: string): ParsedType { // Made public static
    if (!typeString) return { baseType: 'unknown' };
    typeString = typeString.trim();

    let modifier: ParsedType['modifier'] | undefined = undefined;
    const modifierMatch = typeString.match(/^(series|simple|input|const|literal)\s+(.*)$/);
    if (modifierMatch) {
      modifier = modifierMatch[1] as ParsedType['modifier'];
      typeString = modifierMatch[2];
    }

    // Handle library prefix: Lib.Type
    let lib: string | undefined = undefined;
    const libTypeMatch = typeString.match(/^([a-zA-Z_][\w]*)\.([\s\S]*)$/); // Changed to [\s\S]* to handle generics within lib types
    if (libTypeMatch) {
      lib = libTypeMatch[1];
      typeString = libTypeMatch[2];
    }

    // Handle generics: array<T>, matrix<T>, map<K, V>
    const genericMatch = typeString.match(/^(array|matrix|map)\s*<\s*([^,]+)(?:\s*,\s*([\s\S]+))?\s*>$/);
    if (genericMatch) {
      const container = genericMatch[1] as 'array' | 'matrix' | 'map';
      const type1String = genericMatch[2].trim();
      const type2String = genericMatch[3]?.trim();

      if (container === 'map') {
        return {
          baseType: container,
          modifier,
          lib, // Lib applies to the map itself if it's like Lib.map<K,V> - though unusual for built-ins
          containerType: container,
          keyType: PineTypify.parseType(type1String), // Use static call
          valueType: PineTypify.parseType(type2String || 'unknown'), // Use static call
        };
      } else { // array or matrix
        return {
          baseType: container,
          modifier,
          lib,
          containerType: container,
          elementType: PineTypify.parseType(type1String), // Use static call
        };
      }
    }

    // Handle simple arrays: type[]
    const arraySuffixMatch = typeString.match(/^(.*)\[\s*\]$/);
    if (arraySuffixMatch) {
      const baseTypeName = arraySuffixMatch[1].trim();
      // Constructing it as if it were array<baseTypeName> for consistency
      return {
        baseType: 'array', // The container is an array
        modifier,
        // lib might have been parsed before for baseTypeName if it was Lib.Type[]
        // If baseTypeName itself has a lib prefix, PineTypify.parseType(baseTypeName) will get it.
        containerType: 'array',
        elementType: PineTypify.parseType(baseTypeName), // Use static call
      };
    }

    // Simple type or UDT (possibly with a now-stripped lib prefix)
    return {
      baseType: typeString, // What remains is the base type
      modifier,
      lib, // This lib is the one associated with this specific baseType
    };
  }

  private mapInitialized = false;
  private async ensureMapInitialized() {
      if (!this.mapInitialized) {
          await this.makeMap();
          this.mapInitialized = true;
      }
  }

  public async getVariableType(variableName: string): Promise<ParsedType | null> {
    await this.ensureMapInitialized();
    return this.typeMap.get(variableName) || null;
  }

  /**
   * Populates the type map with variable types and UDT definitions.
   * Prioritizes linting data, then static variable docs, then built-ins.
   */
  async makeMap() {
    this.typeMap.clear(); // Start fresh

    // 1. Process Linting Data
    let lintResponseFromLinter: any = undefined;
    // Access Linter property dynamically to satisfy TypeScript during compilation,
    // while allowing the Jest mock (which defines Linter) to work at runtime.
    if (typeof (VSCode as any).Linter?.getLintResponse === 'function') {
        lintResponseFromLinter = (VSCode as any).Linter.getLintResponse();
    }
    const lintVariables = (lintResponseFromLinter?.success && lintResponseFromLinter?.result?.variables)
      ? lintResponseFromLinter.result.variables
      : [];

    if (Array.isArray(lintVariables)) {
      for (const lintVar of lintVariables as Array<{name: string, type: string}>) {
        if (lintVar.name && lintVar.type) {
          const parsedType = PineTypify.parseType(lintVar.type); // Changed to static call
          if (parsedType && parsedType.baseType !== 'unknown') {
            this.typeMap.set(lintVar.name, parsedType);
          }
        }
      }
    }

    // 2. Process variables from PineDocsManager (these are generally built-in variables)
    interface StaticVariableDoc { name: string; type: string; [key: string]: any; }
    const staticVariables = Class.PineDocsManager.getDocs('variables') as StaticVariableDoc[];

    if (staticVariables && Array.isArray(staticVariables)) {
      for (const item of staticVariables) {
        if (item.name && item.type && !this.typeMap.has(item.name)) {
          const typeStr = item.type.replace(/(const|input|series|simple|literal)\s*/g, '').replace(/([\w.]+)\[\]/g, 'array<$1>');
          this.typeMap.set(item.name, PineTypify.parseType(typeStr)); // Changed to static call
        }
      }
    }

    // 3. Add built-in boolean constants
    if (!this.typeMap.has('true')) this.typeMap.set('true', { baseType: 'bool' });
    if (!this.typeMap.has('false')) this.typeMap.set('false', { baseType: 'bool' });

    // 4. Add 'na' as float
    if (!this.typeMap.has('na')) this.typeMap.set('na', { baseType: 'float' });

    // Add common built-in color constants
    const commonColors = [
      'aqua',
      'black',
      'blue',
      'fuchsia',
      'gray',
      'green',
      'lime',
      'maroon',
      'navy',
      'olive',
      'orange',
      'purple',
      'red',
      'silver',
      'teal',
      'white',
      'yellow',
    ]
    commonColors.forEach((color) => {
      if (!this.typeMap.has(`color.${color}`)) {
        this.typeMap.set(`color.${color}`, { baseType: 'color', lib: 'color' });
      }
    });
    this.mapInitialized = true; // Set flag after map is populated
  }

  private inferTypeFromValue(valueString: string, variableName: string): ParsedType | null {
    valueString = valueString.trim()

    // 1. String Literals
    if (
      (valueString.startsWith('"') && valueString.endsWith('"')) ||
      (valueString.startsWith("'") && valueString.endsWith("'"))
    ) {
      return { baseType: 'string' }
    }
    if (/^str\.format\s*\(/.test(valueString)) {
      return { baseType: 'string' }
    }

    // 2. Boolean Literals
    if (valueString === 'true' || valueString === 'false') {
      return { baseType: 'bool' }
    }

    // 3. 'na' Value - check before numbers as 'na' is not a number
    if (valueString === 'na') {
      return { baseType: 'float' } // Default 'na' to float
    }

    // 4. Number Literals
    if (/^-?\d+$/.test(valueString)) {
      // Integer
      return { baseType: 'int' }
    }
    if (/^-?(?:\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?$/.test(valueString) || /^-?\d+[eE][-+]?\d+$/.test(valueString)) {
      // Float
      return { baseType: 'float' }
    }

    // 5. Color Literals & Functions
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(valueString)) {
      return { baseType: 'color' }
    }
    if (/^color\.(new|rgb)\s*\(/.test(valueString)) {
      // covers color.new(...) and color.rgb(...)
      return { baseType: 'color' }
    }
    // Check for known color constants from typeMap (e.g., color.red)
    const knownColor = this.typeMap.get(valueString)
    if (knownColor && knownColor.baseType === 'color') {
      return { baseType: 'color' }
    }

    // 6. Ternary Expressions
    // Improved regex to better handle nested ternaries or complex conditions by focusing on the last '?'
    // This is a common way to parse right-associative operators.
    // It tries to find the main ? : operators for the current expression level.
    let openParen = 0
    let questionMarkIndex = -1
    let colonIndex = -1

    for (let i = 0; i < valueString.length; i++) {
      if (valueString[i] === '(') openParen++
      else if (valueString[i] === ')') openParen--
      else if (valueString[i] === '?' && openParen === 0 && questionMarkIndex === -1) {
        questionMarkIndex = i
      } else if (valueString[i] === ':' && openParen === 0 && questionMarkIndex !== -1) {
        colonIndex = i
        break // Found the main ternary operator for this level
      }
    }

    if (questionMarkIndex !== -1 && colonIndex !== -1) {
      // const conditionStr = valueString.substring(0, questionMarkIndex).trim();
      const expr1String = valueString.substring(questionMarkIndex + 1, colonIndex).trim()
      const expr2String = valueString.substring(colonIndex + 1).trim()

      // inferTypeFromValue is an instance method, but parseType is now static.
      // This implies inferTypeFromValue might need to call PineTypify.parseType if it were to parse types.
      // However, inferTypeFromValue calls itself recursively, not parseType directly.
      // The calls to this.parseType were in the original parseType method for generics, which is now static.
      // So, inferTypeFromValue's recursive calls are fine.
      const type1 = this.inferTypeFromValue(expr1String, '')
      const type2 = this.inferTypeFromValue(expr2String, '')

      if (type1 && type2) {
        if (type1.baseType === type2.baseType) {
          return type1
        }
        // Pine script specific coercions if known, e.g. int + float = float
        if (
          (type1.baseType === 'float' && type2.baseType === 'int') ||
          (type1.baseType === 'int' && type2.baseType === 'float')
        ) {
          return { baseType: 'float' }
        }
        // if one is 'na' (which infers to float by default by this function) and the other is a concrete type, prefer the concrete type.
        if (type1.baseType === 'float' && expr1String === 'na' && type2.baseType !== 'float') return type2
        if (type2.baseType === 'float' && expr2String === 'na' && type1.baseType !== 'float') return type1
        // If both are 'na' or both are float (one might be 'na')
        if (type1.baseType === 'float' && type2.baseType === 'float') return { baseType: 'float' }
        // If types are different and not 'na' involved in a special way, it's ambiguous or requires specific pine coercion rules.
        // For now, could return null or a preferred type if one exists (e.g. float is often a safe bet for numbers)
        // Returning null means we don't type it if ambiguous.
        return null
      } else if (type1 && expr2String === 'na') {
        // expr2 is 'na'
        return type1
      } else if (type2 && expr1String === 'na') {
        // expr1 is 'na'
        return type2
      }
      return null // Could not determine a definitive type for the ternary
    }

    // Fallback: Check typeMap for the value itself (e.g. if 'high' (a float variable) is assigned)
    // This means the RHS is a known variable.
    const directKnownType = this.typeMap.get(valueString)
    if (directKnownType) {
      return directKnownType
    }

    return null // Cannot infer type
  }
  /**
   * Fetches UDT definitions from the current project or external libraries.
   * @returns A string containing UDT definitions.
   */
  //   private async fetchUDTDefinitions(): Promise<string> {
  //     // Placeholder for fetching UDT definitions
  //     // This might involve searching for files with specific extensions or patterns
  //     // and extracting UDT definitions from them.
  //     return '';
  //   }

  /**
   * Parses UDT definitions and adds them to the type map.
   * @param udtDefinitions A string containing UDT definitions.
   */
  private parseAndAddUDTs(udtDefinitions: string) {
    let match
    while ((match = this.udtRegex.exec(udtDefinitions)) !== null) {
      const [, , , , , , , , udtName] = match
      if (udtName) {
        // Simplified parsing for demonstration
        this.typeMap.set(udtName, { baseType: udtName })
      }
    }
  }

  /**
   * Applies type annotations to variables and functions in the active document.
   */
  async typifyDocument() {
    await this.makeMap()
    const document = VSCode.Document
    if (!document) {
      return
    }

    const text = document.getText()
    const edits: vscode.TextEdit[] = []
    const lines = text.split(/\r?\n/)
    const processedLines = new Set<number>() // To avoid processing a line multiple times if old and new logic overlap

    // Phase 1: Inference for Untyped Declarations
    // Regex to find lines like: `[var[ip]] variableName = valueOrExpression`
    // It avoids lines that already start with a type keyword, common function keywords, or comments.
    // It captures: 1=var/varip (optional), 2=variable name, 3=value part
    const untypedVarRegex =
      /^\s*(?!pine|import|export|plotchar|plotshape|plotarrow|plot|fill|hline|strategy|indicator|alertcondition|type|fun_declaration|method|if|for|while|switch|bgcolor|plotcandle|plotbar|alert|log)\s*(?:(var\s+|varip\s+)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;\n]+(?:\n\s*\?\s*[^;\n]+:\s*[^;\n]+)?)(?:;|$)/gm

    for (let i = 0; i < lines.length; i++) {
      if (processedLines.has(i) || lines[i].trim().startsWith('//')) {
        continue
      }

      // Check if line already has a type (simple check, can be more robust)
      // Example: float myVar = ..., string x = "..."
      if (
        /^\s*(?:float|int|bool|string|color|array|matrix|map|box|line|label|table|defval)\s+[a-zA-Z_]/.test(lines[i])
      ) {
        continue
      }

      // Test the specific regex for untyped variables on the current line
      // We need to adjust the regex to work per line or use matchAll on the whole text and map to lines.
      // For simplicity, let's process line by line with a modified regex.
      const lineUntypedVarRegex =
        /^\s*(?:(var\s+|varip\s+)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;\n]+(?:\n\s*\?\s*[^;\n]+:\s*[^;\n]+)?)(?:;|$)/
      const match = lines[i].match(lineUntypedVarRegex)

      if (match) {
        const varIpPart = match[1] || '' // "var " or "varip " or ""
        const variableName = match[2]
        const valueExpression = match[3].trim()

        // Skip if it's a re-assignment, not a declaration (heuristic: check if var/varip is used or if it's inside a block without var/varip)
        // This needs more sophisticated scope analysis, but for now, if no var/varip, assume re-assignment unless it's global scope (hard to tell without parser)
        // A simple heuristic: if not var/varip, and not at global indent level (0), it's likely a re-assignment.
        // However, the problem asks to type declarations. `a = 1` at global scope is a declaration.

        const inferredType = this.inferTypeFromValue(valueExpression, variableName)

        if (inferredType && !/(plot|hline|undetermined type)/g.test(inferredType.baseType)) {
          const lineText = lines[i]
          const currentLinePosStart = document.positionAt(text.indexOf(lineText)) // More robust way to get start needed
          const position = document.positionAt(text.indexOf(lines[i]))

          // Ensure we are at the actual start of the line in the document text for correct range.
          let lineStartOffset = 0
          for (let k = 0; k < i; ++k) lineStartOffset += lines[k].length + (text.includes('\r\n') ? 2 : 1)

          const typePrefix = `${PineTypify.stringifyParsedType(inferredType)} ` // Changed this. to PineTypify.

          // Find the start of the variable name in the line to insert the type
          let insertionPoint = lineText.indexOf(variableName)
          if (varIpPart) {
            insertionPoint = lineText.indexOf(varIpPart) + varIpPart.length
          }

          const startPos = document.positionAt(lineStartOffset + insertionPoint)
          const endPos = document.positionAt(lineStartOffset + insertionPoint) // Insert, don't replace

          // Check if type is already there (e.g. `float myVar = 1.0`)
          // This check is simplified; a more robust check would parse the line structure.
          const currentDeclaration = lines[i].substring(insertionPoint)
          if (!currentDeclaration.startsWith(typePrefix)) {
            // Prepend type: `float myVar = 1.0` from `myVar = 1.0`
            // The actual replacement should be just an insertion of the type string.
            // `var myVar = 1` becomes `var float myVar = 1`
            // `myVar = 1` becomes `float myVar = 1`

            let newText
            const originalVarPart = varIpPart ? varIpPart + variableName : variableName
            let indent = lines[i].match(/^\s*/)?.[0] || ''
            if (varIpPart) {
              // var myvar = ... OR varip myvar = ...
              newText = `${indent}${varIpPart}${typePrefix}${variableName}${lines[i].substring(
                indent.length + varIpPart.length + variableName.length,
              )}`
            } else {
              // myvar = ...
              newText = `${indent}${typePrefix}${variableName}${lines[i].substring(
                indent.length + variableName.length,
              )}`
            }

            const lineRange = new vscode.Range(
              document.positionAt(lineStartOffset),
              document.positionAt(lineStartOffset + lines[i].length),
            )
            edits.push(vscode.TextEdit.replace(lineRange, newText))
            processedLines.add(i)
          }
        }
      }
    }

    // Phase 2: Typify based on typeMap (existing logic, potentially refined or merged)
    // This part would handle variables whose types are known from PineDocsManager but not from literal assignments.
    // It needs to be careful not to conflict with Phase 1.
    // For now, the new logic is the primary focus. The old logic might need to be disabled or heavily adapted.
    // If we keep it, it should also use the `processedLines` set.
    // For this iteration, let's comment out the old loop to avoid conflicts.
    /*
    this.typeMap.forEach((type, name) => {
      // ... (old logic) ...
      // Ensure to check `processedLines.has(lineNumber)` if this is re-enabled.
    });
    */

    if (edits.length > 0) {
      await EditorUtils.applyEditsToDocument(edits)
    }
  }

  /**
   * Converts a ParsedType object back into a type string.
   * @param type The parsed type to stringify.
   * @returns The string representation of the type.
   */
  public static stringifyParsedType(type: ParsedType): string {
    if (!type || !type.baseType) return 'unknown';

    let typeString = '';

    if (type.modifier) {
      typeString += `${type.modifier} `;
    }

    if (type.lib) {
      typeString += `${type.lib}.`;
    }

    typeString += type.baseType;

    if (type.containerType === 'map' && type.keyType && type.valueType) {
      typeString = `${type.modifier ? type.modifier + " " : ""}${type.lib ? type.lib + "." : ""}map<${PineTypify.stringifyParsedType(type.keyType)}, ${PineTypify.stringifyParsedType(type.valueType)}>`;
    } else if ((type.containerType === 'array' || type.containerType === 'matrix') && type.elementType) {
      typeString = `${type.modifier ? type.modifier + " " : ""}${type.lib ? type.lib + "." : ""}array<${PineTypify.stringifyParsedType(type.elementType)}>`; // Standardize to array<T> for stringification for matrix too
      if (type.containerType === 'matrix') typeString = typeString.replace('array<','matrix<'); // then correct if it was matrix
    }
    // Note: The original isArray field is deprecated in ParsedType.
    // The parseType method converts "type[]" into containerType: "array".
    // So, direct handling of isArray is not needed here if parseType is consistently used.

    return typeString;
  }
}
