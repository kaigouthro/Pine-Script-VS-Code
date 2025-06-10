// src/PineCompletionService.ts
import * as vscode from 'vscode' // Keeping import in case CompletionDoc needs VS Code types later, or for kind mapping logic if moved back.
import { Class } from './PineClass' // Assuming PineDocsManager is accessed via Class
import { Helpers } from './index' // Assuming Helpers is needed for type checks or formatting within logic

/**
 * Define a shape for the documentation data returned by the service.
 * This is a structured representation of a potential completion item's data.
 */
export interface CompletionDoc {
  name: string // The name/text to be potentially suggested (e.g., "plot", "array.push", "color=", "color.red")
  doc: any // The original documentation object from PineDocsManager
  namespace: string | null // The namespace or instance name (e.g., "array", "myArray", "color")
  isMethod?: boolean // True if it's a method
  kind?: string // Original kind string from doc (e.g., "Function", "Method", "Variable", "Constant", "Field", "Parameter")
  type?: string // Type string (e.g., "series float", "array<float>", "color")
  isConst?: boolean // Marker for constants/enum members
  default?: any // Default value if applicable
  description?: string // Direct description text

  // New fields based on the plan
  libId?: string // Library identifier
  args?: any[] // Detailed arguments for functions/constructors
  returnTypes?: string[] // For function return types
  thisType?: string // For methods, changed from string[] to string based on typical usage
  fields?: any[] // For UDTs/Enums to store their members/fields

  // Optional: Add sortText if needed for specific ordering (e.g., for arguments)
  sortText?: string
}

/**
 * Provides core completion logic based on Pine Script documentation.
 * Decouples documentation lookup and filtering from VS Code specific item creation.
 */
export class PineCompletionService {
  private docsManager: typeof Class.PineDocsManager

  constructor(docsManager: typeof Class.PineDocsManager) {
    this.docsManager = docsManager
  }

  /**
   * Cleans a type name by removing modifiers, generic syntax, and array indicators.
   * e.g., "const series string[]" -> "string", "array<MyUDT>" -> "MyUDT"
   */
  private cleanTypeName(type: string | undefined | null): string {
    if (!type) return '';
    // Remove modifiers like const, input, series, simple, literal, etc.
    // Added more Pine Script specific keywords that might appear before a type.
    let cleanedType = type.replace(/(const|input|series|simple|literal|source|strategy|indicator|library|userdata|defval)\s+/g, '');
    // Handle array<type>, matrix<type>, map<type, type2> -> type (first generic type)
    // Using 'gi' for case-insensitive matching just in case type names in generics are not consistently cased.
    cleanedType = cleanedType.replace(/(?:array|matrix|map)<([\w\.]+)(?:,\s*[\w\.]+)*>/gi, '$1');
    // Handle type[] -> type
    cleanedType = cleanedType.replace(/\s*\[\]/g, '');
    // Trim any remaining whitespace
    return cleanedType.trim();
  }

  /**
   * Helper to check for minor typos between a potential match and the target name.
   * This implements the typo tolerance logic from the original code.
   * @param potentialMatch - The text typed by the user.
   * @param targetName - The full name from the documentation.
   * @returns true if the targetName is a plausible match for the potentialMatch with minor typos.
   */
  private checkTypoMatch(potentialMatch: string, targetName: string): boolean {
    if (!potentialMatch) {
      return true // Empty match matches everything (e.g., suggest all on empty line)
    }
    if (!targetName) {
      return false
    }

    const lowerPotential = potentialMatch.toLowerCase()
    const lowerTarget = targetName.toLowerCase()
    const potentialLength = lowerPotential.length

    let majorTypoCount = 0 // Number of characters in potentialMatch not found in targetName
    let minorTypoCount = 0 // Number of characters found out of order
    let targetIndex = 0 // Track position in targetName

    for (let i = 0; i < potentialLength; i++) {
      const char = lowerPotential[i]
      const foundIndex = lowerTarget.indexOf(char, targetIndex)

      if (foundIndex === -1) {
        majorTypoCount++
        if (majorTypoCount > 1) {
          return false // More than one character completely missing/wrong
        }
      } else {
        if (foundIndex !== targetIndex) {
          // Character found, but not at the expected next position.
          // Count how many characters were skipped in the target.
          minorTypoCount += foundIndex - targetIndex
          if (minorTypoCount >= 3) {
            return false // Too many out-of-order or skipped characters
          }
        }
        targetIndex = foundIndex + 1 // Move target index forward past the found character
      }
    }

    // Additional checks could be added, e.g., if the targetName is excessively longer than potentialMatch
    // if (lowerTarget.length > targetIndex + 3) return false; // If many chars left in target, might not be the intended item.
    // Sticking to original logic's implied checks (major <= 1, minor < 3 based on how they were used).
    return majorTypoCount <= 1 && minorTypoCount < 3
  }

