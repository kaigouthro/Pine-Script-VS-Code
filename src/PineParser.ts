import { Class } from './index'
import { Helpers } from './PineHelpers'
import * as vscode from 'vscode'

export class PineParser {
  changes: number | undefined
  libs: any
  libIds: any[] = []
  // parsedLibsFunctions: any = {} // Superseded by lint service
  // parsedLibsUDT: any = {} // Superseded by lint service
  // parsedEnums: any = {} // Superseded by lint service
  // parsedVariables: any = {} // This internal state might be redundant if PineDocsManager is the sole source of truth.

  // Variable Declaration Pattern - Superseded by lint service
  // variableDeclarationPattern: RegExp = /(?:(?<varKeyword>var)\s+)?(?:(?<explicitType>[a-zA-Z_]\w*(?:\[\])?(?:<[a-zA-Z_]\w*(?:,\s*[a-zA-Z_]\w*)*>)?)\s+)?(?<variableName>[a-zA-Z_]\w*)\s*=\s*(?<assignmentValue>.*?)(?:\s*;|$)/gm

  // UDT Constructor Regex (for type inference) - Superseded by lint service
  // udtConstructorPattern: RegExp = /(?<udtName>[a-zA-Z_]\w*)\.new\s*\(/

  // Array new with type Regex (for type inference) - Superseded by lint service
  // arrayNewWithTypePattern: RegExp = /array\.new<(?<arrayType>[a-zA-Z_]\w*)>\s*\(/

  // Enum Definition Pattern - Superseded by lint service
  // enumPattern: RegExp =
  //   /(?<exportKeyword>export\s+)?enum\s+(?<enumName>\w+)\s*\{(?<membersBlock>[^}]*)\}/gm

  // Enum Member Pattern - Superseded by lint service
  // enumMemberPattern: RegExp =
  //   /\s*(?<memberName>\w+)\s*(?:=\s*(?<memberValue>"[^"]*"|'[^']*'|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*))?\s*,?/gm

  // Refactored regular expressions with named capture groups for better readability and maintainability - Superseded by lint service
  // Type Definition Pattern - Superseded by lint service
  // typePattern: RegExp =
  //   /(?<udtGroup>(?<annotationsGroup>(?:^\/\/\s*(?:@(?:type|field)[^\n]*\n))+)?(?<udtExportKeyword>export)?\s*(type)\s*(?<typeName>\w+)\n(?<fieldsGroup>(?:(?:\s+[^\n]+)\n+|\s*\n)+))(?=(?:\b|^\/\/\s*@|(?:^\/\/[^@\n]*?$)+|$))/gm

  // Fields Pattern within Type Definition - Superseded by lint service
  // fieldsPattern: RegExp =
  //   /^\s+(?<isConst>const\s+)?(?:(?:(?:(array|matrix|map)<(?<genericTypes>(?<genericType1>([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*)),)?(?<genericType2>([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*)))>)|(?<fieldType>([a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*))((?<isArray>\[\])?)\s+)?(?<fieldName>[a-zA-Z_][a-zA-Z0-9_]*)(?:(?=\s*=\s*)(?:(?<defaultValueSingleQuote>'.*')|(?<defaultValueDoubleQuote>".*")|(?<defaultValueNumber>\d*(\.(\d+[eE]?\d+)?\d*|\d+))|(?<defaultValueColor>#[a-fA-F0-9]{6,8})|(?<defaultValueIdentifier>([a-zA-Z_][a-zA-Z_0-9]*\.)*[a-zA-Z_][a-zA-Z0-9_]*)))?$/gm

  // Function Definition Pattern - Superseded by lint service
  // funcPattern: RegExp =
  //   /(?<docstring>(?:\/\/\s*@f(?:@?.*\n)+?)?)?(?<exportKeyword>export)?\s*(?<methodKeyword>method)?\s*(?<functionName>\w+)\s*\(\s*(?<parameters>[^\)]+?)\s*\)\s*?=>\s*?(?<body>(?:.*\n+)+?)(?=^\b|^\/\/\s*\@|$)/gm

