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
    const libTypeMatch = typeString.match(/^([a-zA-Z_][\w]*)\.([\s\S]*)$/);
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
          lib,
          containerType: container,
          keyType: PineTypify.parseType(type1String),
          valueType: PineTypify.parseType(type2String || 'unknown'),
        };
      } else { // array or matrix
        return {
          baseType: container,
          modifier,
          lib,
          containerType: container,
          elementType: PineTypify.parseType(type1String),
        };
      }
    }

    // Handle simple arrays: type[]
    const arraySuffixMatch = typeString.match(/^(.*)\[\s*\]$/);
    if (arraySuffixMatch) {
      const baseTypeName = arraySuffixMatch[1].trim();
      return {
        baseType: 'array',
        modifier,
        lib,
        containerType: 'array',
        elementType: PineTypify.parseType(baseTypeName),
      };
    }

    // Simple type or UDT (possibly with a now-stripped lib prefix)
    const result = {
      baseType: typeString,
      modifier,
      lib,
    };
    return result;
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
    if (typeof (VSCode as any).Linter?.getLintResponse === 'function') {
        lintResponseFromLinter = (VSCode as any).Linter.getLintResponse();
    }
    const lintVariables = (lintResponseFromLinter?.success && lintResponseFromLinter?.result?.variables)
      ? lintResponseFromLinter.result.variables
      : [];

    if (Array.isArray(lintVariables)) {
      for (const lintVar of lintVariables as Array<{name: string, type: string}>) {
        if (lintVar.name && lintVar.type) {
          const parsedType = PineTypify.parseType(lintVar.type);
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
          this.typeMap.set(item.name, PineTypify.parseType(typeStr));
        }
      }
    }

    // 3. Add built-in boolean constants
    if (!this.typeMap.has('true')) this.typeMap.set('true', { baseType: 'bool' });
    if (!this.typeMap.has('false')) this.typeMap.set('false', { baseType: 'bool' });

    // 4. Add 'na' as float
    if (!this.typeMap.has('na')) this.typeMap.set('na', { baseType: 'float' });

    const commonColors = [
      'aqua', 'black', 'blue', 'fuchsia', 'gray', 'green', 'lime', 'maroon',
      'navy', 'olive', 'orange', 'purple', 'red', 'silver', 'teal', 'white', 'yellow',
    ]
    commonColors.forEach((color) => {
      if (!this.typeMap.has(`color.${color}`)) {
        this.typeMap.set(`color.${color}`, { baseType: 'color', lib: 'color' });
      }
    });
    this.mapInitialized = true;
  }

  private inferTypeFromValue(valueString: string, variableName: string): ParsedType | null {
    valueString = valueString.trim()

    if (
      (valueString.startsWith('"') && valueString.endsWith('"')) ||
      (valueString.startsWith("'") && valueString.endsWith("'"))
    ) {
      return { baseType: 'string' }
    }
    if (/^str\.format\s*\(/.test(valueString)) {
      return { baseType: 'string' }
    }

    if (valueString === 'true' || valueString === 'false') {
      return { baseType: 'bool' }
    }

    if (valueString === 'na') {
      return { baseType: 'float' }
    }

    if (/^-?\d+$/.test(valueString)) {
      return { baseType: 'int' }
    }
    if (/^-?(?:\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?$/.test(valueString) || /^-?\d+[eE][-+]?\d+$/.test(valueString)) {
      return { baseType: 'float' }
    }

    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(valueString)) {
      return { baseType: 'color' }
    }
    if (/^color\.(new|rgb)\s*\(/.test(valueString)) {
      return { baseType: 'color' }
    }
    const knownColor = this.typeMap.get(valueString)
    if (knownColor && knownColor.baseType === 'color') {
      return { baseType: 'color' }
    }

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
        break
      }
    }

    if (questionMarkIndex !== -1 && colonIndex !== -1) {
      const expr1String = valueString.substring(questionMarkIndex + 1, colonIndex).trim()
      const expr2String = valueString.substring(colonIndex + 1).trim()
      const type1 = this.inferTypeFromValue(expr1String, '')
      const type2 = this.inferTypeFromValue(expr2String, '')

      if (type1 && type2) {
        if (type1.baseType === type2.baseType) {
          return type1
        }
        if (
          (type1.baseType === 'float' && type2.baseType === 'int') ||
          (type1.baseType === 'int' && type2.baseType === 'float')
        ) {
          return { baseType: 'float' }
        }
        if (type1.baseType === 'float' && expr1String === 'na' && type2.baseType !== 'float') return type2
        if (type2.baseType === 'float' && expr2String === 'na' && type1.baseType !== 'float') return type1
        if (type1.baseType === 'float' && type2.baseType === 'float') return { baseType: 'float' }
        return null
      } else if (type1 && expr2String === 'na') {
        return type1
      } else if (type2 && expr1String === 'na') {
        return type2
      }
      return null
    }

    const directKnownType = this.typeMap.get(valueString)
    if (directKnownType) {
      return directKnownType
    }

    return null
  }

  async typifyDocument() {
    await this.makeMap()
    const document = VSCode.Document
    if (!document) {
      return
    }

    const text = document.getText()
    const edits: vscode.TextEdit[] = []
    const lines = text.split(/\r?\n/)
    const processedLines = new Set<number>()

    const untypedVarRegex =
      /^\s*(?!pine|import|export|plotchar|plotshape|plotarrow|plot|fill|hline|strategy|indicator|alertcondition|type|fun_declaration|method|if|for|while|switch|bgcolor|plotcandle|plotbar|alert|log)\s*(?:(var\s+|varip\s+)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;\n]+(?:\n\s*\?\s*[^;\n]+:\s*[^;\n]+)?)(?:;|$)/gm

    for (let i = 0; i < lines.length; i++) {
      if (processedLines.has(i) || lines[i].trim().startsWith('//')) {
        continue
      }

      if (
        /^\s*(?:float|int|bool|string|color|array|matrix|map|box|line|label|table|defval)\s+[a-zA-Z_]/.test(lines[i])
      ) {
        continue
      }
      const lineUntypedVarRegex =
        /^\s*(?:(var\s+|varip\s+)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;\n]+(?:\n\s*\?\s*[^;\n]+:\s*[^;\n]+)?)(?:;|$)/
      const match = lines[i].match(lineUntypedVarRegex)

      if (match) {
        const varIpPart = match[1] || ''
        const variableName = match[2]
        const valueExpression = match[3].trim()
        const inferredType = this.inferTypeFromValue(valueExpression, variableName)

        if (inferredType && !/(plot|hline|undetermined type)/g.test(inferredType.baseType)) {
          const lineText = lines[i]
          const currentLinePosStart = document.positionAt(text.indexOf(lineText))
          const position = document.positionAt(text.indexOf(lines[i]))
          let lineStartOffset = 0
          for (let k = 0; k < i; ++k) lineStartOffset += lines[k].length + (text.includes('\r\n') ? 2 : 1)

          const typePrefix = `${PineTypify.stringifyParsedType(inferredType)} `
          let insertionPoint = lineText.indexOf(variableName)
          if (varIpPart) {
            insertionPoint = lineText.indexOf(varIpPart) + varIpPart.length
          }

          const startPos = document.positionAt(lineStartOffset + insertionPoint)
          const endPos = document.positionAt(lineStartOffset + insertionPoint)
          const currentDeclaration = lines[i].substring(insertionPoint)
          if (!currentDeclaration.startsWith(typePrefix)) {
            let newText
            const originalVarPart = varIpPart ? varIpPart + variableName : variableName
            let indent = lines[i].match(/^\s*/)?.[0] || ''
            if (varIpPart) {
              newText = `${indent}${varIpPart}${typePrefix}${variableName}${lines[i].substring(
                indent.length + varIpPart.length + variableName.length,
              )}`
            } else {
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
    if (edits.length > 0) {
      await EditorUtils.applyEditsToDocument(edits)
    }
  }

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
      typeString = `${type.modifier ? type.modifier + " " : ""}${type.lib ? type.lib + "." : ""}array<${PineTypify.stringifyParsedType(type.elementType)}>`;
      if (type.containerType === 'matrix') typeString = typeString.replace('array<','matrix<');
    }
    return typeString;
  }
}
