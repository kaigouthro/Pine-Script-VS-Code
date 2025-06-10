import { Class } from './index'
import { Helpers } from './PineHelpers'
import { VSCode } from './VSCode'

export class PineParser {
  changes: number | undefined
  libs: any
  libIds: any[] = []
  parsedLibsFunctions: any = {}
  parsedLibsUDT: any = {}

  // Refactored regular expressions with named capture groups for better readability and maintainability

  /**
   * Type Definition Pattern
   * Parses User-Defined Types (UDTs) and Enums.
   * - udtGroup: The overall capture for a type or enum definition.
   * - annotationsGroup: Captures block annotations like `//@type`, `//@field`, `//@enum`.
   * - exportKeyword: Captures the optional `export` keyword.
   * - keyword: Captures `type` or `enum`.
   * - name: The UDT or enum name (e.g., `MyType`, `MyEnum`).
   * - fieldsGroup: Captures the body/content of the UDT or enum (members/fields).
   * - Lookahead `(?=(?:\b|^\/\/\s*@|(?:^\/\/[^@\n]*?$)+|$))`: Defines the end of the UDT/enum block.
   *   It stops parsing the current block when it encounters:
   *     - A word boundary on a new line (signaling start of new, unrelated code or end of file context).
   *     - A new `@` annotation line (e.g., `//@function`, `//@type`).
   *     - A comment line that does not start with an `@` annotation.
   *     - The end of the file/string.
   */
  typePattern: RegExp =
    /(?<udtGroup>(?<annotationsGroup>(?:^\/\/\s*(?:@(?:type|field|enum)[^\n]*\n))+)?(?<exportKeyword>export)?\s*(?<keyword>type|enum)\s*(?<name>\w+)\n(?<fieldsGroup>(?:(?:\s+[^\n]+(?:\n+|$))|\s*\n)*?))(?=(?:\b|^\/\/\s*@|(?:^\/\/[^@\n]*?$)+|$))/gm