  /**
   * Retrieves and filters general completions (functions, variables, types, keywords, etc.)
   * based on the input match (the word typed before the cursor).
   */
  getGeneralCompletions(match: string): CompletionDoc[] {
    const completions: CompletionDoc[] = []
    if (!match) {
      // If match is empty, suggest all top-level items? Or return empty?
      // Original code returned empty if match was null/empty *after* trim. Let's stick to that.
      return completions // Or maybe suggest common keywords like `study`, `plot`, `if`? Needs a source for those.
      // The original code includes 'controls', 'annotations', 'UDT', 'types' here.
      // Let's fetch those maps and iterate them.
    }

    // Get maps for general top-level suggestions
    const mapsToSearch = this.docsManager.getMap(
      'functions',
      'completionFunctions', // Note: Original code included this, assuming it's a valid map key for functions
      'variables',
      'variables2',
      'constants', // Top-level constants like `na`, `barstate.islast` (these might also be under namespaces)
      'UDT', // User Defined Types
      'enums', // Enums (newly added)
      'types', // Built-in types like 'integer', 'string'
      'imports', // The `import` keyword itself or imported modules? Unclear. Assuming symbols brought *in* by imports.
      'controls', // 'if', 'for', 'while', etc.
      'annotations', // '@version', '@study', etc.
    )

    const lowerMatch = match.toLowerCase()
    // const matchLength = match.length; // Not needed with checkTypoMatch

    for (const [name, doc] of mapsToSearch.entries()) {
      if (!name || name[0] === '*') {
        continue // Skip items with no name or starting with '*' (if any)
      }

      const lowerName = name.toLowerCase()

      // Basic prefix check first for potential performance gain on large maps
      // If the user typed "pl", only check items starting with "p" or "pl".
      // Let's check if the name starts with the typed text OR if the typo match applies.
      // This allows "plot" to match "plt" even if "plot" doesn't start with "plt".
      if (lowerName.startsWith(lowerMatch) || this.checkTypoMatch(match, name)) {
        completions.push({
          name: name, // The identifier name
          doc: doc, // Original documentation object
          namespace: null, // Top-level items have no namespace
          isMethod: doc?.isMethod ?? false,
          kind: doc?.kind, // Should be "UDT", "Enum", "Function", "Constant" etc.
          type: doc?.type, // For variables/constants, their type. For UDT/Enum, its own name or "type"/"enum". For functions, return type summary.
          isConst: doc?.isConst,
          default: doc?.default,
          description: doc?.desc,
          libId: doc?.libId, // Populate libId
          args: doc?.args, // Populate args for functions/constructors
          returnTypes: doc?.returnedTypes, // Populate returnTypes for functions
          fields: doc?.fields || doc?.members, // Populate fields for UDTs or members for Enums
        })
      }
    }
    return completions
  }

