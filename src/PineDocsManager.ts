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

  languageModel: {
    variables: Map<string, any>;
    functions: Map<string, any>; // Stores all functions, methods, constructors
    types: Map<string, any>;     // For UDTs
    enums: Map<string, any>;
    constants: Map<string, any>; // Built-in constants
    imports: Map<string, any>;   // Script imports
    annotations: Map<string, any>; // Script annotations e.g. @version
    controls: Map<string, any>; // Control flow keywords e.g. if, for
    // Add other categories as needed e.g. 'namespaces' for built-in objects like 'math'
  };

  docAliases: string[] = [ // These might be namespaces or types with static-like methods/constants
    'box',
    'table',
    'line',
    'label',
    'linefill',
    'array', // array has methods but is also a type
    'map',   // map has methods but is also a type
    'matrix',// matrix has methods but is also a type
    'polyline',
    'chart.point',
  ];

  importAliases: string[] = []; // Aliases from import statements, e.g. import Lib as MyLib; MyLib is an alias
  // 'aliases' property seems redundant if importAliases covers this. To be reviewed.
  // aliases: string[] = [];

  // Old array properties are removed.
  // Docs: Record<string, any> // Superseded by direct loading into languageModel or specific old arrays if needed for a transition
  // importsDocs: Record<string, any>[] // Will be part of languageModel.imports (Map)
  // typesDocs: Record<string, any>[] // Built-in types, will go to languageModel.types or a dedicated 'builtInTypes' map
  // methodsDocs: Record<string, any>[] // Built-in methods, will go to languageModel.functions with appropriate kind/thisType
  // methods2Docs: Record<string, any>[] // Script methods, will go to languageModel.functions
  // UDTDocs: Record<string, any>[] // Script UDTs, will go to languageModel.types
  // fieldsDocs: Record<string, any>[] // Built-in fields, part of their respective UDT/type in languageModel
  // fields2Docs: Record<string, any>[] // Not needed, fields are part of UDTs
  // controlsDocs: Record<string, any>[] // Built-in controls, will go to languageModel.controls Map
  // variablesDocs: Record<string, any>[] // Built-in variables, will go to languageModel.variables
  // variables2Docs: Record<string, any>[] // Script variables, will go to languageModel.variables
  // constantsDocs: Record<string, any>[] // Built-in constants, will go to languageModel.constants
  // functionsDocs: Record<string, any>[] // Built-in functions, will go to languageModel.functions
  // functions2Docs: Record<string, any>[] // Script functions, will go to languageModel.functions
  // completionFunctionsDocs: Record<string, any>[] // Covered by languageModel.functions
  // enumsDocs: Record<string, any>[] = [] // Script enums, will go to languageModel.enums
  // annotationsDocs: Record<string, any>[] // Script annotations, will go to languageModel.annotations Map
  // cleaned = false; // This was related to clearing old arrays, review its necessity

  /**
   * Constructor for PineDocsManager class. It initializes class properties and loads
   * documentation from 'pineDocs.json' into the Docs property.
   */
  constructor() {
    this.languageModel = {
      variables: new Map<string, any>(),
      functions: new Map<string, any>(),
      types: new Map<string, any>(),
      enums: new Map<string, any>(),
      constants: new Map<string, any>(),
      imports: new Map<string, any>(), // Using Map for imports for quick lookup by alias/path
      annotations: new Map<string, any>(),
      controls: new Map<string, any>(),
    };

    // The direct parsing of this.Docs and population of old arrays is removed.
    // Loading and processing of pineDocs.json will be handled in the next step,
    // populating the new this.languageModel structure.
    // For now, we can read the file, but won't process it in the old way.
    const rawPineDocs = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'Pine_Script_Documentation', 'pineDocs.json'), 'utf-8'),
    );
    this.loadPineDocsJson(rawPineDocs);
  }

  private loadPineDocsJson(rawPineDocs: any): void {
    const categories: (keyof typeof this.languageModel)[] = [
      'variables',
      'functions',
      'types',
      'enums',
      'constants',
      'controls',
      'annotations'
    ];

    for (const category of categories) {
      const docsArray = rawPineDocs[category];
      if (docsArray && Array.isArray(docsArray)) {
        docsArray.forEach((doc: any) => {
          if (doc.name) {
            // Add an 'isBuiltIn' flag to distinguish from lint-sourced items
            doc.isBuiltIn = true;

            // Minor transformations if needed to align with lint structure.
            // For example, if pineDocs.json uses 'desc' but lint uses 'description' primarily for display.
            // For now, assume direct mapping or that downstream consumers (like PineCompletionService)
            // can handle slight variations or that pineDocs.json will be fully aligned.
            if (doc.desc && !doc.description) {
                doc.description = doc.desc;
            }

            // Ensure 'kind' is present, defaulting based on category if missing
            if (!doc.kind) {
                switch (category) {
                    case 'variables': doc.kind = 'Variable'; break;
                    case 'functions': doc.kind = 'Function'; break; // Could be 'Method' if it has 'thisType'
                    case 'types': doc.kind = 'Type'; break; // Or 'UDT' if it represents a UDT-like built-in
                    case 'enums': doc.kind = 'Enum'; break;
                    case 'constants': doc.kind = 'Constant'; break;
                    case 'controls': doc.kind = 'Control'; break;
                    case 'annotations': doc.kind = 'Annotation'; break;
                }
            }
            // If functions from pineDocs.json can be methods, check for 'thisType' or a similar field.
            if (category === 'functions' && (doc.thisType || doc.name.includes('.'))) { // crude check for method
                doc.isMethod = true;
                if (!doc.kind || doc.kind === 'Function') { // Correct kind if it was defaulted to Function
                    doc.kind = 'Method';
                }
            }

            this.languageModel[category].set(doc.name, doc);
          } else {
            console.warn(`PineDocsManager: Document object in category '${category}' from pineDocs.json is missing a 'name'. Skipping.`);
          }
        });
      } else {
        console.warn(`PineDocsManager: Category '${category}' not found or not an array in pineDocs.json.`);
      }
    }

    // Handle 'namespaces' or other specific structures from pineDocs.json if they exist
    // and need to be mapped to languageModel or other properties.
    // For example, if pineDocs.json has a top-level "namespaces" array for things like "math", "color", etc.
    // these might also be treated as 'types' with static members, or 'variables' of a special kind.
    // The current structure assumes they are within 'functions', 'variables', 'constants' with appropriate namespacing in their 'name' field (e.g., "math.abs").
  }

  /**
   * Retrieves the types documentation.
   * @returns The types documentation.
   */
  getTypes(): Record<string, any>[] { // To be refactored or removed
    // return this.typesDocs
    return Array.from(this.languageModel.types.values()).filter(doc => !doc.isUDT && !doc.isEnum); // Example: if types map stores more than just built-in primitive types
  }

  /**
   * Retrieves the imports documentation.
   * @returns The imports documentation.
   */
  getImports(): Record<string, any>[] { // To be refactored or removed
    // return this.importsDocs
    return Array.from(this.languageModel.imports.values());
  }

  /**
   * Retrieves the methods documentation.
   * @returns The methods documentation.
   */
  getMethods(): Record<string, any>[] { // To be refactored or removed
    // return this.methodsDocs
    return Array.from(this.languageModel.functions.values()).filter(fn => fn.isMethod && fn.isBuiltIn); // Example criteria
  }

  /**
   * Retrieves the second set of methods documentation.
   * @returns The second set of methods documentation.
   */
  getMethods2(): Record<string, any>[] { // To be refactored or removed
    // return this.methods2Docs
    return Array.from(this.languageModel.functions.values()).filter(fn => fn.isMethod && !fn.isBuiltIn); // Example criteria
  }

  /**
   * Retrieves the controls documentation.
   * @returns The controls documentation.
   */
  getControls(): Record<string, any>[] { // To be refactored or removed
    // return this.controlsDocs
    return Array.from(this.languageModel.controls.values());
  }

  /**
   * Retrieves the variables documentation.
   * @returns The variables documentation.
   */
  getVariables(): Record<string, any>[] { // To be refactored or removed
    // return this.variablesDocs
    return Array.from(this.languageModel.variables.values()).filter(v => v.isBuiltIn); // Example criteria
  }

  /**
   * Retrieves the second set of variables documentation.
   * @returns The second set of variables documentation.
   */
  getVariables2(): Record<string, any>[] { // To be refactored or removed
    // return this.variables2Docs
    return Array.from(this.languageModel.variables.values()).filter(v => !v.isBuiltIn); // Example criteria
  }

  /**
   * Retrieves the constants documentation.
   * @returns The constants documentation.
   */
  getConstants(): Record<string, any>[] { // To be refactored or removed
    // return this.constantsDocs
    return Array.from(this.languageModel.constants.values());
  }

  /**
   * Retrieves the functions documentation.
   * @returns The functions documentation.
   */
  getFunctions(): Record<string, any>[] { // To be refactored or removed
    // return this.functionsDocs
    return Array.from(this.languageModel.functions.values()).filter(fn => !fn.isMethod && fn.isBuiltIn); // Example criteria
  }

  /**
   * Retrieves the second set of functions documentation.
   * @returns The second set of functions documentation.
   */
  getFunctions2(): Record<string, any>[] { // To be refactored or removed
    // return this.functions2Docs
    return Array.from(this.languageModel.functions.values()).filter(fn => !fn.isMethod && !fn.isBuiltIn); // Example criteria
  }

  /**
   * Retrieves the completion functions documentation.
   * @returns The completion functions documentation.
   */
  getCompletionFunctions(): Record<string, any>[] { // To be refactored or removed
    // return this.completionFunctionsDocs
    return Array.from(this.languageModel.functions.values()); // Or a specific subset
  }

  /**
   * Retrieves the annotations documentation.
   * @returns The annotations documentation.
   */
  getAnnotations(): Record<string, any>[] { // To be refactored or removed
    // return this.annotationsDocs
    return Array.from(this.languageModel.annotations.values());
  }

  /**
   * Retrieves the UDT (User-Defined Types) documentation.
   * @returns The UDT documentation.
   */
  getUDT(): Record<string, any>[] { // To be refactored to use languageModel.types
    // return this.UDTDocs
    return Array.from(this.languageModel.types.values()).filter(t => t.kind === 'User Type' || t.kind === 'UDT'); // Example
  }

  /**
   * Retrieves the fields documentation.
   * @returns The fields documentation.
   */
  getFields(): Record<string, any>[] { // To be refactored or removed; fields are part of types/UDTs
    // return this.fieldsDocs
    const allFields: any[] = [];
    this.languageModel.types.forEach(typeDef => {
      if (typeDef.fields) {
        allFields.push(...typeDef.fields.map((f: any) => ({...f, parentType: typeDef.name})));
      }
    });
    return allFields;
  }

  /**
   * Retrieves the second set of fields documentation.
   * @returns The second set of fields documentation.
   */
  getFields2(): Record<string, any>[] { // To be refactored or removed
    // return this.fields2Docs
    return []; // Likely obsolete as fields are part of UDTs in languageModel.types
  }

  /**
   * Retrieves the typedocs for the getSwitch function.
   * @param key - The key to switch on.
   * @returns The typedocs for the getSwitch function.
   */
  // getSwitch(key: string): Record<string, any>[] { // Superseded by direct languageModel access or refined getMap/getDocs
    // switch (key) {
    //   case 'types':
    //     return this.getTypes()
    //   case 'imports':
    //     return this.getImports()
    //   case 'methods':
    //     return this.getMethods()
    //   case 'methods2':
    //     return this.getMethods2()
    //   case 'controls':
    //     return this.getControls()
    //   case 'variables':
    //     return this.getVariables()
    //   case 'variables2':
    //     return this.getVariables2()
    //   case 'constants':
    //     return this.getConstants()
    //   case 'functions':
    //     return this.getFunctions()
    //   case 'functions2':
    //     return this.getFunctions2()
    //   case 'completionFunctions':
    //     return this.getCompletionFunctions()
    //   case 'annotations':
    //     return this.getAnnotations()
    //   case 'UDT':
    //     return this.getUDT()
    //   case 'fields':
    //     return this.getFields()
    //   case 'fields2':
    //     return this.getFields2()
    //   case 'enums':
    //     return Array.from(this.languageModel.enums.values());
    //   default:
    //     if (this.languageModel[key] instanceof Map) {
    //       return Array.from(this.languageModel[key].values());
    //     }
    //     return []
    // }
  // }

  // setSwitch(key: string, docs: any) { // Superseded by direct languageModel manipulation in constructor/ingestLintResponse
    // switch (key) {
    //   case 'types':
    //     // this.typesDocs = docs // Old way
    //     break;
    //   // ... other cases for old array properties would be removed or adapted ...
    //   case 'enums':
    //     if (Array.isArray(docs)) {
    //       docs.forEach(doc => this.languageModel.enums.set(doc.name, doc));
    //     } else {
    //       this.languageModel.enums = docs;
    //     }
    //     break
    //   default:
    //     if (this.languageModel[key] instanceof Map) {
    //       const map = this.languageModel[key] as Map<string, any>;
    //       map.clear();
    //       if (Array.isArray(docs)) {
    //          docs.forEach(doc => map.set(doc.name, doc));
    //       } else {
    //         console.warn(`setSwitch: Default case for ${key} received non-array docs. Data not set.`);
    //       }
    //     } else {
    //       console.warn(`setSwitch: Key ${key} not found in languageModel or not a Map.`);
    //     }
    //     break;
    // }
  // }

  /**
   * Returns a Map of documents for the given categories.
   * If multiple keys are provided, their corresponding Maps from languageModel are merged.
   * @param keys - One or more category keys (e.g., 'functions', 'variables').
   * @returns A new Map containing all documents from the requested categories.
   */
  getMap(...keys: string[]): Map<string, any> {
    const combinedMap = new Map<string, any>();
    if (keys.length === 0) {
      console.warn('getMap called with no keys.');
      return combinedMap;
    }

    for (const key of keys) {
      const modelCategory = key as keyof typeof this.languageModel; // Type assertion
      const sourceMap = this.languageModel[modelCategory];
      if (sourceMap instanceof Map) {
        sourceMap.forEach((value, name) => {
          combinedMap.set(name, value); // Later keys will overwrite earlier ones if names collide
        });
      } else {
        console.warn(`getMap: Category '${key}' not found in languageModel or is not a Map.`);
      }
    }
    return combinedMap;
  }

  // makeMap(docs: any[]): Map<string, any> { // Likely obsolete if getMap returns Maps directly
    // try {
    //   const entries: [string, any][] = docs.flatMap((doc: any) => {
    //     if (doc?.name) {
    //       return [[doc.name, doc] as [string, any]]
    //     } else {
    //       return []
    //     }
    //   })
    //   const outMap: Map<string, any> = new Map(entries)
    //   return outMap
    // } catch (error) {
    //   console.error(error)
    //   return new Map()
    // }
  // }

  /**
   * Retrieves an array of documents for the given categories, with optional filtering.
   * @param keys - One or more category keys (e.g., 'functions', 'variables').
   * @returns An array of documents.
   */
  getDocs(...keys: string[]): Record<string, any>[] {
    let result: any[] = [];
    for (const key of keys) {
      const modelCategory = key as keyof typeof this.languageModel; // Type assertion
      const sourceMap = this.languageModel[modelCategory];
      if (sourceMap instanceof Map) {
        let docsForKey = Array.from(sourceMap.values());
        // The old isMethod filtering logic might still be relevant depending on how
        // 'functions' vs 'methods' are queried by consumers.
        // For now, this specific filtering is removed from here; consumers can filter.
        // if (/functions/.test(key) && !/completionFunctions/.test(key) && !/methods/.test(key)) { // Be more specific
        //   docsForKey = docsForKey.filter((doc: any) => !doc?.isMethod);
        // } else if (/methods/.test(key)) {
        //   docsForKey = docsForKey.filter((doc: any) => doc?.isMethod);
        // }
        result = [...result, ...docsForKey];
      } else {
        console.warn(`getDocs: Category '${key}' not found in languageModel or is not a Map.`);
      }
    }
    // Return unique documents by reference (if objects are identical) or by name
    // Using Map to get unique by name, then converting to array
    const uniqueDocsMap = new Map<string, any>();
    result.forEach(doc => {
      if (doc && doc.name && !uniqueDocsMap.has(doc.name)) { // Prioritize first encountered for a given name
        uniqueDocsMap.set(doc.name, doc);
      } else if (doc && doc.name && uniqueDocsMap.has(doc.name)) {
        // Potentially merge or decide on override strategy if needed
        // For now, first one wins.
      }
    });
    return Array.from(uniqueDocsMap.values());
  }

  // setImportDocs(docs: any) { // Superseded by ingestLintResponse populating languageModel.imports
  //   // this.importsDocs = docs
  // }

  setParsed(docs: any[], keyType: string) { // Largely superseded by ingestLintResponse
    // This method was used by the old PineParser.ts.
    // With data coming from ingestLintResponse into languageModel,
    // this method's direct manipulation of old arrays or even specific
    // languageModel maps via setSwitch might be redundant or lead to conflicts.
    // For now, commenting out its body to prevent unintended operations.
    // If any part of this logic is still needed for supplementary data, it should be carefully reviewed.
    /*
    try {
      if (keyType === 'args' || keyType === 'fields') {
        // ... old logic ...
      } else if (keyType === 'enum_members') {
        // ... old logic ...
      } else if (keyType === 'variables') {
        // ... old logic ...
      }
    } catch (error) {
      console.error('Error in setParsed:', error)
    }
    */
    console.warn(`setParsed called with keyType '${keyType}'. This method is likely obsolete and data should be ingested via ingestLintResponse or constructor.`);
  }

  // setDocs(newDocs: any, key: string) { // Superseded by direct languageModel manipulation
    // try {
    //   const currentDocs: any[] = this.getSwitch(key) // Relies on getSwitch
    //   const mergedDocs = this.mergeDocs(currentDocs, newDocs)
    //   this.setSwitch(key, mergedDocs) // Relies on setSwitch
    // } catch (error) {
    //   console.error(error)
    // }
  // }

  // mergeDocs(currentDocs: any[], newDocs: any[]): any[] { // Superseded
    // try {
    //   // ... old logic ...
    // } catch (error) {
    //   console.error(error)
    //   return currentDocs
    // }
  // }

  /**
   * the setImportAliases function is used to set the imported namespace aliases
   * @param aliases - The aliases to set.
   */
  set setImportAliases(aliases: string[]) { // This is still used by ingestLintResponse
    this.importAliases = aliases
  }

  /**
   * the getAliases function is used to get the aliases for the current document
   * @returns The aliases.
   */
  get getAliases() { // This is still used
    return [...this.docAliases, ...this.importAliases]
  }

  /**
   * Clears script-specific (non-built-in) data from the language model.
   * Built-in data loaded from pineDocs.json remains.
   */
  cleanDocs() {
    for (const map of Object.values(this.languageModel)) {
      if (map instanceof Map) {
        const keysToDelete: string[] = [];
        map.forEach((value, key) => {
          if (value.isBuiltIn !== true) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach(key => map.delete(key));
      }
    }
    this.languageModel.imports.clear(); // Imports are always script-specific
    this.importAliases = [];
    console.log('PineDocsManager: Cleared script-specific (non-built-in) data from languageModel.');

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

  /**
   * Parses an enum member's title or name to extract its potential value.
   * Example titles: "MEMBER_A", "MEMBER_B = \"value_b\"", "MEMBER_C = 10"
   * @param title The title string of the enum member.
   * @returns The parsed value (string, number) or the original name if no value is assigned.
   */
  private _parseEnumValue(title: string): string | number | undefined {
    if (!title) return undefined;
    const parts = title.split('=');
    if (parts.length > 1) {
      let valueStr = parts.slice(1).join('=').trim(); // Handle cases like "MEMBER_D = val = 1"
      // Check if string literal
      if ((valueStr.startsWith('"') && valueStr.endsWith('"')) || (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
        return valueStr.slice(1, -1);
      }
      // Check if number literal
      const num = parseFloat(valueStr);
      if (!isNaN(num) && num.toString() === valueStr) {
        return num;
      }
      // Otherwise, it might be an identifier or complex expression, return as string (or handle as needed)
      return valueStr;
    }
    // No explicit assignment, the "value" is effectively the member's name (or its ordinal if not a string enum)
    // For simplicity in suggestions, returning the name itself if no '=' is found.
    // Actual runtime value might be its ordinal for non-string enums.
    return undefined; // Let the language server or display logic handle ordinal values if needed.
  }

  /**
   * Ingests data from a lint service response and populates the documentation manager.
   * @param lintResult The result object from the lint service.
   */
  ingestLintResponse(lintResult: any): void {
    if (!lintResult) {
      console.warn('ingestLintResponse: lintResult is null or undefined. Skipping ingestion.');
      return;
    }

    // Step 1: Clear previous script-specific (non-built-in) data from languageModel
    for (const map of Object.values(this.languageModel)) {
      if (map instanceof Map) {
        const keysToDelete: string[] = [];
        map.forEach((value, key) => {
          if (value.isBuiltIn !== true) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach(key => map.delete(key));
      }
    }
    this.languageModel.imports.clear(); // Imports are always script-specific
    this.importAliases = [];

    // Step 2: Process and merge lint data into this.languageModel
    // Process Imports
    for (const imp of lintResult.imports || []) {
      const importDoc = {
        name: imp.alias || imp.lib,
        alias: imp.alias,
        libId: imp.id || imp.libId,
        user: imp.user,
        libName: imp.lib,
        version: imp.version,
        kind: 'Import',
        description: `Imports library '${imp.lib}' version ${imp.version}${imp.alias ? ` as '${imp.alias}'` : ''}. User: ${imp.user}`,
        isBuiltIn: false, // Mark as not built-in
      };
      this.languageModel.imports.set(importDoc.name, importDoc);
      if (imp.alias) {
        this.importAliases.push(imp.alias);
      }
    }

    // Process Variables
    for (const variable of lintResult.variables || []) {
      const variableDoc = {
        name: variable.name,
        type: variable.type || 'any',
        kind: 'Variable',
        libId: variable.libId,
        description: variable.metaInfo?.docs || variable.desc || '',
        originalName: variable.name,
        isBuiltIn: false,
      };
      this.languageModel.variables.set(variableDoc.name, variableDoc);
    }

    // Process Functions
    for (const func of lintResult.functions || []) {
      const args = (func.args || []).map((arg: any) => ({
        name: arg.name,
        type: arg.displayType || arg.type || 'any',
        desc: arg.desc || '',
        required: arg.required !== undefined ? arg.required : arg.defaultValue === undefined,
        default: arg.defaultValue,
        modifier: arg.modifier,
      }));

      let kind = 'Function';
      if (func.name && func.name.includes('.new') && !func.thisType && !func.isMethod) {
        kind = 'Constructor';
      } else if (func.thisType || func.isMethod) {
        kind = 'Method';
      }

      const functionDoc: any = {
        name: func.name,
        args: args,
        kind: kind,
        type: func.returnedTypes?.[0] || 'any',
        returnedTypes: func.returnedTypes || ['any'],
        description: func.desc || func.metaInfo?.docs || '',
        libId: func.libId,
        thisType: func.thisType,
        syntax: func.syntax?.[0] || func.name,
        originalName: func.name,
        isMethod: kind === 'Method',
        isBuiltIn: false,
      };
      this.languageModel.functions.set(functionDoc.name, functionDoc);
    }

    // Process Types (UDTs)
    for (const type of lintResult.types || []) {
      const fields = (type.fields || []).map((field: any) => ({
        name: field.name,
        type: field.type || 'any',
        desc: field.desc || field.metaInfo?.docs || '',
        default: field.defaultValue,
        isConst: field.isConst || (field.modifiers && field.modifiers.includes('const')),
        kind: 'Field',
      }));

      const udtDoc = {
        name: type.name,
        kind: 'User Type',
        fields: fields,
        description: type.desc || type.metaInfo?.docs || '',
        libId: type.libId,
        originalName: type.name,
        isBuiltIn: false,
      };
      this.languageModel.types.set(udtDoc.name, udtDoc);
    }

    // Process Enums
    for (const enumDef of lintResult.enums || []) {
      const members = (enumDef.fields || []).map((member: any) => ({
        name: member.name,
        value: this._parseEnumValue(member.title || member.name),
        kind: 'EnumMember',
        desc: member.desc || member.metaInfo?.docs || '',
        type: enumDef.name,
      }));

      const enumDoc = {
        name: enumDef.name,
        kind: "UserEnum",
        members: members,
        description: enumDef.desc || enumDef.metaInfo?.docs || '',
        libId: enumDef.libId,
        originalName: enumDef.name,
        isBuiltIn: false,
      };
      this.languageModel.enums.set(enumDoc.name, enumDoc);
    }

    // Note: 'constants', 'controls', 'annotations' from languageModel are assumed to be primarily built-ins
    // and are not cleared of built-in items. If lint can provide script-specific versions of these,
    // their ingestion would follow a similar pattern (add with isBuiltIn: false).

    console.log('PineDocsManager: Ingested data from lint response into languageModel.');
  }
}