  /**
   * Fields Pattern (within Type Definition for UDTs)
   * Parses individual field lines within a User-Defined Type (UDT).
   * Key parts:
   * - Optional `const` keyword.
   * - Type detection:
   *   - Handles simple types (e.g., `int`, `float`, `string`, `bool`, `color`).
   *   - Handles generic types like `array<type>`, `array<type,type>`, `matrix<type>`, `map<keyType,valueType>`.
   *     - `genericType1`, `genericType2`: Capture generic parameters.
   *   - `fieldType`: Captures the base type if not a collection type.
   *   - `isArray`: Captures `[]` for array shorthand.
   * - `fieldName`: The name of the field.
   * - Optional default value detection:
   *   - `defaultValueSingleQuote`, `defaultValueDoubleQuote`: String defaults.
   *   - `defaultValueNumber`: Numeric defaults (integers, floats, scientific notation).
   *   - `defaultValueColor`: Color literal defaults (e.g., `#FF0000`).
   *   - `defaultValueIdentifier`: Identifier defaults (e.g., `na`, `true`, another const variable).
   */
  fieldsPattern: RegExp =
    /^\s+(?<isConst>const\s+)?(?:(?:(?:(array|matrix|map)<(?<genericTypes>(?<genericType1>([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*)),)?(?<genericType2>([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*)))>)|(?<fieldType>([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*))((?<isArray>\[\])?)\s+)?(?<fieldName>[a-zA-Z_][a-zA-Z0-9_]*)(?:(?=\s*=\s*)(?:(?<defaultValueSingleQuote>'.*')|(?<defaultValueDoubleQuote>".*")|(?<defaultValueNumber>\d*(\.(\d+[eE]?\d+)?\d*|\d+))|(?<defaultValueColor>#[a-fA-F0-9]{6,8})|(?<defaultValueIdentifier>([a-zA-Z_][a-zA-Z_0-9]*\.)*[a-zA-Z_][a-zA-Z0-9_]*)))?$/gm

  // Enum Member Pattern (Relatively simple, inline comments suffice)
  // Captures:
  // - memberAnnotations: Comments directly above the member.
  // - memberName: The name of the enum member.
  // - memberValue: Optional value assigned to the enum member.
  enumMemberPattern: RegExp = /^\s*(?<memberAnnotations>(?:\/\/\s*.*\n\s*)*)?(?<memberName>\w+)(?:\s*=\s*(?<memberValue>.*?))?\s*(?:,|$)/gm

  /**
   * Function Definition Pattern
   * Parses function definitions, including user-defined functions and methods.
   * - docstring: Captures function documentation comments starting with `//@function` or `//@f`.
   * - exportKeyword: Captures the optional `export` keyword.
   * - methodKeyword: Captures the optional `method` keyword (for UDT methods).
   * - functionName: Captures simple (e.g., `myFunc`) or dot-separated names (e.g., `MyType.new`, `namespace.myFunc`).
   * - parameters: Captures the content within the function's parentheses (arguments).
   * - body: Captures the function body (code after `=>`).
   * - Lookahead `(?=^\b|^\/\/\s*\@|$)`: Defines the end of the function block.
   *   It stops parsing the current block when it encounters:
   *     - A word boundary on a new line (signaling start of new, unrelated code or end of file context).
   *     - A new `@` annotation line (e.g., `//@function`, `//@type`).
   *     - The end of the file/string.
   *   (Note: `\b` on a new line `^\b` is a bit unusual; typically `^` implies start of line, and `\b` would be for word boundaries.
   *    The intent is likely to stop before new top-level definitions or significant comment blocks.)
   */
  funcPattern: RegExp =
    /(?<docstring>(?:\/\/\s*@f(?:@?.*\n)+?)?)?(?<exportKeyword>export)?\s*(?<methodKeyword>method)?\s*(?<functionName>\w+(?:\.\w+)*)\s*\(\s*(?<parameters>[^\)]*?)\s*\)\s*?=>\s*?(?<body>(?:(?:.*)(?:\n+|$))+?)(?=^\b|^\/\/\s*@|$)/gm

  // Function Argument Pattern
  funcArgPattern: RegExp =
    /(?:(?<argModifier>simple|series)?\s+?)?(?<argType>[\w\.\[\]]*?|\w+<[^>]+>)\s*(?<argName>\w+)(?:\s*=\s*(?<argDefaultValue>['"]?[^,)\n]+['"]?)|\s*(?:,|\)|$))/g

  // Function Name and Arguments Pattern (currently unused in provided code, but kept for potential future use)
  funcNameArgsPattern: RegExp = /([\w.]+)\(([^)]+)\)/g

  constructor() {
    this.libs = []
  }

  /**
   * Sets the library IDs
   * @param libIds - The library IDs
   */
  setLibIds(libIds: any) {
    if (!Array.isArray(libIds)) {
      console.warn('setLibIds: libIds should be an array, received:', libIds)
      return // Guard clause for input validation
    }
    this.libIds = libIds
  }

  /**
   * Parses the libraries by fetching and then parsing functions and types.
   * Ensures idempotency by checking if libraries are already parsed.
   */
  parseLibs() {
    if (!Array.isArray(this.libIds) || this.libIds.length === 0) {
      return // Guard clause: No libs to parse
    }
    this.callLibParser()
  }

  /**
   * Parses the document in VSCode editor.
   * It retrieves document text and then parses functions and types.
   */
  parseDoc() {
    const editorDoc = VSCode.Text?.replace(/\r\n/g, '\n') ?? ''
    if (!editorDoc) {
      return // Guard clause: No document content to parse
    }
    const document = [{ script: editorDoc }]
    this.callDocParser(document)
  }

  /**
   * Fetches library scripts based on provided library IDs.
   * It avoids redundant fetching of the same library.
   * @returns Array of library objects with id, alias, and script content.
   */
  fetchLibs(): any[] {
    if (!Array.isArray(this.libIds) || this.libIds.length === 0) {
      return [] // Guard clause: No libIds to fetch
    }

    const fetchedLibs: any[] = []

    for (const lib of this.libIds) {
      const { id: libId, alias } = lib
      if (!libId || !alias) {
        console.warn('fetchLibs: Invalid lib object format:', lib)
        continue // Skip invalid lib objects
      }

      const existingLib = this.libs.find((item: any) => item.id === libId && item.alias === alias)
      if (existingLib) {
        fetchedLibs.push(existingLib) // Use existing if already fetched
        continue
      }

      Class.PineRequest.libList(libId)
        .then((response: any) => {
          if (!Array.isArray(response)) {
            console.warn('fetchLibs: Unexpected libList response format:', response)
            return // Skip if response is not an array
          }
          for (const libData of response) {
            if (!libData?.scriptIdPart || !libData?.version) {
              console.warn('fetchLibs: Incomplete libData:', libData)
              return // Skip incomplete libData
            }
            Class.PineRequest.getScript(libData.scriptIdPart, libData.version.replace('.0', ''))
              .then((scriptContent: any) => {
                if (!scriptContent?.source) {
                  console.warn('fetchLibs: No script source in scriptContent:', scriptContent)
                  return // Skip if no script source
                }
                const scriptString = scriptContent.source.replace(/\r\n/g, '\n')
                const libObj = { id: libId, alias: alias, script: scriptString }
                fetchedLibs.push(libObj)
              })
              .catch((scriptError: any) => {
                console.error('fetchLibs: Error fetching script:', scriptError)
              })
          }
        })
        .catch((listError: any) => {
          console.error('fetchLibs: Error fetching lib list:', listError)
        })
    }
    return fetchedLibs
  }

  /**
   * Orchestrates the parsing of fetched libraries.
   * It checks if libraries are already parsed to avoid redundant parsing.
   */
  callLibParser() {
    this.libs = this.fetchLibs()
    if (!Array.isArray(this.libs) || this.libs.length === 0) {
      return // Guard clause: No libraries fetched to parse
    }

    for (const lib of this.libs) {
      if (this.parsedLibsFunctions?.[lib.alias] || this.parsedLibsUDT?.[lib.alias]) {
        continue // Skip if already parsed
      }
      // Pass lib.id as libId, and lib.alias as alias
      const docPayload = { script: lib.script, alias: lib.alias, libId: lib.id };
      this.parseFunctions([docPayload]); // Parse each lib individually
      this.parseTypes([docPayload]);
    }
  }

  /**
   * Orchestrates the parsing of the document content.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  callDocParser(documents: any[]) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return // Guard clause: No documents to parse
    }
    this.parseFunctions(documents)
    this.parseTypes(documents)
  }

  /**
   * Parses functions from the provided documents.
   * Extracts function name, arguments, and body using regex.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  parseFunctions(documents: any[]): any[] { // Added explicit return type
    if (!Array.isArray(documents)) {
      console.error('parseFunctions: Documents must be an array, received:', documents)
      return []; // Return empty array for invalid input
    }

    const parsedFunctions: any[] = []

    for (const doc of documents) {
      const { script, alias, libId } = doc // libId might be undefined for non-library docs
      if (typeof script !== 'string') {
        console.warn('parseFunctions: Script is not a string, skipping:', script)
        continue // Guard clause: Skip non-string scripts
      }

      const functionMatches = script.matchAll(this.funcPattern)

      for (const funcMatch of functionMatches) {
        const { docstring, exportKeyword, methodKeyword, functionName, parameters, body } = funcMatch.groups! // Non-null assertion is safe due to regex match

        const name = (alias ? alias + '.' : '') + functionName
        const functionBuild: any = {
          name: name,
          args: [],
          originalName: functionName,
          body: body,
          doc: docstring, // Store the captured docstring
          kind: 'User Function', // Add a specific kind for user-defined functions
          libraryOrigin: libId || alias || '', // Prefer libId, fallback to alias
        }

        if (exportKeyword) {
          functionBuild.export = true
          functionBuild.kind = 'User Export Function' // More specific kind
        }
        if (methodKeyword) {
          functionBuild.method = true
          functionBuild.kind = 'User Method' // More specific kind
        }

        const funcParamsMatches = parameters.matchAll(this.funcArgPattern)
        for (const paramMatch of funcParamsMatches) {
          const { argModifier, argType: paramType, argName, argDefaultValue } = paramMatch.groups! // Non-null assertion is safe due to regex match

          let resolvedArgType = paramType
          if (!resolvedArgType) {
            const docMatch = Helpers.checkDocsMatch(argDefaultValue ?? '')
            resolvedArgType = docMatch && typeof docMatch === 'string' ? docMatch : resolvedArgType
          }

          const argsDict: Record<string, any> = {
            name: argName,
            required: !argDefaultValue,
          }
          if (argDefaultValue) {
            argsDict.default = argDefaultValue
          }
          if (resolvedArgType) {
            argsDict.type = resolvedArgType
          }
          if (argModifier) {
            argsDict.modifier = argModifier // simple | series
          }
          functionBuild.args.push(argsDict)
        }
        // Parse @param descriptions from docstring
        if (docstring) {
          const lines = docstring.split('\n')
          interface ParsedFunctionArgument {
            name: string
            required: boolean
            default?: string
            type?: string
            modifier?: string
            desc?: string
          }
          functionBuild.args.forEach((arg: ParsedFunctionArgument) => {
            if (arg.name) {
              const paramLineRegex: RegExp = new RegExp(
                `^\\s*\\/\\/\\s*@param\\s+${arg.name}\\s*(?:\\([^)]*\\))?\\s*(.+)`,
                'i',
              )
              for (const line of lines) {
                const match: RegExpMatchArray | null = line.match(paramLineRegex)
                if (match && match[1]) {
                  arg.desc = match[1].trim()
                  break
                }
              }
            }
          })
        }
        parsedFunctions.push(functionBuild)
      }
      if (alias) {
        // Store all functions parsed from this alias (library)
        this.parsedLibsFunctions[alias] = (this.parsedLibsFunctions[alias] || []).concat(parsedFunctions.filter(fn => fn.libraryOrigin === alias));
      }
    }
    // Pass all collected functions from all documents/aliases to PineDocsManager
    // This assumes PineDocsManager can handle functions from multiple origins in one call.
    // If parseFunctions is called per-document (which it is), then parsedFunctions here will only contain funcs from that doc.
    // The accumulation for parsedLibsFunctions[alias] is correct if parseFunctions is called per-library.
    // The final call to setParsed should ideally happen after all documents/libs are processed,
    // or PineDocsManager.setParsed needs to be additive or handle individual document scopes.
    // Given current structure, setParsed is called after each document.
    // Class.PineDocsManager.setParsed(parsedFunctions, 'args') // Refactored to return
    return parsedFunctions; // TEMPORARY REFACTOR FOR TESTING
  }

  /**
   * Parses types (UDTs) from the provided documents.
   * Extracts type name and fields using regex.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  parseTypes(documents: any[]): { udts: any[], enums: any[] } { // Added explicit return type
    if (!Array.isArray(documents)) {
      console.error('parseTypes: Documents must be an array, received:', documents)
      return { udts: [], enums: [] }; // Return empty arrays for invalid input
    }

    const parsedTypes: any[] = []

    for (const doc of documents) {
      const { script, alias, libId } = doc // libId might be undefined
      if (typeof script !== 'string') {
        console.warn('parseTypes: Script is not a string, skipping:', script)
        continue // Guard clause: Skip non-string scripts
      }

      const typeMatches = script.matchAll(this.typePattern)

      for (const typeMatch of typeMatches) {
        const { annotationsGroup, exportKeyword, keyword, name: typeOrEnumName, fieldsGroup } = typeMatch.groups!
        const prefixedName = (alias ? alias + '.' : '') + typeOrEnumName

        if (keyword === 'type') {
          const typeBuild: any = {
            name: prefixedName,
            fields: [],
            originalName: typeOrEnumName,
            kind: 'User Type',
            doc: annotationsGroup || '',
            libraryOrigin: libId || alias || '', // Prefer libId
          }

          if (exportKeyword) {
            typeBuild.export = true
            typeBuild.kind = 'User Export Type'
          }

          if (fieldsGroup) {
            const fieldMatches = fieldsGroup.matchAll(this.fieldsPattern)
            for (const fieldMatch of fieldMatches) {
              const {
                genericTypes,
                isConst,
                genericType1,
                genericType2,
                fieldType,
                isArray,
                fieldName,
                defaultValueSingleQuote,
                defaultValueDoubleQuote,
                defaultValueNumber,
                defaultValueColor,
                defaultValueIdentifier,
              } = fieldMatch.groups!

              let resolvedFieldType = genericTypes
                ? `${fieldMatch[1] /* array|matrix|map */}<${genericType1 || ''}${
                    genericType1 && genericType2 ? ',' : ''
                  }${genericType2 || ''}>`
                : fieldType + (isArray || '')

              const fieldValue =
                defaultValueSingleQuote ||
                defaultValueDoubleQuote ||
                defaultValueNumber ||
                defaultValueColor ||
                defaultValueIdentifier

              const fieldsDict: Record<string, any> = {
                name: fieldName,
                type: resolvedFieldType,
                kind: 'Field',
              }
              if (isConst) {
                fieldsDict.isConst = true
              }
              if (fieldValue) {
                fieldsDict.default = fieldValue
              }

              // Parse @field annotations from annotationsGroup for this specific fieldName
              if (annotationsGroup) {
                const fieldAnnotationRegex = new RegExp(`^//\\s*@field\\s+${fieldName}\\s+(.+)`, 'm');
                const annotationMatch = annotationsGroup.match(fieldAnnotationRegex);
                if (annotationMatch && annotationMatch[1]) {
                  fieldsDict.desc = annotationMatch[1].trim();
                }
              }
              // If no @field annotation, a general comment for the field might be considered later if possible
              // For now, desc will be undefined if no @field is found. Ensure it's at least an empty string.
              if (!fieldsDict.desc) {
                fieldsDict.desc = '';
              }

              typeBuild.fields.push(fieldsDict)
            }
          }
          parsedTypes.push(typeBuild)
        } else if (keyword === 'enum') {
          const enumBuild: any = {
            name: prefixedName,
            members: [],
            originalName: typeOrEnumName,
            kind: 'User Enum',
            doc: annotationsGroup || '',
            libraryOrigin: libId || alias || '', // Prefer libId
          }

          if (exportKeyword) {
            enumBuild.export = true
            enumBuild.kind = 'User Export Enum'
          }

          if (fieldsGroup) {
            const enumMemberMatches = fieldsGroup.matchAll(this.enumMemberPattern)
            for (const memberMatch of enumMemberMatches) {
              const { memberAnnotations, memberName, memberValue } = memberMatch.groups!
              const memberDesc = this.extractLastComment(memberAnnotations)

              const memberDict: Record<string, any> = {
                name: memberName,
                desc: memberDesc || '', // Ensure desc is always present
              }
              // Optional: store memberValue if needed by PineDocsManager
              // if (memberValue) {
              //   memberDict.value = memberValue.trim();
              // }
              enumBuild.members.push(memberDict)
            }
          }
          parsedTypes.push(enumBuild)
        }
      }

      if (alias) {
        // Accumulate UDTs and Enums separately for the alias
        const udtForAlias = parsedTypes.filter(t => t.libraryOrigin === alias && t.kind.includes('Type'));
        const enumsForAlias = parsedTypes.filter(t => t.libraryOrigin === alias && t.kind.includes('Enum'));
        if (udtForAlias.length > 0) {
            this.parsedLibsUDT[alias] = (this.parsedLibsUDT[alias] || []).concat(udtForAlias);
        }
        // Storing enums separately if needed:
        // if (enumsForAlias.length > 0) {
        //   this.parsedLibsEnums = this.parsedLibsEnums || {}; // Ensure initialized
        //   this.parsedLibsEnums[alias] = (this.parsedLibsEnums[alias] || []).concat(enumsForAlias);
        // }
      }
    }