  /**
   * Retrieves and filters method completions based on the input match (e.g., "array.push").
   * Assumes match includes a dot.
   */
  getMethodCompletions(match: string): CompletionDoc[] {
    const completions: CompletionDoc[] = []
    // This method is called only if match includes a dot by the provider, but add check for safety.
    if (!match || !match.includes('.')) {
      return completions
    }

    const parts = match.split('.')
    // For `ns.part` match, `variableOrNamespace` is `ns`, `partialNameAfterDot` is `part`.
    // For `ns.` match, `variableOrNamespace` is `ns`, `partialNameAfterDot` is ``.
    const variableOrNamespace = parts[0]
    const partialNameAfterDot = parts.length > 1 ? parts.slice(1).join('.') : '' // Allow dots in method names if needed, though unlikely

    if (!variableOrNamespace) {
      // Needs at least `something.`
      return completions
    }

    const methodsMap = this.docsManager.getMap('methods', 'methods2')
    // Original code had an alias check. Let's ignore it for now unless its purpose is clear.
    // if (this.docsManager.getAliases().includes(variableOrNamespace)) return []; // This check seems counter-intuitive if aliases have methods.

    // Determine the type of the variable/namespace before the dot.
    const potentialType = Helpers.identifyType(variableOrNamespace)

    for (const [name, doc] of methodsMap.entries()) {
      if (!doc.isMethod || name[0] === '*') {
        continue // Skip non-methods or internal items
      }

      // Expected format in map is likely `namespace.methodName`
      const nameParts = name.split('.')
      if (nameParts.length < 2) {
        continue // Skip items not in namespace.method format
      }
      const docNamespace = nameParts[0]
      const docMethodName = nameParts.slice(1).join('.') // The actual method name part

      // --- Type Compatibility Check ---
      // Check if the type of the object before the dot (`variableOrNamespace`'s type)
      // is compatible with the method's expected `this` type (`Helpers.getThisTypes(doc)`).
      const expectedThisTypes = Helpers.getThisTypes(doc)

      let typeMatch = false
      if (expectedThisTypes) {
        // Normalize types for comparison (e.g., `array<float>` vs `array<type>`)
        const normalizedPotentialType = potentialType
          ? potentialType.toLowerCase().replace(/([\w.]+)\[\]/g, 'array<$1>')
          : null
        const normalizedExpectedTypes = expectedThisTypes.toLowerCase().replace(/([\w.]+)\[\]/g, 'array<$1>')

        // Simple compatibility check: Does the potential type match or include the expected base type?
        const expectedBaseType = normalizedExpectedTypes.split('<')[0]
        const potentialBaseType = normalizedPotentialType ? normalizedPotentialType.split('<')[0] : null

        if (potentialBaseType === expectedBaseType) {
          typeMatch = true // e.g. variable is `array<float>`, method expects `array<type>` -> base types match `array`
        } else if (potentialType === null && variableOrNamespace === docNamespace) {
          // If we couldn't identify a variable type (e.g. it's a namespace like `math`),
          // check if the namespace itself matches the method's documented namespace.
          typeMatch = true // e.g. user typed `math.`, method is `math.abs` -> namespace matches
        }
        // Add more sophisticated type compatibility checks if needed for Pine Script.
        // For now, this basic check based on base type or namespace match replicates a plausible version of original intent.
      } else if (variableOrNamespace === docNamespace) {
        typeMatch = true
      } else {
        // If type check fails and namespace doesn't match, skip.
        continue
      }

      if (!typeMatch) {
        continue // Skip methods that don't apply to this type/namespace context
      }
      // --- End Type Compatibility Check ---

      // Now check if the method name (`docMethodName`) matches the `partialNameAfterDot` (what user typed after dot)
      // Use the typo check logic.
      if (this.checkTypoMatch(partialNameAfterDot, docMethodName)) {
        completions.push({
          name: `${variableOrNamespace}.${docMethodName}`, // Return the full name including namespace for display/insertion
          doc: doc, // Original documentation object
          namespace: variableOrNamespace, // The determined namespace/variable name
          isMethod: true, // It's a method completion
          kind: doc?.kind, // Original kind (should be Method)
          type: doc?.type, // Return type of the method (summary)
          description: doc?.desc, // Description text
          libId: doc?.libId, // Populate libId
          args: doc?.args, // Populate args for the method
          returnTypes: doc?.returnedTypes, // Populate detailed returnTypes
          thisType: doc?.thisType, // Populate thisType
        })
      }
    }

    return completions
  }

