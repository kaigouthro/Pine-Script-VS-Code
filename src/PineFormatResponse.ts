import { Class } from './PineClass'
import * as vscode from 'vscode'

/**
 * Class representing the PineResponseFlow for tracking changes in PineScript response.
 */
export class PineResponseFlow {
  static docLength: number | null = null
  static docChange: boolean | null = null

  /**
   * Resets the docLength.
   */
  static resetDocChange() {
    PineResponseFlow.docChange = null
  }
}

/** Class for formatting the linting response
 * This class will take the linting response and format it into a usable format
 * @param response - the linting response
 */
export class PineFormatResponse {
  response: any = {}
  confirmed: string[] = []

  /** Gets the library data from the linting response
   * This function will get the lib data from the linting response and set it in the pineFetchLibData object
   * @returns void */
  getLibData() {
    const libIds = this.response.imports?.map((imp: any) => {
      const { libId = '', alias = '' } = imp
      return { id: libId, alias: alias, script: '' }
    })
    if (libIds) {
      Class.PineParser?.setLibIds(libIds)
    }
  }

  /**
   * Adds aliases to the pineDocsManager based on imports in the response.
   * This function adds aliases to the pineDocsManager object based on imports in the response.
   */
  setAliases() {
    const aliases = this.response?.imports?.map((imp: any) => imp.alias)
    if (aliases) {
      Class.PineDocsManager.setImportAliases = [...aliases]
    }
  }

  /**
   * Checks whether the code conversion should run based on changes in the response.
   * This function determines whether the code conversion should run based on changes in the response.
   *
   * @returns A set of flags indicating which parts of the response have changed.
   */
  shouldRunConversion() {
    this.confirmed = []

    const editor = vscode.window.activeTextEditor
    const docLength = editor?.document.getText()?.length ?? -1

    if (PineResponseFlow.docLength !== docLength || PineResponseFlow.docChange === null) {
      PineResponseFlow.docLength = docLength
      PineResponseFlow.docChange = true
      return true
    } else {
      PineResponseFlow.docChange = false
      return false
    }
  }

  /**
   * Set imports in PineDocsManager.
   */
  setImports() {
    const imports = this.response?.imports ?? []
    if (PineResponseFlow.docChange && imports.length > 0) {
      Class.PineDocsManager.setImportDocs(imports)
    }
  }

  /**
   * Set functions in PineDocsManager.
   */
  setFunctions() {
    const functions = this.response?.functions || []
    const methods: any[] = [{ docs: [] }]
    const funcs: any[] = [{ docs: [] }]
    const funcsCompletions: any[] = [{ docs: [] }]

    for (const func of functions) {
      const funcCopy: Record<string, any> = {
        name: func.name,
        libId: func.libId,
        args: func.args || [],
        returnedTypes: func.returnedTypes || [],
        desc: Array.isArray(func.desc) ? func.desc.join('\n') : func.desc,
        syntax: Array.isArray(func.syntax) ? func.syntax.join('\n') : func.syntax,
        isCompletion: true, // Assuming all functions from this new source are completable
      }

      if (func.thisType) {
        funcCopy.isMethod = true
        funcCopy.thisType = func.thisType
        funcCopy.kind = func.libId ? `Method from ${func.libId}` : 'Local Method'
        // Ensure 'name' is the method name for methods2Docs keying if PineDocsManager expects that
        // For methods, syntax might already be in a suitable format or might need specific parsing if PineDocsManager relies on it.
        // The old logic used a regex for methodName, if func.name is already the method name, it's simpler.
        methods[0].docs.push(funcCopy)
      } else if (func.name && func.name.includes('.new')) {
        funcCopy.kind = func.libId ? `Constructor from ${func.libId}` : 'UDT Constructor'
        // Add to general functions and completion functions
        funcs[0].docs.push(funcCopy)
        funcsCompletions[0].docs.push(funcCopy)
      } else {
        funcCopy.kind = func.libId ? `Function from ${func.libId}` : 'Function'
        funcs[0].docs.push(funcCopy)
        funcsCompletions[0].docs.push(funcCopy)
      }
    }

    if (PineResponseFlow.docChange && functions.length > 0) {
      Class.PineDocsManager.setDocs('completionFunctions', funcsCompletions)
      Class.PineDocsManager.setDocs('functions2', funcs)
      Class.PineDocsManager.setDocs('methods2', methods)
    }
  }

  /**
   * Set variables in PineDocsManager.
   */
  setVariables() {
    const variables = this.response?.variables || []
    const formattedVariables: any[] = [{ docs: [] }]

    for (const variable of variables) {
      formattedVariables[0].docs.push({
        name: variable.name,
        type: variable.type,
        definition: variable.definition,
        scopeId: variable.scopeId,
        kind: 'Variable', // Potentially add scope or type info here: e.g. `Variable (local)` or `Variable (type: ${variable.type})`
        // desc: variable.desc, // If description is available
      })
    }

    if (PineResponseFlow.docChange && variables.length > 0) {
      Class.PineDocsManager.setDocs('variables2', formattedVariables)
    }
  }