  // Function Argument Pattern - Superseded by lint service
  // funcArgPattern: RegExp =
  //   /(?:(?<argModifier>simple|series)?\s+?)?(?<argType>[\w\.\[\]]*?|\w+<[^>]+>)\s*(?<argName>\w+)(?:\s*=\s*(?<argDefaultValue>['"]?[^,)\n]+['"]?)|\s*(?:,|\)|$))/g

  // Function Name and Arguments Pattern (currently unused in provided code, but kept for potential future use) - Superseded by lint service
  // funcNameArgsPattern: RegExp = /([\w.]+)\(([^)]+)\)/g

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
    const editor = vscode.window.activeTextEditor
    const editorDoc = editor?.document.getText()?.replace(/\r\n/g, '\n') ?? ''
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
    this.libs = this.fetchLibs() // Fetching libs might still be relevant for other purposes or if lint needs source.
    if (!Array.isArray(this.libs) || this.libs.length === 0) {
      return // Guard clause: No libraries fetched to parse
    }

    // All parsing calls below are commented out as their functionality is superseded by lint service
    // for (const lib of this.libs) {
      // if (this.parsedLibsFunctions?.[lib.alias] || this.parsedLibsUDT?.[lib.alias]) {
      //   continue // Skip if already parsed
      // }
      // this.parseFunctions([lib]) // Parse each lib individually
      // this.parseTypes([lib])
      // this.parseEnums([lib])
      // this.parseVariableDeclarations([lib])
    // }
  }

  /**
   * Orchestrates the parsing of the document content.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  callDocParser(documents: any[]) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return // Guard clause: No documents to parse
    }
    // All parsing calls below are commented out as their functionality is superseded by lint service
    // this.parseFunctions(documents)
    // this.parseTypes(documents)
    // this.parseEnums(documents)
    // this.parseVariableDeclarations(documents)
  }

  /**
   * Parses functions from the provided documents.
   * Extracts function name, arguments, and body using regex.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  parseFunctions(documents: any[]) { // Superseded by lint service
    // if (!Array.isArray(documents)) {
    //   console.error('parseFunctions: Documents must be an array, received:', documents)
    //   return // Guard clause: Validate documents input
    // }
    // const parsedFunctions: any[] = []
    // for (const doc of documents) {
    //   const { script, alias } = doc
    //   if (typeof script !== 'string') {
    //     console.warn('parseFunctions: Script is not a string, skipping:', script)
    //     continue // Guard clause: Skip non-string scripts
    //   }
    //   const functionMatches = script.matchAll(this.funcPattern)
    //   for (const funcMatch of functionMatches) {
    //     const { docstring, exportKeyword, methodKeyword, functionName, parameters, body } = funcMatch.groups! // Non-null assertion is safe due to regex match
    //     const name = (alias ? alias + '.' : '') + functionName
    //     const functionBuild: any = {
    //       name: name,
    //       args: [],
    //       originalName: functionName,
    //       body: body,
    //       doc: docstring, // Store the captured docstring
    //       kind: 'User Function', // Add a specific kind for user-defined functions
    //     }
    //     if (exportKeyword) {
    //       functionBuild.export = true
    //       functionBuild.kind = 'User Export Function' // More specific kind
    //     }
    //     if (methodKeyword) {
    //       functionBuild.method = true
    //       functionBuild.kind = 'User Method' // More specific kind
    //     }
    //     if (alias) {
    //       functionBuild.libId = alias;
    //     }
    //     const funcParamsMatches = parameters.matchAll(this.funcArgPattern)
    //     for (const paramMatch of funcParamsMatches) {
    //       const { argModifier, argType: paramType, argName, argDefaultValue } = paramMatch.groups! // Non-null assertion is safe due to regex match
    //       let resolvedArgType = paramType
    //       if (!resolvedArgType) {
    //         const docMatch = Helpers.checkDocsMatch(argDefaultValue ?? '')
    //         resolvedArgType = docMatch && typeof docMatch === 'string' ? docMatch : resolvedArgType
    //       }
    //       const argsDict: Record<string, any> = {
    //         name: argName,
    //         required: !argDefaultValue,
    //       }
    //       if (argDefaultValue) {
    //         argsDict.default = argDefaultValue
    //       }
    //       if (resolvedArgType) {
    //         argsDict.type = resolvedArgType
    //       }
    //       if (argModifier) {
    //         argsDict.modifier = argModifier // simple | series
    //       }
    //       functionBuild.args.push(argsDict)
    //     }
    //     // Parse @param descriptions from docstring
    //     if (docstring) {
    //       const lines = docstring.split('\n')
    //       interface ParsedFunctionArgument {
    //         name: string
    //         required: boolean
    //         default?: string
    //         type?: string
    //         modifier?: string
    //         desc?: string
    //       }
    //       functionBuild.args.forEach((arg: ParsedFunctionArgument) => {
    //         if (arg.name) {
    //           const paramLineRegex: RegExp = new RegExp(
    //             `^\\s*\\/\\/\\s*@param\\s+${arg.name}\\s*(?:\\([^)]*\\))?\\s*(.+)`, // Existing regex, seems fine
    //             'i',
    //           )
    //           for (const line of lines) {
    //             const match: RegExpMatchArray | null = line.match(paramLineRegex)
    //             if (match && match[1]) {
    //               arg.desc = match[1].trim() // Store description
    //               break
    //             }
    //           }
    //         }
    //       })
    //     }
    //     parsedFunctions.push(functionBuild)
    //   }
    //   if (alias) {
    //     this.parsedLibsFunctions[alias] = parsedFunctions
    //   }
    // }
    // Class.PineDocsManager.setParsed(parsedFunctions, 'args') // Superseded by lint service
  }

  /**
   * Parses types (UDTs) from the provided documents.
   * Extracts type name and fields using regex.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  parseTypes(documents: any[]) { // Superseded by lint service
    // if (!Array.isArray(documents)) {
    //   console.error('parseTypes: Documents must be an array, received:', documents)
    //   return // Guard clause: Validate documents input
    // }
    // const parsedTypes: any[] = []
    // for (const doc of documents) {
    //   const { script, alias } = doc
    //   if (typeof script !== 'string') {
    //     console.warn('parseTypes: Script is not a string, skipping:', script)
    //     continue // Guard clause: Skip non-string scripts
    //   }
    //   const typeMatches = script.matchAll(this.typePattern)
    //   for (const typeMatch of typeMatches) {
    //     const { annotationsGroup, udtExportKeyword, typeName, fieldsGroup } = typeMatch.groups!
    //     const name = (alias ? alias + '.' : '') + typeName
    //     const typeBuild: any = {
    //       name: name,
    //       fields: [],
    //       originalName: typeName,
    //       kind: 'User Type', // Assign kind
    //       doc: annotationsGroup || '', // Store docstring
    //     }
    //     if (alias) {
    //       typeBuild.libId = alias;
    //     }
    //     if (udtExportKeyword) {
    //       typeBuild.export = true
    //       typeBuild.kind = 'User Export Type' // More specific kind
    //     }
    //     if (fieldsGroup) {
    //       const fieldMatches = fieldsGroup.matchAll(this.fieldsPattern)
    //       for (const fieldMatch of fieldMatches) {
    //         const {
    //           genericTypes,
    //           isConst, // New capture group
    //           genericType1,
    //           genericType2,
    //           fieldType,
    //           isArray,
    //           fieldName,
    //           defaultValueSingleQuote,
    //           defaultValueDoubleQuote,
    //           defaultValueNumber,
    //           defaultValueColor,
    //           defaultValueIdentifier,
    //         } = fieldMatch.groups!
    //         let resolvedFieldType = genericTypes
    //           ? `${fieldMatch[1] /* array|matrix|map */}<${genericType1 || ''}${
    //               genericType1 && genericType2 ? ',' : ''
    //             }${genericType2 || ''}>`
    //           : fieldType + (isArray || '')
    //         // Prepend 'const ' if isConst is captured
    //         // resolvedFieldType = isConst ? `const ${resolvedFieldType}` : resolvedFieldType;
    //         // No, we store isConst separately. Type itself remains 'string', not 'const string'.
    //         const fieldValue =
    //           defaultValueSingleQuote ||
    //           defaultValueDoubleQuote ||
    //           defaultValueNumber ||
    //           defaultValueColor ||
    //           defaultValueIdentifier
    //         const fieldsDict: Record<string, any> = {
    //           name: fieldName,
    //           type: resolvedFieldType,
    //           kind: 'Field',
    //         }
    //         if (isConst) {
    //           fieldsDict.isConst = true
    //         }
    //         if (fieldValue) {
    //           fieldsDict.default = fieldValue
    //         }
    //         if (alias) {
    //           fieldsDict.libId = alias;
    //         }
    //         if (annotationsGroup) {
    //           const fieldAnnotationRegex = new RegExp(`^\\s*\\/\\/\\s*@field\\s+${fieldName}\\s+(.+)`, 'i');
    //           const annotationLines = annotationsGroup.split('\n');
    //           for (const line of annotationLines) {
    //             const match = line.match(fieldAnnotationRegex);
    //             if (match && match[1]) {
    //               fieldsDict.desc = match[1].trim();
    //               break;
    //             }
    //           }
    //         }
    //         typeBuild.fields.push(fieldsDict)
    //       }
    //     }
    //     parsedTypes.push(typeBuild)
    //   }
    //   if (alias) {
    //     this.parsedLibsUDT[alias] = parsedTypes
    //   }
    // }
    // Class.PineDocsManager.setParsed(parsedTypes, 'fields') // Superseded by lint service
  }

  /**
   * Parses enums from the provided documents.
   * Extracts enum name and members using regex.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  parseEnums(documents: any[]) { // Superseded by lint service
    // if (!Array.isArray(documents)) {
    //   console.error('parseEnums: Documents must be an array, received:', documents)
    //   return // Guard clause: Validate documents input
    // }
    // const allParsedEnums: any[] = []
    // for (const doc of documents) {
    //   const { script, alias } = doc
    //   if (typeof script !== 'string') {
    //     console.warn('parseEnums: Script is not a string, skipping:', script)
    //     continue // Guard clause: Skip non-string scripts
    //   }
    //   const enumMatches = script.matchAll(this.enumPattern)
    //   const parsedEnumsArray: any[] = []
    //   for (const enumMatch of enumMatches) {
    //     const { exportKeyword, enumName, membersBlock } = enumMatch.groups!
    //     const name = (alias ? alias + '.' : '') + enumName
    //     const enumBuild: any = {
    //       name: name,
    //       originalName: enumName,
    //       kind: exportKeyword ? 'UserExportEnum' : 'UserEnum',
    //       members: [],
    //     }
    //     if (alias) {
    //       enumBuild.libId = alias
    //     }
    //     if (membersBlock) {
    //       const memberMatches = membersBlock.matchAll(this.enumMemberPattern)
    //       for (const memberMatch of memberMatches) {
    //         const { memberName, memberValue } = memberMatch.groups!
    //         const memberDict: any = {
    //           name: memberName,
    //           kind: 'EnumMember',
    //         }
    //         if (memberValue) {
    //           // Attempt to infer type of memberValue
    //           if ((memberValue.startsWith('"') && memberValue.endsWith('"')) || (memberValue.startsWith("'") && memberValue.endsWith("'"))) {
    //             memberDict.value = memberValue.slice(1, -1) // Store string without quotes
    //           } else if (!isNaN(parseFloat(memberValue)) && isFinite(memberValue as any)) {
    //             memberDict.value = parseFloat(memberValue) // Store as number
    //           } else if (memberValue === 'true' || memberValue === 'false') {
    //             memberDict.value = memberValue === 'true' // Store as boolean
    //           } else {
    //             memberDict.value = memberValue // Store as is (identifier or other)
    //           }
    //         }
    //         enumBuild.members.push(memberDict)
    //       }
    //     }
    //     parsedEnumsArray.push(enumBuild)
    //   }
    //   if (alias) {
    //     this.parsedEnums[alias] = parsedEnumsArray
    //   }
    //   allParsedEnums.push(...parsedEnumsArray)
    // }
    // Class.PineDocsManager.setParsed(allParsedEnums, 'enum_members') // Superseded by lint service
  }

  /**
   * Parses variable declarations from the provided documents.
   * Extracts variable name, explicit type, and attempts basic type inference.
   * @param documents - An array of documents to parse, each with a 'script' property.
   */
  parseVariableDeclarations(documents: any[]) { // Superseded by lint service
    // if (!Array.isArray(documents)) {
    //   console.error('parseVariableDeclarations: Documents must be an array, received:', documents)
    //   return
    // }
    // const allParsedVariables: any[] = []
    // for (const doc of documents) {
    //   const { script, alias } = doc
    //   if (typeof script !== 'string') {
    //     console.warn('parseVariableDeclarations: Script is not a string, skipping:', script)
    //     continue
    //   }
    //   const lines = script.split('\n');
    //   for (const line of lines) {
    //     const variableMatches = line.matchAll(this.variableDeclarationPattern)
    //     for (const varMatch of variableMatches) {
    //       const { variableName, explicitType, assignmentValue } = varMatch.groups!
    //       let inferredType: string | undefined = explicitType
    //       if (!inferredType && assignmentValue) {
    //         const udtMatch = this.udtConstructorPattern.exec(assignmentValue)
    //         if (udtMatch && udtMatch.groups?.udtName) {
    //           inferredType = udtMatch.groups.udtName
    //         } else {
    //           const arrayMatch = this.arrayNewWithTypePattern.exec(assignmentValue)
    //           if (arrayMatch && arrayMatch.groups?.arrayType) {
    //             inferredType = `array<${arrayMatch.groups.arrayType}>`
    //           } else if (/^".*"$/.test(assignmentValue.trim()) || /^'.*'$/.test(assignmentValue.trim())) {
    //             inferredType = 'string'
    //           } else if (/^true|false$/.test(assignmentValue.trim())) {
    //             inferredType = 'bool'
    //           } else if (/^[\-\+]?(\d+(\.\d*)?|\.\d+)(?:[eE][\-\+]?\d+)?$/.test(assignmentValue.trim())) {
    //             if (/^[\-\+]?\d+$/.test(assignmentValue.trim()) && !assignmentValue.trim().includes('.')) {
    //                 inferredType = 'int';
    //             } else {
    //                 inferredType = 'float';
    //             }
    //           } else if (/^\[.*\]$/.test(assignmentValue.trim())) {
    //             inferredType = 'array';
    //           } else if (/^map\.new<(\w+)\s*,\s*(\w+)>/.test(assignmentValue.trim())) {
    //             const mapTypeMatch = /^map\.new<(?<keyType>\w+)\s*,\s*(?<valueType>\w+)>/.exec(assignmentValue.trim());
    //             if (mapTypeMatch && mapTypeMatch.groups) {
    //               inferredType = `map<${mapTypeMatch.groups.keyType}, ${mapTypeMatch.groups.valueType}>`;
    //             }
    //           }
    //         }
    //       }
    //       if (variableName) {
    //         const variableBuild: any = {
    //           name: (alias ? alias + '.' : '') + variableName,
    //           originalName: variableName,
    //           type: inferredType || 'any',
    //           kind: 'Variable',
    //         }
    //         if (alias) {
    //           variableBuild.libId = alias
    //         }
    //         allParsedVariables.push(variableBuild)
    //       }
    //     }
    //   }
    //   if (alias) {
        // if (!this.parsedVariables[alias]) { // Removed internal aliased storage
        // }
        // this.parsedVariables[alias].push(...allParsedVariables.filter(v => v.libId === alias));
    //   }
    // }
    // const uniqueVariables = Array.from(new Map(allParsedVariables.map(item => [item.name, item])).values());
    // Class.PineDocsManager.setParsed(uniqueVariables, 'variables') // Superseded by lint service
  }
}