  /**
   * Retrieves and filters UDT constructor completions (e.g., MyType.new).
   * Assumes match ends with a dot.
   */
  getUdtConstructorCompletions(match: string): CompletionDoc[] {
    const completions: CompletionDoc[] = []
    // This method is called only if match includes a dot by the provider, but add check for safety.
    if (!match || !match.endsWith('.')) {
      return completions
    }

    const potentialUdtName = match.slice(0, -1) // Text before the dot

    if (!potentialUdtName) {
      return completions
    }

    const udtMap = this.docsManager.getMap('UDT', 'types') // UDT definitions are in these maps

    const udtDoc = udtMap.get(potentialUdtName)

    // Suggest 'new()' if the part before the dot is a known UDT name
    // The user might type 'MyType.' and we suggest 'new()'.
    // Or user might type 'MyType.ne' and we still suggest 'new()', filtered by the provider if needed,
    // or perhaps this service should check if 'new' matches `partialNameAfterDot` if it existed?
    // Original code only triggered if match ends with '.', suggesting 'new()' only when typing `MyType.`.
    // Let's stick to suggesting 'new()' only when the match is `UdtName.`.
    // The provider can filter this if the user types something like `MyType.ne`.

    // Fetch the UDT constructor from the 'functions' map, as per new lint format
    const constructorName = `${potentialUdtName}.new`
    const functionsMap = this.docsManager.getMap('functions', 'completionFunctions')
    const constructorDoc = functionsMap.get(constructorName)

    if (constructorDoc) {
      // If the specific "MyType.new" function doc is found
      completions.push({
        name: 'new()', // Suggest "new()"
        doc: constructorDoc, // Use the constructor's own documentation
        namespace: potentialUdtName,
        kind: 'Constructor',
        description: constructorDoc.desc || `Creates a new instance of \`${potentialUdtName}\`.`,
        libId: constructorDoc.libId,
        args: constructorDoc.args, // Populate args for the constructor
        returnTypes: constructorDoc.returnedTypes, // Populate returnTypes (should be the UDT itself)
      })
    } else {
      // Fallback if specific "MyType.new" is not found in functions map,
      // but potentialUdtName is a known UDT. (Less likely with new lint format)
      const udtMap = this.docsManager.getMap('UDT', 'types')
      const udtDoc = udtMap.get(potentialUdtName)
      if (udtDoc) {
        completions.push({
          name: 'new()',
          doc: udtDoc, // Link to the UDT documentation
          namespace: potentialUdtName,
          kind: 'Constructor',
          description: udtDoc?.desc || `Creates a new instance of \`${potentialUdtName}\`.`,
          libId: udtDoc.libId, // UDT itself might have a libId
          // args might be part of udtDoc or need to be inferred/empty
          args:
            udtDoc.args ||
            (udtDoc.fields
              ? udtDoc.fields.map((f: any) => ({ name: f.name, type: f.type, desc: f.desc, required: false }))
              : []), // Attempt to use UDT fields as potential constructor args
          returnTypes: [potentialUdtName], // Return type is the UDT itself
        })
      }
    }
    return completions
  }