  /**
   * Set user-defined types and fields in PineDocsManager.
   */
  setUDT() {
    const types = this.response?.types || []
    const fieldsCollection: Record<string, any>[] = [{ docs: [] }]
    const udtCollection: Record<string, any>[] = [{ docs: [] }]

    for (const typeDef of types) {
      const udtDoc: Record<string, any> = {
        name: typeDef.name,
        libId: typeDef.libId,
        fields: [], // Will be populated by processed field objects
        desc: typeDef.desc,
        kind: typeDef.libId ? `UDT from ${typeDef.libId}` : 'UDT',
        // syntax: `type ${typeDef.name}` // Basic syntax, can be expanded
      }

      let udtSyntax = [`type ${typeDef.name}`]
      if (typeDef.fields) {
        for (const field of typeDef.fields) {
          const fieldDoc = {
            name: field.name,
            type: field.type,
            desc: field.desc,
            parent: typeDef.name, // Link field to its parent UDT
            libId: typeDef.libId, // Carry over libId for context
            kind: `${typeDef.name} Property`,
            syntax: `${field.name}: ${field.type}`, // Simplified syntax
          }
          udtDoc.fields.push(fieldDoc) // Add processed field to UDT doc
          fieldsCollection[0].docs.push(fieldDoc) // Add to global fields collection
          udtSyntax.push(`    ${field.name}: ${field.type}`)
        }
      }
      udtDoc.syntax = udtSyntax.join('\n')
      udtCollection[0].docs.push(udtDoc)
    }

    if (PineResponseFlow.docChange && types.length > 0) {
      Class.PineDocsManager.setDocs('fields2', fieldsCollection)
      Class.PineDocsManager.setDocs('UDT', udtCollection)
    }
  }

  /**
   * Set enums in PineDocsManager.
   */
  setEnums() {
    const enums = this.response?.enums || []
    const enumCollection: Record<string, any>[] = [{ docs: [] }]
    // Potentially a separate collection for enum members if they need to be globally searchable for completions like fields.
    // const enumMemberCollection: Record<string, any>[] = [{ docs: [] }];

    for (const enumDef of enums) {
      const enumDoc: Record<string, any> = {
        name: enumDef.name,
        libId: enumDef.libId,
        members: [], // Will be populated by processed member objects
        desc: enumDef.desc,
        kind: enumDef.libId ? `Enum from ${enumDef.libId}` : 'Enum',
        // syntax: `enum ${enumDef.name}` // Basic syntax
      }

      let enumSyntax = [`enum ${enumDef.name}`];
      if (enumDef.fields) { // Assuming 'fields' holds enum members based on plan
        for (const member of enumDef.fields) {
          const memberDoc = {
            name: member.name,
            title: member.title, // Or use name if title isn't always present
            desc: member.desc,
            parentEnum: enumDef.name,
            libId: enumDef.libId,
            kind: 'Enum Member',
            // syntax: `${member.name}`, // Syntax for enum member
          }
          enumDoc.members.push(memberDoc)
          // If enum members should be globally completable (e.g. MyEnum.MEMBER_NAME)
          // enumMemberCollection[0].docs.push(memberDoc);
          enumSyntax.push(`    ${member.name}${member.title ? ` // ${member.title}` : ''}`)
        }
      }
      enumDoc.syntax = enumSyntax.join('\n');
      enumCollection[0].docs.push(enumDoc)
    }

    if (PineResponseFlow.docChange && enums.length > 0) {
      // This assumes PineDocsManager has a way to handle 'enums' or a generic symbol type
      Class.PineDocsManager.setDocs('enums', enumCollection)
      // If enum members are stored separately for completion:
      // Class.PineDocsManager.setDocs('enumMembers', enumMemberCollection);
    }
  }

  /**
   * Format the linting response and update PineDocsManager.
   * @param {any} response - The linting response to format.
   */
  async format(response: any) {
    if (response) {
      if (response?.result.errors2 || response?.result.errors) {
        Class.PineParser.parseDoc()
        return null
      }

      this.response = response.result
    }
    if (this.shouldRunConversion()) {
      this.setAliases()
      this.setImports()
      this.setFunctions()
      this.setVariables()
      this.setUDT()
      this.setEnums() // Call the new setEnums method
      this.getLibData()
      Class.PineParser.parseDoc()
      Class.PineParser.parseLibs()
    }

    return this.confirmed
  }
}