    // Separate UDTs and Enums before sending to PineDocsManager
    const allUDTs = parsedTypes.filter(t => t.kind.includes('Type'));
    const allEnums = parsedTypes.filter(t => t.kind.includes('Enum'));

    if (allUDTs.length > 0) {
      Class.PineDocsManager.setParsed(allUDTs, 'fields'); // For UDTs
    }
    if (allEnums.length > 0) {
      // Assuming PineDocsManager can handle 'members' as a key for enum members,
      // or it internally maps 'fields' to 'members' for enums.
      // Based on subtask: "For Enums, a similar structure for fields or members should hold name and desc."
      // This implies the structure is `members: [{name, desc}]`.
      // If setParsed's second arg is strictly 'fields' or 'args', this needs more thought.
      // For now, let's try to be specific if possible, assuming 'members' might be a valid type key.
      // If not, we might need to pass 'fields' and ensure PineDocsManager handles it.
      // Changing 'members' to 'enums' for a dedicated keyType in PineDocsManager.setParsed
      // Class.PineDocsManager.setParsed(allEnums, 'enums'); // Refactored to return
    }
    return { udts: allUDTs, enums: allEnums }; // TEMPORARY REFACTOR FOR TESTING
  }

  /**
   * Extracts the last non-empty comment line from a block of comments.
   * @param commentBlock The block of comments, with each line starting with //
   * @returns The content of the last relevant comment line, or empty string.
   */
  private extractLastComment(commentBlock: string | undefined | null): string {
    if (!commentBlock) {
      return ''
    }
    const lines = commentBlock.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (line.startsWith('//')) {
        const commentContent = line.substring(2).trim()
        if (commentContent && !commentContent.startsWith('@')) { // Avoid taking annotations like @enum
          return commentContent
        }
      } else if (line) { // Stop if we encounter a non-comment line that has content
        break
      }
    }
    return ''
  }
}