  /**
   * Retrieves and filters instance field/property completions (e.g., myobj.fieldname).
   * Also handles built-in namespace constants (e.g. color.red).
   * Assumes match includes a dot.
   */
  getInstanceFieldCompletions(match: string): CompletionDoc[] {
    const completions: CompletionDoc[] = []
    if (!match || !match.includes('.')) {
      return completions
    }

    const parts = match.split('.')
    if (parts.length === 0) {
      return completions
    }

    let currentTypeName: string | null = null // Cleaned type name of the current object/UDT
    let currentLibId: string | undefined = undefined // LibId of the UDT/Enum whose members are currently being listed
    let currentMembers: any[] | null = null // Fields/members of the current UDT/Enum
    let currentNamespaceForCompletionDoc = '' // Builds up the path like "myUdtVar.field1"
    let isCurrentSourceEnum = false // Flag to indicate if currentMembers are from an Enum

    const firstPart = parts[0]
    const variableDoc = this.docsManager.getMap('variables', 'variables2').get(firstPart)

    if (variableDoc && variableDoc.type) {
      currentTypeName = this.cleanTypeName(variableDoc.type)
      currentNamespaceForCompletionDoc = firstPart // Namespace is the variable name itself
      const initialTypeDef = this.docsManager.getMap('UDT').get(currentTypeName) // UDTs have .fields
      if (initialTypeDef && initialTypeDef.fields) {
        currentMembers = initialTypeDef.fields
        currentLibId = initialTypeDef.libId // LibId of the UDT definition
      } else {
        // If not a UDT, could it be an enum for which fields are being accessed?
        // Enums usually don't have fields accessed via '.', but members.
        // Pine Script doesn't have `enum.member.field` syntax.
        // So if variableDoc.type resolves to an enum, currentMembers should be null here for field access.
        currentMembers = null;
      }
    } else {
      // Not a variable, maybe a UDT or Enum name directly (e.g., user types "MyUDT." or "MyEnum.")
      const udtOrEnumNameCandidate = this.cleanTypeName(firstPart)
      const udtDoc = this.docsManager.getMap('UDT').get(udtOrEnumNameCandidate)
      if (udtDoc && udtDoc.fields) {
        currentTypeName = udtOrEnumNameCandidate
        currentLibId = udtDoc.libId
        currentMembers = udtDoc.fields
        currentNamespaceForCompletionDoc = firstPart // Namespace is the UDT name
        isCurrentSourceEnum = false
      } else {
        const enumDoc = this.docsManager.getMap('enums').get(udtOrEnumNameCandidate)
        if (enumDoc && enumDoc.members) {
          currentTypeName = udtOrEnumNameCandidate // This is an Enum
          currentLibId = enumDoc.libId
          currentMembers = enumDoc.members // Suggest enum members
          currentNamespaceForCompletionDoc = firstPart // Namespace is the Enum name
          isCurrentSourceEnum = true
        }
      }
    }

    // Iteratively resolve path segments for nested UDTs
    // parts are [ "varOrUdtName", "field1", "field2", "partialOrEmpty" ]
    // Loop from the first field access (index 1) up to the part *before* the partial/empty last part.
    for (let i = 1; i < parts.length - 1; i++) {
      if (!currentMembers) { // If previous segment didn't resolve to an object with members
        currentTypeName = null; currentLibId = undefined; break;
      }
      const segmentName = parts[i]
      // We are looking for `segmentName` within `currentMembers` (which are fields of the parent UDT).
      const foundField = currentMembers.find((f: any) => f.name === segmentName)

      if (foundField && foundField.type) {
        const fieldActualType = this.cleanTypeName(foundField.type)
        // A field's type must resolve to another UDT to have further .field access
        const nestedTypeDef = this.docsManager.getMap('UDT').get(fieldActualType)
        if (nestedTypeDef && nestedTypeDef.fields) {
          currentTypeName = fieldActualType // The type of the current field, which is a UDT
          currentMembers = nestedTypeDef.fields // These are the members for the *next* segment's lookup
          currentLibId = nestedTypeDef.libId // LibId of this nested UDT
          currentNamespaceForCompletionDoc = `${currentNamespaceForCompletionDoc}.${segmentName}`
        } else {
          // Field's type isn't a UDT with fields, so path ends here for further dot access.
          currentTypeName = null; currentMembers = null; currentLibId = undefined; break;
        }
      } else {
        // Segment (field) not found in parent UDT, or field has no type. Path ends.
        currentTypeName = null; currentMembers = null; currentLibId = undefined; break;
      }
    }

    const partialNameAfterLastDot = parts[parts.length - 1]

    // If currentMembers are resolved (we have fields/enum members to suggest for the final part of the path)
    if (currentMembers) {
      for (const member of currentMembers) { // member is a field or enum member object
        if (partialNameAfterLastDot && !member.name.toLowerCase().startsWith(partialNameAfterLastDot.toLowerCase())) {
          continue
        }

        let memberKind = 'Field';
        let memberType = member.type;
        let isConstMember = member.isConst;
        let memberDefaultValue = member.default;

        if (isCurrentSourceEnum) {
          memberKind = 'EnumMember';
          memberType = currentTypeName || undefined; // Type of an enum member is effectively the enum itself
          isConstMember = true; // Enum members are always constants
          memberDefaultValue = member.value; // Enum members have 'value'
        } else {
          // For UDT fields, kind is 'Field', type is member.type, isConst is member.isConst, default is member.default
          // These are already correctly assigned by initialization from `member`.
        }

        completions.push({
          name: member.name,
          doc: member,
          namespace: currentNamespaceForCompletionDoc,
          kind: memberKind,
          type: memberType,
          description: member.desc,
          libId: member.libId || currentLibId,
          isConst: isConstMember,
          default: memberDefaultValue,
        })
      }
      // If UDT/Enum path yielded results, return them.
      // Avoid falling through to built-in namespace logic if we found UDT/Enum fields/members.
      if (completions.length > 0) {
        return completions;
      }
    }

    // Fallback for built-in namespaces (e.g. color.red, math.abs)
    // This should only trigger if the UDT/Enum path resolution above yielded no completions.
    // And typically, these are direct lookups like `namespace.member`, so `parts.length === 2`.
    if (parts.length === 2 && completions.length === 0) {
      const namespaceForBuiltins = parts[0]
      const partialNameForBuiltins = parts[1]
      const lowerNamespaceForBuiltins = namespaceForBuiltins.toLowerCase()
      const constantsMap = this.docsManager.getMap('constants')

      for (const [constName, constDoc] of constantsMap.entries()) {
        // Check if constant belongs to the namespace (e.g. constDoc.namespace === 'color')
        // OR if the constant name itself is fully qualified (e.g. constName === 'color.red' and has no explicit namespace property)
        if (
          (constDoc.namespace === namespaceForBuiltins ||
           (constName.startsWith(namespaceForBuiltins + '.') && constDoc.namespace === undefined))
        ) {
          // If constDoc.namespace exists, memberName is just constDoc.name.
          // If not, and constName is "namespace.member", then memberName is "member".
          const memberName = constDoc.namespace ? constDoc.name : constName.substring(namespaceForBuiltins.length + 1);

          if (memberName.toLowerCase().startsWith(partialNameForBuiltins.toLowerCase())) {
            completions.push({
              name: memberName,
              doc: constDoc,
              namespace: namespaceForBuiltins,
              isConst: true,
              kind: constDoc.kind || 'Constant',
              type: constDoc.type,
              default: constDoc.syntax || constDoc.name, // Original logic preferred syntax
              description: constDoc.desc,
              libId: constDoc.libId,
            })
          }
        }
      }
      // Check methods (static-like methods on built-in namespaces, e.g., math.abs)
      const methodsMap = this.docsManager.getMap('methods', 'methods2')
      for (const [methodFullName, methodDoc] of methodsMap.entries()) {
        if (
          typeof methodFullName === 'string' &&
          methodDoc.isMethod && // Ensure it's a method
          methodFullName.startsWith(namespaceForBuiltins + '.') // e.g., "math.abs" starts with "math."
        ) {
          const methodRelativeName = methodFullName.substring(namespaceForBuiltins.length + 1)
          if (methodRelativeName.toLowerCase().startsWith(partialNameForBuiltins.toLowerCase())) {
            completions.push({
              name: methodRelativeName + '()', // Add () for methods
              doc: methodDoc,
              namespace: namespaceForBuiltins,
              isMethod: true,
              kind: methodDoc.kind || 'Method', // Default to 'Method' if not specified
              type: methodDoc.type, // Return type of the method
              description: methodDoc.desc,
              libId: methodDoc.libId,
              args: methodDoc.args,
              returnTypes: methodDoc.returnedTypes,
              thisType: methodDoc.thisType,
            })
          }
        }
      }
    }
    return completions
  }

