// In PineDocsManager.ts

import * as fs from 'fs'
import * as path from 'path'

/**
 * PineDocsManager handles the management of Pine documentation.
 * It loads, retrieves, and sets various types of documentation-related data.
 */
export class PineDocsManager {
  /** index signature */
  [key: string]: any

  docAliases: string[] = [
    'box',
    'table',
    'line',
    'label',
    'linefill',
    'array',
    'map',
    'matrix',
    'polyline',
    'chart.point',
  ]

  importAliases: string[] = []
  aliases: string[] = []
  Docs: Record<string, any>
  importsDocs: Record<string, any>[]
  typesDocs: Record<string, any>[]
  methodsDocs: Record<string, any>[]
  methods2Docs: Record<string, any>[]
  UDTDocs: Record<string, any>[]
  fieldsDocs: Record<string, any>[]
  fields2Docs: Record<string, any>[]
  controlsDocs: Record<string, any>[]
  variablesDocs: Record<string, any>[]
  variables2Docs: Record<string, any>[]
  constantsDocs: Record<string, any>[]
  functionsDocs: Record<string, any>[]
  functions2Docs: Record<string, any>[]
  completionFunctionsDocs: Record<string, any>[]
  enumsDocs: Record<string, any>[] = [] // Added for enums
  annotationsDocs: Record<string, any>[]
  cleaned = false

