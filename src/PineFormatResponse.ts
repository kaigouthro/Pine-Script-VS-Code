import { Class } from './PineClass'
import { VSCode } from './VSCode'

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

    const docLength = VSCode.Text?.length ?? -1

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
      const formattedImports = imports.map((imp: any) => ({
        user: imp.user,
        lib: imp.lib,
        alias: imp.alias,
        version: imp.version,
        pinePos: imp.pinePos,
        pinePos2: imp.pinePos2, // Include if present and needed
        docs: imp.metaInfo?.docs, // Extract documentation
        chartId: imp.chartId,
        libId: imp.libId,
        // Add any other fields that PineDocsManager.setImportDocs expects
        // or that are useful for other functionalities.
      }))
      Class.PineDocsManager.setImportDocs(formattedImports)
    }
  }

  /**
   * Set functions in PineDocsManager.
   */
  setFunctions() {
    // New structure directly provides `functions` under `this.response` (which is `response.result`)
    const functions = this.response?.functions ?? []
    const newFuncs: any[] = []
    const newMethods: any[] = []
    // The old code had a separate `funcsCompletions`. We can decide if this is still needed
    // or if `PineDocsManager` can filter based on properties.
    // For now, let's simplify and categorize based on `thisType`.

    for (const func of functions) {
      const funcData: any = {
        name: func.name,
        definition: func.definition,
        libId: func.libId,
        returnedTypes: func.returnedTypes,
        syntax: func.syntax, // This is an array of syntax strings
        desc: func.desc, // Description for the function itself
        args: func.args?.map((arg: any) => ({
          name: arg.name,
          displayType: arg.displayType,
          allowedTypeIDs: arg.allowedTypeIDs,
          required: arg.required,
          desc: arg.desc,
          info: arg.info,
        })),
        thisType: func.thisType, // Array, e.g., ["Lib.DebugUDT"] for methods
      }

      // It's useful to have a primary syntax string for quick display, if possible
      // The old code derived `returnedType` and `methodName` from syntax.
      // The new `syntax` is an array. We might need to pick the first or primary one.
      if (func.syntax && func.syntax.length > 0) {
        const mainSyntax = func.syntax[0]
        const match = /(?:\w+\.)?(\w+)\(.+\u2192\s*(.*)/g.exec(mainSyntax)
        if (match) {
          funcData.returnedType = `\`${match[2]}\`` // Or use func.returnedTypes directly
          if (func.thisType && func.thisType.length > 0) {
            funcData.methodName = match[1]
          }
        }
      }

      // Add kind property for compatibility or new categorization
      // This assumes `func.kind` might exist or can be derived.
      // The old code derived `kind` from `doc.title`. This needs to be adapted.
      // For now, let's assign a generic kind and it can be refined.
      funcData.kind = func.thisType && func.thisType.length > 0 ? 'Method' : 'Function'


      if (func.thisType && func.thisType.length > 0) {
        funcData.isMethod = true
        // funcData.kind = `${func.thisType[0]} Method`; // Example: "Lib.DebugUDT Method"
        newMethods.push(funcData)
      } else {
        funcData.isCompletion = true // Assuming all non-methods can be completions
        newFuncs.push(funcData)
      }
    }

    if (PineResponseFlow.docChange && functions.length > 0) {
      // We need to decide how to pass this to PineDocsManager.
      // The old code used categories like 'completionFunctions', 'functions2', 'methods2'.
      // Let's assume PineDocsManager.setDocs can take an array of these new rich objects.
      // We might need to wrap them in the [{ docs: [...] }] structure if PineDocsManager expects it.

      // For now, passing them directly. This might require PineDocsManager to be adapted.
      // Or, we adapt here to the old structure as much as possible.
      // Let's try to adapt to the old structure for now.
      const funcsForManager = [{ title: 'Functions', docs: newFuncs }]
      const methodsForManager = [{ title: 'Methods', docs: newMethods }]
      // `funcsCompletions` can be the same as `newFuncs` or filtered if necessary
      const funcsCompletionsForManager = [{ title: 'Completion Functions', docs: newFuncs }]


      Class.PineDocsManager.setDocs(funcsCompletionsForManager, 'completionFunctions')
      Class.PineDocsManager.setDocs(funcsForManager, 'functions2')
      Class.PineDocsManager.setDocs(methodsForManager, 'methods2')
    }
  }

  /**
   * Set variables in PineDocsManager.
   */
  setVariables() {
    // New structure directly provides `variables` under `this.response`
    const variables = this.response?.variables ?? []
    const formattedVariables: any[] = []

    for (const variable of variables) {
      const varData: any = {
        name: variable.name,
        definition: variable.definition,
        type: variable.type,
        scopeId: variable.scopeId,
        // The old code derived `kind` from a `title` property within a nested structure.
        // The new structure is flat. We need to determine how 'kind' should be set.
        // For now, let's assign a generic 'Variable' kind.
        // This might need adjustment based on how PineDocsManager uses 'kind'.
        kind: 'Variable', // Or determine from 'type' or other properties if possible
      }
      formattedVariables.push(varData)
    }

    if (PineResponseFlow.docChange && formattedVariables.length > 0) {
      // The old code passed an array of objects, where each object had a `docs` array and a `title`.
      // e.g., [{ title: "User Defined Variables", docs: [...] }]
      // We need to adapt to this structure if PineDocsManager expects it.
      // Let's assume a similar structure for now.
      // The actual title might need to be more specific if available, or a generic one.
      const variablesForManager = [{ title: 'Variables', docs: formattedVariables }]
      Class.PineDocsManager.setDocs(variablesForManager, 'variables2')
    }
  }

  /**
   * Set user-defined types and fields in PineDocsManager.
   */
  setUDT() {
    const types = this.response?.types ?? [] // User Defined Types
    const enums = this.response?.enums ?? [] // Enums

    const allFields: any[] = []
    const allUDTs: any[] = []
    const allEnums: any[] = []

    // Process UDTs
    for (const udt of types) {
      const udtData: any = {
        name: udt.name,
        definition: udt.definition,
        desc: udt.desc, // array
        libId: udt.libId,
        template: udt.template,
        kind: 'User Defined Type', // Or derive from somewhere if available
        fields: [], // To store processed fields
      }

      let udtSyntax = [`type ${udt.name}`]
      if (udt.fields) {
        for (const field of udt.fields) {
          const fieldData = {
            name: field.name,
            type: field.type,
            desc: field.desc, // array
            kind: `${udt.name} Property`,
            parent: udt.name,
            syntax: `${field.name}: ${field.type}`, // Simplified syntax, adjust if needed
          }
          udtData.fields.push(fieldData)
          allFields.push(fieldData)
          udtSyntax.push(`    ${fieldData.syntax}`)
        }
      }
      udtData.syntax = udtSyntax.join('\n')
      allUDTs.push(udtData)
    }

    // Process Enums
    for (const enumType of enums) {
      const enumData: any = {
        name: enumType.name,
        definition: enumType.definition,
        desc: enumType.desc, // array
        libId: enumType.libId,
        kind: 'Enum', // Or derive
        fields: [],
      }

      let enumSyntax = [`enum ${enumType.name}`]
      if (enumType.fields) {
        for (const field of enumType.fields) {
          const fieldData = {
            name: field.name,
            title: field.title, // if present
            desc: field.desc, // array, if present
            kind: `${enumType.name} Value`,
            parent: enumType.name,
            // Enums usually don't have complex syntax for fields, name is often enough
            syntax: field.name,
          }
          enumData.fields.push(fieldData)
          // Enums are typically not added to 'allFields' in the same way UDT fields are,
          // unless PineDocsManager handles them similarly.
          // For now, keeping them separate.
          enumSyntax.push(`    ${field.name}${field.title ? ` (${field.title})` : ''}`)
        }
      }
      enumData.syntax = enumSyntax.join('\n')
      allEnums.push(enumData)
    }

    if (PineResponseFlow.docChange) {
      if (allFields.length > 0) {
        Class.PineDocsManager.setDocs([{ title: 'Fields', docs: allFields }], 'fields2')
      }
      if (allUDTs.length > 0) {
        Class.PineDocsManager.setDocs([{ title: 'User Defined Types', docs: allUDTs }], 'UDT')
      }
      // Need to decide how to store enums. For now, let's assume a new category 'enums'
      // or merge with 'UDT' if their structure for PineDocsManager is similar enough.
      // If PineDocsManager.setDocs expects a similar [{ title: ..., docs: ...}] structure:
      if (allEnums.length > 0) {
        Class.PineDocsManager.setDocs([{ title: 'Enums', docs: allEnums }], 'enums') // Assuming 'enums' is a valid category
      }
    }
  }

  /**
   * Format the linting response and update PineDocsManager.
   * @param {any} response - The linting response to format.
   */
  async format(response: any) {
    if (response && response.success && response.result) {
      // Check for errors and return if any are present
      // TODO: Confirm if errors and warnings are now directly under result
      if (response.result.errors || response.result.warnings) {
        Class.PineParser.parseDoc() // Assuming this handles error display or logging
        return null
      }

      this.response = response.result // All subsequent operations use response.result
    } else {
      // Handle cases where response is not successful or result is missing
      // Potentially log an error or return early
      if (!response?.success) {
        console.error('PineFormatResponse: Received unsuccessful response or missing result.', response)
      }
      return null
    }

    if (this.shouldRunConversion()) {
      // Ensure this.response is now response.result for all set methods
      this.setAliases()
      this.setImports()
      this.setFunctions()
      this.setVariables()
      this.setUDT()
      this.setConsts() // Call the new method
      this.getLibData()
      Class.PineParser.parseDoc()
      Class.PineParser.parseLibs()
    }

    return this.confirmed
  }

  /**
   * Set constants in PineDocsManager.
   */
  setConsts() {
    const constGroups = this.response?.consts ?? [] // This is an array of groups like "User Consts"
    const allConsts: any[] = []

    for (const group of constGroups) {
      // group has properties like docs: [], prefix: "const_var_", title: "User Consts"
      // The actual constants are in group.docs
      if (group.docs) {
        for (const constant of group.docs) {
          // Assuming constant object has name, type, desc, etc.
          // We need to know the exact structure of these constant objects.
          // Based on `Lib.VERSION` example, it might be similar to functions/variables.
          // Let's assume a structure like: { name: string, type: string, desc?: string[], definition?: any }
          // This is a guess and might need refinement based on actual data.
          const constData: any = {
            name: constant.name, // Example: "Lib.VERSION" or just "VERSION" if prefix is used
            type: constant.type, // What is the type? e.g. "string", "integer"
            desc: constant.desc, // Description array
            definition: constant.definition, // If available
            // The 'kind' could be derived from group.title or a generic 'Constant'
            kind: group.title ? group.title.replace(/s$/, '') : 'Constant', // e.g. "User Const"
            prefix: group.prefix, // e.g., "const_var_"
          }
          allConsts.push(constData)
        }
      }
    }

    if (PineResponseFlow.docChange && allConsts.length > 0) {
      // Storing in PineDocsManager. Using 'constants' as the category.
      // This might need to be 'constants2' or a new specific category.
      // Adapting to the [{ title: ..., docs: ... }] structure:
      // We could group them by their original group.title or put all in one.
      // For now, let's put all in one with a generic title.
      Class.PineDocsManager.setDocs([{ title: 'Constants', docs: allConsts }], 'constants')
    }
  }
}