  /**
   * Retrieves argument suggestions for a specific function/method based on the provided docs.
   * Assumes the input `argDocs` is the list of argument documentation objects
   * for the function currently being called.
   * Filters based on existing arguments already typed on the line prefix.
   */
  getArgumentCompletions(argDocs: any[], linePrefix: string): CompletionDoc[] {
    const completions: CompletionDoc[] = []
    if (!argDocs || argDocs.length === 0) {
      return []
    }

    const existingFields = new Set<string>()
    // Find already typed named arguments (e.g., `color=`, `style=`)
    // Use a more robust regex to find named args within the current function call scope.
    // This requires sophisticated parsing to know the current call scope, which is hard with just `linePrefix`.
    // Assuming `linePrefix` is text up to cursor within the argument list.
    // Regex finds `word = ` before the cursor.
    const namedArgMatch = linePrefix.match(/(\w+)\s*=\s*[^,\)]*$/) // Matches `argName = value_part_being_typed`
    const lastCommaMatch = linePrefix.lastIndexOf(',')
    const openParenMatch = linePrefix.lastIndexOf('(')
    const lastDelimiterPos = Math.max(lastCommaMatch, openParenMatch)
    const argsText = lastDelimiterPos >= 0 ? linePrefix.substring(lastDelimiterPos + 1) : linePrefix // Text after last ( or ,