  /**
   * Constructor for PineDocsManager class. It initializes class properties and loads
   * documentation from 'pineDocs.json' into the Docs property.
   */
  constructor() {
    // Reading the pineDocs.json file to initialize the documentation object.
    this.Docs = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'Pine_Script_Documentation', 'pineDocs.json'), 'utf-8'),
    )
    this.UDTDocs = []
    this.importsDocs = []
    this.fields2Docs = []
    this.methods2Docs = []
    this.variables2Docs = []
    this.functions2Docs = []
    this.completionFunctionsDocs = []
    this.enumsDocs = [] // Initialize enumsDocs
    this.typesDocs = this.Docs.types[0].docs
    this.fieldsDocs = this.Docs.fields[0].docs
    this.methodsDocs = this.Docs.methods[0].docs
    this.controlsDocs = this.Docs.controls[0].docs
    this.variablesDocs = this.Docs.variables[0].docs
    this.constantsDocs = this.Docs.constants[0].docs
    this.functionsDocs = this.Docs.functions[0].docs
    this.annotationsDocs = this.Docs.annotations[0].docs
  }

  /**
   * Retrieves the types documentation.
   * @returns The types documentation.
   */
  getTypes(): Record<string, any>[] {
    return this.typesDocs
  }

  /**
   * Retrieves the imports documentation.
   * @returns The imports documentation.
   */
  getImports(): Record<string, any>[] {
    return this.importsDocs
  }

  /**
   * Retrieves the methods documentation.
   * @returns The methods documentation.
   */
  getMethods(): Record<string, any>[] {
    return this.methodsDocs
  }

  /**
   * Retrieves the second set of methods documentation.
   * @returns The second set of methods documentation.
   */
  getMethods2(): Record<string, any>[] {
    return this.methods2Docs
  }

  /**
   * Retrieves the controls documentation.
   * @returns The controls documentation.
   */
  getControls(): Record<string, any>[] {
    return this.controlsDocs
  }

  /**
   * Retrieves the variables documentation.
   * @returns The variables documentation.
   */
  getVariables(): Record<string, any>[] {
    return this.variablesDocs
  }

  /**
   * Retrieves the second set of variables documentation.
   * @returns The second set of variables documentation.
   */
  getVariables2(): Record<string, any>[] {
    return this.variables2Docs
  }

  /**
   * Retrieves the constants documentation.
   * @returns The constants documentation.
   */
  getConstants(): Record<string, any>[] {
    return this.constantsDocs
  }

  /**
   * Retrieves the functions documentation.
   * @returns The functions documentation.
   */
  getFunctions(): Record<string, any>[] {
    return this.functionsDocs
  }

  /**
   * Retrieves the second set of functions documentation.
   * @returns The second set of functions documentation.
   */
  getFunctions2(): Record<string, any>[] {
    return this.functions2Docs
  }

  /**
   * Retrieves the completion functions documentation.
   * @returns The completion functions documentation.
   */
  getCompletionFunctions(): Record<string, any>[] {
    return this.completionFunctionsDocs
  }

  /**
   * Retrieves the annotations documentation.
   * @returns The annotations documentation.
   */
  getAnnotations(): Record<string, any>[] {
    return this.annotationsDocs
  }

  /**
   * Retrieves the UDT (User-Defined Types) documentation.
   * @returns The UDT documentation.
   */
  getUDT(): Record<string, any>[] {
    return this.UDTDocs
  }

  /**
   * Retrieves the fields documentation.
   * @returns The fields documentation.
   */
  getFields(): Record<string, any>[] {
    return this.fieldsDocs
  }

  /**
   * Retrieves the second set of fields documentation.
   * @returns The second set of fields documentation.
   */
  getFields2(): Record<string, any>[] {
    return this.fields2Docs
  }

  /**
   * Retrieves the typedocs for the getSwitch function.
   * @param key - The key to switch on.
   * @returns The typedocs for the getSwitch function.
   */
  getSwitch(key: string): Record<string, any>[] {
    switch (key) {
      case 'types':
        return this.getTypes()
      case 'imports':
        return this.getImports()
      case 'methods':
        return this.getMethods()
      case 'methods2':
        return this.getMethods2()
      case 'controls':
        return this.getControls()
      case 'variables':
        return this.getVariables()
      case 'variables2':
        return this.getVariables2()
      case 'constants':
        return this.getConstants()
      case 'functions':
        return this.getFunctions()
      case 'functions2':
        return this.getFunctions2()
      case 'completionFunctions':
        return this.getCompletionFunctions()
      case 'annotations':
        return this.getAnnotations()
      case 'UDT':
        return this.getUDT()
      case 'fields':
        return this.getFields()
      case 'fields2':
        return this.getFields2()
      case 'enums': // Added for enums
        return this.enumsDocs
      default:
        return []
    }
  }

  /**
   * Sets the typedocs for the setSwitch function.
   * @param key - The key to switch on.
   * @param docs - The docs to set.
   * @returns The typedocs for the setSwitch function.
   */
  setSwitch(key: string, docs: any) {
    switch (key) {
      case 'types':
        this.typesDocs = docs
        break
      case 'imports':
        this.importsDocs = docs
        break
      case 'methods':
        this.methodsDocs = docs
        break
      case 'methods2':
        this.methods2Docs = docs
        break
      case 'controls':
        this.controlsDocs = docs
        break
      case 'variables':
        this.variablesDocs = docs
        break
      case 'variables2':
        this.variables2Docs = docs
        break
      case 'constants':
        this.constantsDocs = docs
        break
      case 'functions':
        this.functionsDocs = docs
        break
      case 'functions2':
        this.functions2Docs = docs
        break
      case 'completionFunctions':
        this.completionFunctionsDocs = docs
        break
      case 'annotations':
        this.annotationsDocs = docs
        break
      case 'UDT':
        this.UDTDocs = docs
        break
      case 'fields':
        this.fieldsDocs = docs
        break
      case 'fields2':
        this.fields2Docs = docs
        break
      case 'enums': // Added for enums
        this.enumsDocs = docs
        break
    }
  }

  /**
   * Returns a Map where the key is the 'name' property from the docs and the value is the doc object
   * @param keys - The keys to get the map for.
   * @returns The map.
   */
  getMap(...keys: string[]): Map<string, any> {
    // Changed value type to any
    try {
      const docs = this.getDocs(...keys)
      const outMap: Map<string, any> = this.makeMap(docs) // Changed value type to any
      return outMap ?? new Map() // Return new Map() in case of null or undefined
    } catch (error) {
      console.error(error)
      return new Map()
    }
  }

  /**
   * the makeMap function is used to make a map for a given key
   * @param docs - The docs to make the map for.
   * @returns The map.
   */
  makeMap(docs: any[]): Map<string, any> {
    // Changed value type to any
    try {
      const entries: [string, any][] = docs.flatMap((doc: any) => {
        // Changed value type to any
        if (doc?.name) {
          return [[doc.name, doc] as [string, any]] // Changed value type to any
        } else {
          return []
        }
      })
      const outMap: Map<string, any> = new Map(entries) // Changed value type to any
      return outMap
    } catch (error) {
      console.error(error)
      return new Map()
    }
  }

  /**
   * the getDocs function is used to get the docs for a given key
   * @param keys - The keys to get the docs for.
   * @returns The docs.
   */
  getDocs(...keys: string[]) {
    try {
      let result: any = []
      for (let key of keys) {
        const docsForKey = this.getSwitch(key)
        if (Array.isArray(docsForKey)) {
          if (/unctions/.test(key)) {
            docsForKey.filter((doc: any) => !doc?.isMethod)
          } else if (/methods/.test(key)) {
            docsForKey.filter((doc: any) => doc?.isMethod)
          }

          result = [...result, ...docsForKey]
        } else {
          // Handle the case where docsForKey is not an array
          console.error(`Expected an array for key ${key}, but got:`, docsForKey)
          // Depending on your needs, you might throw an error, continue, or apply a default value
        }
      }
      return [...new Set(result)]
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * the setImportDocs function is used to set the imports key of the response object
   * @param docs - The docs to set.
   * @returns The key.
   */
  setImportDocs(docs: any) {
    this.importsDocs = docs
  }

  /**
   * the setParsed function is used to set the parsed docs for a given key
   * @param docs - The docs to set.
   * @param keyType - The key type to set the docs for.
   */
  setParsed(docs: any[], keyType: string) {
    try {
      if (keyType === 'args' || keyType === 'fields') {
        const keysToUpdate = keyType === 'args' ? ['functions2', 'methods2', 'completionFunctions'] : ['UDT']

        for (const k of keysToUpdate) {
          const currentMap = this.getMap(k)

          for (const doc of docs) {
            const { name } = doc
            let currentDocEntry = currentMap.get(name)

            if (currentDocEntry) {
              // Update existing entry
              currentDocEntry.kind = doc.kind || currentDocEntry.kind
              currentDocEntry.body = doc.body || currentDocEntry.body
              currentDocEntry.doc = doc.doc || currentDocEntry.doc

              if (doc.export !== undefined) {
                currentDocEntry.export = doc.export
              }
              if (doc.method !== undefined) {
                currentDocEntry.method = doc.method
              }
              if (doc.libId !== undefined) {
                currentDocEntry.libId = doc.libId
              }

              // Merge arguments or fields
              const membersKey = keyType // 'args' or 'fields'
              if (doc[membersKey] && doc[membersKey].length > 0) {
                if (!Array.isArray(currentDocEntry[membersKey])) {
                  currentDocEntry[membersKey] = []
                }
                for (let parsedMember of doc[membersKey]) {
                  const memberName = parsedMember.name
                  let currentMember = currentDocEntry[membersKey].find((m: any) => m.name === memberName)

                  if (currentMember) {
                    currentMember.type = parsedMember.type || currentMember.type
                    currentMember.kind = parsedMember.kind || currentMember.kind
                    if (parsedMember.default !== undefined) {
                      currentMember.default = parsedMember.default
                    }
                    if (parsedMember.isConst !== undefined) {
                      currentMember.isConst = parsedMember.isConst
                    }
                    if (parsedMember.desc !== undefined) {
                        currentMember.desc = parsedMember.desc
                    }
                    if (keyType === 'args') {
                      currentMember.required = parsedMember.required !== undefined ? parsedMember.required : currentMember.required
                      if (parsedMember.modifier) {
                        currentMember.modifier = parsedMember.modifier
                      }
                    }
                  } else {
                    currentDocEntry[membersKey].push(parsedMember)
                  }
                }
              }
              currentMap.set(name, currentDocEntry)
            } else {
              // Add new entry if it doesn't exist
              currentMap.set(name, doc)
            }
          }
          this.setDocs([{ docs: Array.from(currentMap.values()) }], k)
        }
      } else if (keyType === 'enum_members') {
        const key = 'enums' // Target 'this.enumsDocs'
        const currentEnumMap = this.getMap(key)

        for (const enumDoc of docs) {
          const { name, members } = enumDoc
          let currentEnumEntry = currentEnumMap.get(name)

          if (currentEnumEntry) {
            // Update existing enum entry
            currentEnumEntry.kind = enumDoc.kind || currentEnumEntry.kind
            currentEnumEntry.doc = enumDoc.doc || currentEnumEntry.doc // Assuming enums might have docstrings
            if (enumDoc.export !== undefined) {
              currentEnumEntry.export = enumDoc.export
            }
            if (enumDoc.libId !== undefined) {
                currentEnumEntry.libId = enumDoc.libId
            }
            currentEnumEntry.originalName = enumDoc.originalName || currentEnumEntry.originalName


            // Merge members
            if (members && members.length > 0) {
              if (!Array.isArray(currentEnumEntry.members)) {
                currentEnumEntry.members = []
              }
              const existingMembersMap = new Map(currentEnumEntry.members.map((m: any) => [m.name, m]))

              for (const newMember of members) {
                let existingMember = existingMembersMap.get(newMember.name)
                if (existingMember) {
                  // Update existing member
                  existingMember.kind = newMember.kind || existingMember.kind
                  if (newMember.value !== undefined) {
                    existingMember.value = newMember.value
                  }
                  // Add other properties if enums members can have them (e.g., docstrings per member)
                  // if (newMember.doc !== undefined) { existingMember.doc = newMember.doc; }
                } else {
                  // Add new member
                  currentEnumEntry.members.push(newMember)
                }
              }
            }
            currentEnumMap.set(name, currentEnumEntry)
          } else {
            // Add new enum entry if it doesn't exist
            currentEnumMap.set(name, enumDoc)
          }
        }
        // Save the updated enum map
        this.setDocs([{ docs: Array.from(currentEnumMap.values()) }], key)
      } else if (keyType === 'variables') {
        const key = 'variables2' // Target 'this.variables2Docs'
        const currentMap = this.getMap(key) // Get existing script variables

        for (const variableDoc of docs) {
          const { name } = variableDoc
          let currentDocEntry = currentMap.get(name)

          if (currentDocEntry) {
            // Update existing variable entry
            currentDocEntry.kind = variableDoc.kind || currentDocEntry.kind
            currentDocEntry.type = variableDoc.type || currentDocEntry.type
            currentDocEntry.doc = variableDoc.doc || currentDocEntry.doc // If variables can have docstrings
            if (variableDoc.libId !== undefined) {
              currentDocEntry.libId = variableDoc.libId
            }
            if (variableDoc.originalName !== undefined) {
              currentDocEntry.originalName = variableDoc.originalName
            }
            // Add any other properties that might be relevant for variables
            currentMap.set(name, currentDocEntry)
          } else {
            // Add new variable entry if it doesn't exist
            currentMap.set(name, variableDoc)
          }
        }
        // Save the updated variables map
        this.setDocs([{ docs: Array.from(currentMap.values()) }], key)
      }
    } catch (error) {
      console.error('Error in setParsed:', error)
    }
  }

  /**
   * the setDocs function is used to set the docs for a given key
   * @param newDocs - The new docs to set.
   * @param key - The key to set the docs for.
   * @returns The key.
   */
  setDocs(newDocs: any, key: string) {
    try {
      const currentDocs: any[] = this.getSwitch(key)
      const mergedDocs = this.mergeDocs(currentDocs, newDocs)
      this.setSwitch(key, mergedDocs)
    } catch (error) {
      console.error(error)
    }
  }

  /**
   * Helper function to merge new docs into current docs
   * @param currentDocs - The current docs.
   * @param newDocs - The new docs.
   * @returns The merged docs.
   */
  // Helper function to merge new docs into current docs
  mergeDocs(currentDocs: any[], newDocs: any[]): any[] {
    try {
      if (!newDocs || newDocs.length === 0) {
        // No new docs to merge, return the original list
        return currentDocs
      }

      const docMap = new Map<string, any>()

      // 1. Add all current docs to a map, keyed by name.
      for (const doc of currentDocs) {
        if (doc?.name) {
          docMap.set(doc.name, doc)
        }
      }

      // 2. Iterate through the new docs.
      //    Update existing entries in the map or add new ones.
      for (const docContainer of newDocs) {
        // docContainer is expected to be like { docs: [...] }
        if (Array.isArray(docContainer.docs)) {
          for (const newDoc of docContainer.docs) {
            if (newDoc?.name) {
              const oldDoc = docMap.get(newDoc.name)
              if (oldDoc) {
                // If doc exists, merge by overwriting old properties with new ones
                docMap.set(newDoc.name, { ...oldDoc, ...newDoc })
              } else {
                // If it's a completely new doc, add it
                docMap.set(newDoc.name, newDoc)
              }
            }
          }
        } else {
          console.warn(`Expected an array for doc.docs, but received: ${typeof docContainer.docs}`, 'mergeDocs')
        }
      }

      // 3. Convert the map values back to an array.
      return Array.from(docMap.values())
    } catch (error) {
      console.error(error)
      return currentDocs // Return original docs on error
    }
  }

  /**
   * the setImportAliases function is used to set the imported namespace aliases
   * @param aliases - The aliases to set.
   */
  set setImportAliases(aliases: string[]) {
    this.importAliases = aliases
  }

  /**
   * the getAliases function is used to get the aliases for the current document
   * @returns The aliases.
   */
  get getAliases() {
    return [...this.docAliases, ...this.importAliases]
  }

  /**
   * the cleanDocs function is used to clean the docs
   * @returns The cleaned docs.
   */
  cleanDocs() {
    const docs = ['methods2', 'variables2', 'completionFunctions', 'functions2', 'UDT', 'fields2', 'enums'] // Added 'enums'
    for (const doc of docs) {
      this.setSwitch(doc, [])
    }
  }

  /**
   * Retrieves function documentation by name from 'completionFunctions' map.
   * @param functionName - The name of the function to retrieve documentation for.
   * @returns The function documentation if found, otherwise undefined.
   */
  getFunctionDocs(functionName: string): any | undefined {
    const functionMap = this.getMap('completionFunctions') // Access the completionFunctions map

    if (!functionMap) {
      return undefined // Handle case where map is not yet initialized or empty
    }

    const lowerFunctionName = functionName.toLowerCase()

    for (const [name, doc] of functionMap.entries()) {
      if (name.toLowerCase() === lowerFunctionName) {
        return doc // Return the documentation object if function name matches
      }
    }
    return undefined // Return undefined if function is not found
  }
}