    // Find all already-typed named arguments in the current arg list context
    const existingNamedArgsMatch = argsText.matchAll(/(\w+)\s*=/g)
    for (const match of existingNamedArgsMatch) {
      if (match && match[1]) {
        existingFields.add(match[1]) // Add the name (LHS of =)
      }
    }

    // Find the partial text being typed for the current argument
    const partialMatchInCurrentArg = argsText.match(/(\w*)$/)
    const lowerPartialText = partialMatchInCurrentArg ? partialMatchInCurrentArg[1].toLowerCase() : ''

    let index = 0 // For sorting suggestions in order of definition
    for (const argDoc of argDocs) {
      // argDoc format is expected to be like {name: 'series', type: 'series float'}, or {name: 'title=', type: 'string', default: "Plot", kind: 'Parameter'}
      const argName = argDoc.name?.replace('=', '')?.trim() // The base name (e.g., 'title' from 'title=')

      // Skip if this named argument already exists
      if (argName && existingFields.has(argName)) {
        continue
      }

      // If the user is typing something, filter suggestions by the typed text.
      // This applies to both named argument suggestions ('title=') and value suggestions ('color.red').
      const suggestionText = argDoc.name || '' // Text to suggest ('title=' or 'color.red')
      if (lowerPartialText && !suggestionText.toLowerCase().startsWith(lowerPartialText)) {
        continue // Skip if suggestion doesn't start with typed text
      }

      // Decide the display name and insert text.
      // For named args like {name: 'title='}, suggestionText is 'title='. This is the insert text.
      // For positional args or value suggestions like {name: 'color.red'}, suggestionText is 'color.red'. This is the insert text.
      // For positional args like {name: 'series', type: 'series float'}, the user needs to type a *value*.
      // We might need to suggest common values or variables of the correct type.
      // The current argDocs format seems to mix positional argument names and named argument suggestions/values.
      // argDoc is now a rich object: { name, displayType, desc, required, etc. }
      const argNameForSuggestion = `${argDoc.name}=` // Suggest named arguments like "length="

      // Filter if the user is already typing a named argument
      if (lowerPartialText && !argNameForSuggestion.toLowerCase().startsWith(lowerPartialText)) {
        continue
      }

      completions.push({
        name: argNameForSuggestion, // e.g., "length="
        doc: argDoc, // The full argument object from function definition
        namespace: null,
        kind: 'Parameter', // Or "NamedArgument"
        type: argDoc.displayType, // Use displayType
        description: argDoc.desc, // Use desc from arg object
        // libId: argDoc.libId, // Not typically applicable to individual args unless they are complex types from libs
        // args: undefined, // Arguments don't have their own args
        // returnTypes: undefined, // Arguments don't have returnTypes
        // fields: undefined, // Arguments are not UDTs/Enums themselves (usually)
        // required: argDoc.required, // Store required status, CompletionProvider can use this
        sortText: `order${index.toString().padStart(4, '0')}`,
      })
      index++
    }
    return completions
  }

  /**
   * Attempts to find the documentation for a function, method, or UDT constructor
   * by its name (which could be simple like "plot" or namespaced like "array.push" or "MyType.new").
   * This is useful for providers (like Signature Help or Inline Completion context detection)
   * that need the full documentation for a known callable.
   * @param name The name of the function, method (namespace.name), or UDT constructor (UDT.new).
   * @returns The documentation object if found, otherwise undefined.
   */
  getFunctionDocs(name: string): any | undefined {
    if (!name) {
      return undefined;
    }

    const searchName = name.replace(/\(\)$/, ''); // Remove () if present

    // 1. Check `functions`, `functions2`, `completionFunctions` maps first.
    //    These maps might contain explicitly defined functions by a linter,
    //    including UDT constructors formatted as regular functions (e.g., "MyType.new").
    let funcDoc = this.docsManager.getMap('functions', 'functions2', 'completionFunctions').get(searchName);
    if (funcDoc) {
      funcDoc.args = Array.isArray(funcDoc.args) ? funcDoc.args : [];
      if (!funcDoc.kind) { // Set kind if not already defined by linter
        if (searchName.endsWith('.new')) {
          funcDoc.kind = 'Constructor';
        } else if (!searchName.includes('.')) {
          funcDoc.kind = 'Function';
        } else {
          // If it has a dot but isn't .new, it's likely a namespaced function/method.
          // This path is less likely if methods are primarily in method maps.
          funcDoc.kind = 'Method';
        }
      }
      return funcDoc;
    }

    // 2. If not found as a regular function AND it's a ".new" syntax,
    //    attempt to synthesize its signature from a UDT definition.
    if (searchName.endsWith('.new')) {
      const udtName = searchName.slice(0, -'.new'.length);
      // UDTs are typically in 'UDT' map, but 'types' can also be a source.
      const udtDoc = this.docsManager.getMap('UDT', 'types').get(udtName);

      if (udtDoc && Array.isArray(udtDoc.fields)) { // Ensure udtDoc exists and has fields
        const constructorArgs = udtDoc.fields.map((field: any) => {
          // A field is considered required if it does not have a default value.
          const isRequired = field.default === undefined || field.default === null;
          return {
            name: field.name,
            type: field.type || 'any', // Default to 'any' if type is missing
            displayType: field.type || 'any', // For now, displayType is same as type
            desc: field.desc || `Field ${field.name}.`, // Default description if missing
            default: field.default, // The default value itself
            required: isRequired,
            // isConst: field.isConst, // Store if needed for docs, not a typical arg property
          };
        });

        // Synthesize a syntax string for display, e.g., "MyUDT.new(field1: type, field2: type = defaultVal)"
        const argsString = constructorArgs
            .map((arg: any) => {
                let argStr = `${arg.name}: ${arg.type}`;
                if (arg.default !== undefined && arg.default !== null) {
                    // Handle string defaults needing quotes if not already quoted by parser
                    if (typeof arg.default === 'string' && !(arg.default.startsWith("'") && arg.default.endsWith("'")) && !(arg.default.startsWith('"') && arg.default.endsWith('"'))) {
                        argStr += ` = '${arg.default.replace(/'/g, "\\'")}'`; // Proper single quote escaping
                    } else {
                        argStr += ` = ${arg.default}`;
                    }
                }
                return argStr;
            })
            .join(', ');
        const synthesizedSyntax = `${searchName}(${argsString})`;

        return {
          name: searchName, // Full name like "MyUDT.new"
          kind: 'Constructor',
          desc: udtDoc.desc || `Constructs a new instance of ${udtName}.`, // UDT's main description
          args: constructorArgs,
          returnTypes: [udtName], // Constructor returns an instance of the UDT
          libId: udtDoc.libId, // Library ID if the UDT is from a library
          syntax: synthesizedSyntax, // The generated syntax string
          originalName: udtDoc.originalName ? `${udtDoc.originalName}.new` : searchName, // Original name of the UDT for reference
        };
      }
      // If udtDoc or udtDoc.fields is not found, this path won't return, allowing fallback to method maps.
    }

    // 3. Check `methods`, `methods2` maps if not found yet.
    //    This primarily catches actual methods but could also include ".new" if defined as a method.
    funcDoc = this.docsManager.getMap('methods', 'methods2').get(searchName);
    if (funcDoc) {
      funcDoc.args = Array.isArray(funcDoc.args) ? funcDoc.args : [];
      if (!funcDoc.kind) { // Set kind if not already defined
        if (searchName.endsWith('.new')) {
          funcDoc.kind = 'Constructor';
        } else {
          funcDoc.kind = 'Method';
        }
      }
      return funcDoc;
    }

    return undefined; // Not found in any map or synthesis path
  }
}
