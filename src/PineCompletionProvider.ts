import { Helpers, PineSharedCompletionState } from './index';
import { Class } from './PineClass';
import * as vscode from 'vscode';
import { CompletionDoc } from './PineCompletionService';
import { ParsedType, PineTypify } from './PineTypify'; // Import ParsedType and PineTypify
import { VSCode } from './VSCode'; // Import project's VSCode wrapper

export class PineCompletionProvider implements vscode.CompletionItemProvider {
  // private pineCompletionService: PineCompletionService // Removed
  completionItems: vscode.CompletionItem[] = []
  docType: any
  userDocs: any
  map: any
  isMapNew: any
  namespaces: any
  match: string | undefined = undefined
  activeArg: string | null = null
  argumentCompletionsFlag: boolean = false
  sigCompletions: Record<string, any> = {}

  constructor() {
    // Constructor is now empty or can be used for other initializations
    // if (!Class.pineCompletionService) {
    //     console.error("PineCompletionService not initialized in Class object!");
    // }
  }

  /**
   * Checks if completions are available for the current context.
   * @returns An array of completions.
   */
  checkCompletions(): Record<string, any>[] {
    try {
      const activeArg = PineSharedCompletionState.getActiveArg
      if (PineSharedCompletionState.getArgumentCompletionsFlag && activeArg) {
        PineSharedCompletionState.setArgumentCompletionsFlag(false)
        return PineSharedCompletionState.getCompletions[activeArg] ?? []
      }
      return []
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Provides completion items for the current position in the document.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param token - A cancellation token.
   * @returns An array of completion items.
   */
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null | undefined> {
    try {
      this.completionItems = [];
      const linePrefix = document.lineAt(position.line).text.substring(0, position.character);

      // Regexes for different call patterns
      // UDT Constructor: Group 1: UDT Name (potentially with Lib), Group 2: typed args
      const udtConstructorRegex = /(\b[a-zA-Z_][\w\.]*)\.new\(\s*([^)]*)$/;
      // Method Call: Group 1: Variable, Group 2: Method Name, Group 3: typed args
      const methodCallRegex = /(\b[a-zA-Z_]\w*)\.(\w+)\(\s*([^)]*)$/;
      // Function Call: Group 1: Function Name (potentially with Lib), Group 2: typed args
      const functionCallRegex = /(?<!\bnew\s|\bif\s|\bfor\s|\bwhile\s|\.)(\b[a-zA-Z_][\w\.]*)\(\s*([^)]*)$/;

      let symbolInfo: any = null;
      let symbolNameForArgs: string | null = null;

      const udtMatch = linePrefix.match(udtConstructorRegex);
      if (udtMatch) {
        const udtName = udtMatch[1];
        symbolNameForArgs = `${udtName}.new`;
        symbolInfo = Class.PineDocsManager.getFunctionDocs(symbolNameForArgs);
      } else {
        const methodMatch = linePrefix.match(methodCallRegex);
        if (methodMatch) {
          const varName = methodMatch[1];
          const methodName = methodMatch[2];

          const lintResponse = typeof (VSCode as any).Linter?.getLintResponse === 'function'
            ? (VSCode as any).Linter.getLintResponse()
            : undefined;
          const variableTypeInfo = lintResponse?.variables?.find((v: {name: string, type: string}) => v.name === varName)?.type;
          if (variableTypeInfo) {
            symbolNameForArgs = `${variableTypeInfo}.${methodName}`;
            symbolInfo = Class.PineDocsManager.getFunctionDocs(symbolNameForArgs);
          }
          // Attempt 2: If type resolution fails or method not found, try finding method by its name alone (for built-ins on global types)
          if (!symbolInfo) {
            symbolNameForArgs = methodName; // e.g. join (if it was a method of a common type like array)
            // This might need PineDocsManager to store methods like "array.join" and be able to find "join" if it's unambiguously an array method.
            // For now, getFunctionDocs would need to be smart or method names unique.
             symbolInfo = Class.PineDocsManager.getFunctionDocs(methodName); // Less reliable without type context
          }

        } else {
          const funcMatch = linePrefix.match(functionCallRegex);
          if (funcMatch) {
            symbolNameForArgs = funcMatch[1];
            symbolInfo = Class.PineDocsManager.getFunctionDocs(symbolNameForArgs);
          }
        }
      }

      if (symbolInfo && symbolInfo.args && Array.isArray(symbolInfo.args)) {
        // Ensure cursor is within parentheses for argument completion
        const openParenIndex = linePrefix.lastIndexOf('(');
        const closeParenIndex = linePrefix.lastIndexOf(')');
        if (openParenIndex !== -1 && (closeParenIndex === -1 || openParenIndex > closeParenIndex || position.character > openParenIndex) ) {
          // Cursor is likely within parameters list
          const formattedArgs = symbolInfo.args.map((arg: any) => ({
            name: arg.name + '=', // Standard format for named args
            desc: arg.desc,
            kind: 'Parameter',
            type: arg.type || arg.displayType, // Prioritize parser's type
            required: arg.required,
            default: arg.default,
            libraryOrigin: symbolInfo.libraryOrigin, // Pass parent's library origin
            doc: arg, // Keep original arg object for createCompletionItem
          }));

          PineSharedCompletionState.setCompletions(formattedArgs); // Assuming this takes an array
          PineSharedCompletionState.setArgumentCompletionsFlag(true);
          // setActiveArg might need to be set based on comma count or parser state,
          // but argumentCompletions itself might handle filtering based on already typed args.
          // For now, setting the flag and completions is the main goal.
          // The activeArg is set by the signatureHelpProvider usually.
          // Here we force argument completion mode.
        }
      }

      // Now, check shared state (which might have been populated above or by SignatureHelpProvider)
      const completionsFromState: Record<string, any>[] = this.checkCompletions();
      if (token.isCancellationRequested) {
        return [];
      }

      if (completionsFromState.length > 0) {
        return await this.argumentCompletions(document, position, completionsFromState);
      } else {
        // If no argument context was matched and populated, proceed to main completions
        return await this.mainCompletions(document, position);
      }
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  /**
   * Creates a completion item for the given name and documentation.
   * @param document - The current document.
   * @param name - The name of the item.
   * @param namespace - The namespace of the item, if it's a method.
   * @param doc - The documentation for the item.
   * @param position - The current position within the document.
   * @param argCompletion - A flag indicating whether this is an argument completion.
   * @returns A CompletionItem object.
   */
  async createCompletionItem(
    document: vscode.TextDocument,
    name: string,
    namespace: string | null,
    doc: CompletionDoc, // Changed from any to CompletionDoc
    position: vscode.Position,
    argCompletion: boolean = false,
  ) {
    try {
      // Determine if the item is a method
      const isMethod = doc.isMethod ?? false
      // Get the kind of the item
      const kind = doc.kind
      // Determine if the item is the default (applies to function params for now)
      // doc.doc refers to the original documentation object stored inside CompletionDoc
      let preselect = doc.doc?.preselect ?? doc.default ?? false

      // name the label variable
      // 'name' parameter is the specific name for this completion (e.g. function name, method name)
      let label = name
      // If the item is a function or method, add parentheses to the name
      let openParen = ''
      let closeParen = ''
      let moveCursor = false
      if (kind && (kind.includes('Function') || kind.includes('Method'))) {
        label = name.replace(/\(\)/g, '')
        openParen = '('
        closeParen = ')'
        moveCursor = true
      }
      // Format the syntax and check for overloads
      // Pass doc.doc (original doc object) to formatSyntax if it expects that structure
      const modifiedSyntax = Helpers.formatSyntax(name, doc.doc, isMethod, namespace)
      // Format the label and description
      label = isMethod ? `${namespace}.${label.split('.').pop()}` : label
      label = label + openParen + closeParen

      // Use doc.description from CompletionDoc (summary), and doc.doc.desc for detailed description from parser
      let mainDescription = Helpers.formatUrl(Helpers?.checkDesc(doc.description || doc.doc?.desc || doc.doc?.doc));

      // Library origin for detail
      const libraryOrigin = doc.doc?.libraryOrigin ? ` (from ${doc.doc.libraryOrigin})` : '';
      let itemDetail = (kind ?? '') + libraryOrigin;

      // Enhance documentation and detail based on kind
      let argsDocumentation = "";
      if (doc.doc && (kind?.includes('Function') || kind?.includes('Method'))) {
        if (doc.doc.args && Array.isArray(doc.doc.args)) {
          argsDocumentation += "\n\n**Parameters:**\n";
          doc.doc.args.forEach((arg: any) => {
            argsDocumentation += `* \`${arg.name}\` (${arg.type || arg.displayType || 'any'}): ${Helpers.checkDesc(arg.desc) || 'No description.'}${arg.required ? " (required)" : ""}\n`;
          });
          let paramsShort = doc.doc.args.map((arg: any) => `${arg.name}: ${arg.type || arg.displayType || 'any'}`).join(', ');
          itemDetail = `${kind} (${paramsShort})${libraryOrigin}`;
        }
      } else if (doc.doc && kind === 'Field') {
        // Detail for UDT fields: "field <type> of <UDTName>"
        // Assuming parent UDT name might be part of 'namespace' or needs to be passed differently.
        // For now, use doc.doc.type.
        itemDetail = `field ${doc.doc.type || ''}${libraryOrigin}`;
        // mainDescription would be doc.doc.desc (description of the field itself)
      } else if (doc.doc && kind === 'EnumMember') {
        // Detail for Enum members: "member of <EnumName>"
        // Assuming parent Enum name might be part of 'namespace'.
        // mainDescription would be doc.doc.desc (description of the enum member)
        itemDetail = `member${libraryOrigin}`; // Add more specific parent enum if available
      } else if (doc.doc && kind === 'User Export Type' || kind === 'User Type' || kind === 'Enum') {
        // For UDTs or Enums themselves, the mainDescription is their overall doc.
        // itemDetail is already set to kind + libraryOrigin
      }


      const fullDocumentation = new vscode.MarkdownString(mainDescription + argsDocumentation);
      // If doc.doc.syntax is available (e.g. from PineParser for user functions), use it. Otherwise, formatSyntax.
      const finalSyntax = doc.doc?.syntax || modifiedSyntax;
      fullDocumentation.appendCodeblock(finalSyntax, 'pine');

      const itemKind = await this.determineCompletionItemKind(kind, doc.doc)
      const completionItem = new vscode.CompletionItem(label, itemKind)
      completionItem.documentation = fullDocumentation
      completionItem.detail = itemDetail;

      // Use a snippet string for the insert text
      let insertText = label
      const textBeforeCursor = document.lineAt(position.line).text.substring(0, position.character)

      // If it's an argument completion, prepend a space
      if (argCompletion) {
        const wordBoundaryRegexArgs = /(?:\(|,)?\s*\b[\w.]+$/
        const argStartMatch = wordBoundaryRegexArgs.exec(textBeforeCursor)
        let argStart = argStartMatch ? position.character - argStartMatch[0].length : position.character
        argStart = Math.max(argStart, 0)

        if (!PineSharedCompletionState.getIsLastArg) {
          insertText += ''
        }

        // Set the replacement range and insert text of the completion item
        completionItem.insertText = insertText
        completionItem.range = new vscode.Range(new vscode.Position(position.line, argStart), position)
      } else {
        // Calculate the start position of the word being completed
        const wordBoundaryRegex = /\b[\w.]+$/
        const wordStartMatch = wordBoundaryRegex.exec(textBeforeCursor)
        let wordStart = wordStartMatch ? position.character - wordStartMatch[0].length : position.character
        wordStart = Math.max(wordStart, 0)

        // Set the replacement range and insert text of the completion item
        completionItem.insertText = insertText
        completionItem.preselect = preselect
        completionItem.range = new vscode.Range(new vscode.Position(position.line, wordStart), position)

        if (moveCursor) {
          completionItem.command = { command: 'pine.completionAccepted', title: 'Completion Accept Logic.' }
          moveCursor = false
        }
      }

      return completionItem
    } catch (error) {
      console.error(error)
      return null
    }
  }

  /**
   * Determines the kind of a completion item based on its type.
   * @param kind - The type of the item.
   * @returns The kind of the completion item.
   */
  async determineCompletionItemKind(kind?: string, docDetails?: any) {
    // Added docDetails parameter
    try {
      // If the kind is not specified, return Text as the default kind
      if (!kind) {
        return vscode.CompletionItemKind.Text;
      }

      // Specific kind mappings from PineParser
      const kindMapping: { [key: string]: vscode.CompletionItemKind } = {
        // User Defined (from PineParser)
        'User Export Function': vscode.CompletionItemKind.Function,
        'User Method': vscode.CompletionItemKind.Method,
        'User Function': vscode.CompletionItemKind.Function,
        'User Export Type': vscode.CompletionItemKind.Class, // UDTs
        'User Type': vscode.CompletionItemKind.Class,    // UDTs
        'User Export Enum': vscode.CompletionItemKind.Enum,
        'User Enum': vscode.CompletionItemKind.Enum,
        'Field': vscode.CompletionItemKind.Field,         // UDT Field
        'EnumMember': vscode.CompletionItemKind.EnumMember, // Enum Member
        'Parameter': vscode.CompletionItemKind.TypeParameter, // Function/Method Parameter

        // Built-ins / Others (can be refined)
        'Function': vscode.CompletionItemKind.Function,
        'Method': vscode.CompletionItemKind.Method,
        'Local': vscode.CompletionItemKind.Module,
        'Imported': vscode.CompletionItemKind.Module,
        'Integer': vscode.CompletionItemKind.Value,
        'Float': vscode.CompletionItemKind.Value, // Added Float
        'String': vscode.CompletionItemKind.Text, // Added String for variables/constants
        'Color': vscode.CompletionItemKind.Color,
        'Control': vscode.CompletionItemKind.Keyword,
        'Variable': vscode.CompletionItemKind.Variable,
        'Boolean': vscode.CompletionItemKind.EnumMember, // true/false often act like enum members
        'Constant': vscode.CompletionItemKind.Constant, // PineScript constants (e.g. plot.style_area)
        'Type': vscode.CompletionItemKind.Class, // Built-in types like 'array', 'matrix'
        'Annotation': vscode.CompletionItemKind.Reference,
        'Property': vscode.CompletionItemKind.Property, // e.g. line.get_price
        'Other': vscode.CompletionItemKind.Value,
        'Literal String': vscode.CompletionItemKind.Text,
      };

      if (kindMapping[kind]) {
        return kindMapping[kind];
      }

      // Fallback for const fields that might be enum-like but not explicitly "EnumMember" kind
      if (docDetails?.isConst && kind?.toLowerCase().includes('field')) {
        return vscode.CompletionItemKind.EnumMember;
      }

      // General fallback based on keywords if exact match failed
      const lowerKind = kind.toLowerCase();
      if (lowerKind.includes('function')) return vscode.CompletionItemKind.Function;
      if (lowerKind.includes('method')) return vscode.CompletionItemKind.Method;
      if (lowerKind.includes('class') || lowerKind.includes('type')) return vscode.CompletionItemKind.Class;
      if (lowerKind.includes('enum') && !lowerKind.includes('member')) return vscode.CompletionItemKind.Enum;
      if (lowerKind.includes('member')) return vscode.CompletionItemKind.EnumMember;
      if (lowerKind.includes('field')) return vscode.CompletionItemKind.Field;
      if (lowerKind.includes('variable')) return vscode.CompletionItemKind.Variable;
      if (lowerKind.includes('constant')) return vscode.CompletionItemKind.Constant;
      if (lowerKind.includes('module')) return vscode.CompletionItemKind.Module;

      return vscode.CompletionItemKind.Text;
    } catch (error) {
      console.error(error)
      return vscode.CompletionItemKind.Text
    }
  }

  /**
   * Accepts the completion and triggers parameter hints.
   * @returns null
   */
  async completionAccepted() {
    try {
      vscode.commands.executeCommand('cursorLeft')
      vscode.commands.executeCommand('editor.action.triggerParameterHints')
    } catch (error) {
      console.error(error)
    }
  }

  /**
   * Provides completion items for the main completions.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @returns An array of completion items
   */
  async mainCompletions(document: vscode.TextDocument, position: vscode.Position) {
    try {
      // Get the text on the current line up to the cursor position
      const line = document.lineAt(position)
      if (line.text.trim().startsWith('//') || line.text.trim().startsWith('import')) {
        return []
      }

      const linePrefix = line.text.substring(0, position.character)
      if (!linePrefix) return [];

      const dotAccessMatch = linePrefix.match(/([\w\.\[\]\(\)]+)\.$/); // Updated regex to include [] and () for array/map access or function calls if needed by resolver

      if (dotAccessMatch) {
        const expressionBeforeDot = dotAccessMatch[1];
        const finalResolvedType = await this.resolveExpressionType(expressionBeforeDot);

        if (finalResolvedType) {
          let typeToGetFieldsFrom = finalResolvedType;
          let udtNamespaceForDisplay = expressionBeforeDot; // Default namespace for display

          // If the resolved type is an array or matrix, get its element type
          if ((typeToGetFieldsFrom.containerType === 'array' || typeToGetFieldsFrom.containerType === 'matrix') && typeToGetFieldsFrom.elementType) {
            typeToGetFieldsFrom = typeToGetFieldsFrom.elementType;
            // Adjust namespace to reflect the element type context if possible, though expressionBeforeDot is often fine.
            // udtNamespaceForDisplay = typeToGetFieldsFrom.lib ? `${typeToGetFieldsFrom.lib}.${typeToGetFieldsFrom.baseType}` : typeToGetFieldsFrom.baseType;
          }
          // If it's a map, consider if we want to provide methods for map or fields of valueType (more complex)
          // For now, focusing on UDTs and element types of arrays/matrices if they are UDTs.

          const udtFullName = typeToGetFieldsFrom.lib
            ? `${typeToGetFieldsFrom.lib}.${typeToGetFieldsFrom.baseType}`
            : typeToGetFieldsFrom.baseType;

          // Check if typeToGetFieldsFrom is a UDT by trying to get its definition
          const udtDefinition = Class.PineDocsManager.getMap('UDT').get(udtFullName);
          if (udtDefinition && udtDefinition.fields && Array.isArray(udtDefinition.fields)) {
            for (const field of udtDefinition.fields) {
              const completionDoc: CompletionDoc = {
                name: field.name,
                kind: 'Field',
                description: field.desc,
                // Pass full UDT def libraryOrigin, and specific field type for doc.doc
                doc: { ...field, libraryOrigin: udtDefinition.libraryOrigin, type: field.type },
                isMethod: false,
                namespace: udtNamespaceForDisplay, // The expression that results in this UDT
              };
              const item = await this.createCompletionItem(document, field.name, udtNamespaceForDisplay, completionDoc, position, false);
              if (item) this.completionItems.push(item);
            }
            if (this.completionItems.length > 0) {
              return new vscode.CompletionList(this.completionItems, true);
            }
          }
        }

        // Attempt Enum Member Completions if UDT field resolution didn't yield results for the original expressionBeforeDot
        // This is because expressionBeforeDot could be a direct Enum name like "MyLib.MyEnum"
        const enumDefinition = Class.PineDocsManager.getMap('enums').get(expressionBeforeDot);
        if (enumDefinition && enumDefinition.members && Array.isArray(enumDefinition.members)) {
          for (const member of enumDefinition.members) {
            const completionDoc: CompletionDoc = {
              name: member.name,
              kind: 'EnumMember',
              description: member.desc,
              doc: { ...member, libraryOrigin: enumDefinition.libraryOrigin },
              isMethod: false,
              namespace: expressionBeforeDot,
            };
            const item = await this.createCompletionItem(document, member.name, expressionBeforeDot, completionDoc, position, false);
            if (item) this.completionItems.push(item);
          }
          if (this.completionItems.length > 0) {
            return new vscode.CompletionList(this.completionItems, true);
          }
        }

        // If dotAccessMatch was true, but we found no specific UDT fields or Enum Members,
        // try to get general method/property completions for the expressionBeforeDot (e.g., for string methods, array methods)
        if (this.completionItems.length === 0) { // Only if no UDT/Enum completions were found
            const serviceCompletions = Class.pineCompletionService.getMethodCompletions(expressionBeforeDot);
            for (const completionDoc of serviceCompletions) {
                const item = await this.createCompletionItem(document, completionDoc.name, completionDoc.namespace, completionDoc, position, false);
                if (item) this.completionItems.push(item);
            }
            if (this.completionItems.length > 0) {
                return new vscode.CompletionList(this.completionItems, true);
            }
        }
      }

      // General completions (if not a dot access or if dot access yielded no specific UDT/Enum/Method results)
      const generalMatch = linePrefix.match(/[\w.]+$/)?.[0].trim();
      if (!generalMatch && !dotAccessMatch) {
        return [];
      }

      // This block will now primarily handle non-dot-access scenarios,
      // or serve as a final fallback if dot-access didn't populate anything (though the new block above for methods should handle most dot cases).
      if (generalMatch) {
        const allServiceCompletions: CompletionDoc[] = [];
        if (!dotAccessMatch) { // Only add general completions if not a dot-access context at all
            allServiceCompletions.push(...Class.pineCompletionService.getGeneralCompletions(generalMatch));
        }
        // Add method and constructor completions. These might be relevant if generalMatch is a partial name of one.
        // For dot access, method completions are now handled above. If it wasn't a dot access, this is fine.
        if (!dotAccessMatch) { // Avoid redundant method completions if already handled by dot-access fallback
            allServiceCompletions.push(...Class.pineCompletionService.getMethodCompletions(generalMatch));
        }
        allServiceCompletions.push(...Class.pineCompletionService.getUdtConstructorCompletions(generalMatch));

        for (const completionDoc of allServiceCompletions) {
          const vscodeCompletionItem = await this.createCompletionItem(
            document,
            completionDoc.name,
            completionDoc.namespace,
            completionDoc,
            position,
            false,
          );
          if (vscodeCompletionItem) {
            this.completionItems.push(vscodeCompletionItem);
          }
        }
      }

      if (this.completionItems.length > 0) {
        return new vscode.CompletionList(this.completionItems, true);
      }
      return []; // Ensure always returns something if no items pushed
    } catch (error) {
      console.error(error)
      return [];
    }
  }

  /**
   * Resolves the type of a potentially nested expression (e.g., var1.fieldA.nestedField).
   * @param expression The expression string.
   * @returns A Promise resolving to the ParsedType of the final part of the expression, or null.
   */
  async resolveExpressionType(expression: string): Promise<ParsedType | null> {
    const parts = expression.split('.');
    if (parts.length === 0) {
      return null;
    }

    let baseExpressionPart = parts[0];
    let currentType: ParsedType | null;

    const indexAccessMatch = baseExpressionPart.match(/^([a-zA-Z_]\w*)(\[.*\])$/);

    if (indexAccessMatch) {
      const varName = indexAccessMatch[1];
      // Assuming Class might have a static instance property like 'pineTypifyInstance'
      const varType = await (Class as any).pineTypifyInstance?.getVariableType(varName);
      if (varType) {
        if ((varType.containerType === 'array' || varType.containerType === 'matrix') && varType.elementType) {
          currentType = varType.elementType;
        } else if (varType.containerType === 'map' && varType.valueType) {
          currentType = varType.valueType;
        } else {
          currentType = null;
        }
      } else {
        currentType = null;
      }
    } else {
      currentType = await (Class as any).pineTypifyInstance?.getVariableType(baseExpressionPart);
    }

    // If the first part itself (after potential index stripping) is not resolved, try parsing it as a direct type name (e.g. MyLib.MyType)
    // This helps if `expression` is like `MyLib.MyType.staticFieldOrMethod` (though static fields aren't typical in Pine UDTs this way)
    // or if `expressionBeforeDot` in `mainCompletions` was an Enum name like `MyLib.MyEnum`.
    // However, `mainCompletions` already handles direct Enum name lookups.
    // This resolver is best for `variable.field...` chains.
    if (!currentType && parts.length === 1 && !indexAccessMatch) { // Only try to parse as type if it's a single part and not an array access
        // This might be a direct UDT name like "someLib.MyType" that isn't a variable.
        // This path is less common for field access which usually starts with a variable.
        // currentType = Class.pineTypify.parseType(baseExpressionPart); // This could be problematic if baseExpressionPart is just "myVar"
    }


    if (!currentType) {
      return null;
    }

    // Loop for subsequent parts (field access)
    for (let i = 1; i < parts.length; i++) {
      if (!currentType) return null;

      const fieldName = parts[i];

      // If currentType is an array or matrix, we cannot directly access UDT fields on it.
      // Field access like '.length' would be handled by general method/property completions, not here.
      if (currentType.containerType === 'array' || currentType.containerType === 'matrix' || currentType.containerType === 'map') {
        // This means we have something like `myArray.someField` or `myMap.someField`.
        // If `someField` is not a built-in property/method of array/map, this path is invalid for UDT field resolution.
        // Built-in properties (like length) or methods (like .get() for map, .join() for array)
        // are typically not stored as "fields" in the UDT sense.
        // The mainCompletions will call pineCompletionService for these.
        return null;
      }

      const udtLookupName = currentType.lib
        ? `${currentType.lib}.${currentType.baseType}`
        : currentType.baseType;

      const udtDef = Class.PineDocsManager.getMap('UDT').get(udtLookupName);
      if (!udtDef || !udtDef.fields || !Array.isArray(udtDef.fields)) {
        return null; // Not a known UDT or has no fields
      }

      const fieldInfo = udtDef.fields.find((f: any) => f.name === fieldName);
      if (!fieldInfo || !fieldInfo.type) {
        return null; // Field not found or field has no type string
      }

      currentType = PineTypify.parseType(fieldInfo.type); // Use static PineTypify.parseType
      if (!currentType || currentType.baseType === 'unknown') {
          return null;
      }
    }
    return currentType;
  }

  /**
   * Provides completion items for argument completions.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param completionsFromState - The completions from the shared state.
   * @returns An array of completion items.
   * @throws Error if an error occurs during the process.
   * @remarks This function is called when argument completions are requested.
   * It checks if there are any completions available and processes them accordingly.
   */
  async argumentCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    completionsFromState: Record<string, any>[],
  ) {
    try {
      if (completionsFromState.length === 0) {
        PineSharedCompletionState.clearCompletions()
        return []
      }

      const existingFields = new Set<string>()
      const linePrefix = document.lineAt(position).text.substring(0, position.character)
      const existingPairsMatch = linePrefix.matchAll(/(\w+)=/g) // match fieldName=

      for (const match of existingPairsMatch) {
        if (match && match[1]) {
          existingFields.add(match[1])
        }
      }

      let index = 0
      let anyAdded = false
      for (const completionData of completionsFromState) {
        // Skip if field already exists
        if (existingFields.has(completionData.name.replace('=', ''))) {
          continue
        }

        // Determine the kind based on the data
        let itemKind: vscode.CompletionItemKind
        if (
          completionData.kind?.toLowerCase().includes('field') ||
          completionData.kind?.toLowerCase().includes('property')
        ) {
          itemKind = vscode.CompletionItemKind.Field
          // Let determineCompletionItemKind handle all kind assignments consistently
          itemKind = await this.determineCompletionItemKind(completionData.kind || 'Parameter', completionData)

          // Construct a CompletionDoc-like object for the argument
          const argCompletionDoc: CompletionDoc = {
            name: completionData.name, // e.g., "length=" or "true"
            kind: completionData.kind || 'Parameter', // "Parameter" or more specific if available
            description: completionData.desc, // Description of the argument
            doc: completionData, // The original argument object { name, displayType, desc, required, etc. }
            isMethod: false, // Arguments are not methods
            namespace: null, // Arguments don't have a namespace in this context
            // returnedType: completionData.displayType, // Not directly a returned type
          };

          const completionItem = await this.createCompletionItem(
            document,
            argCompletionDoc.name,    // Name for createCompletionItem (e.g. "length=")
            null,                     // No namespace for args
            argCompletionDoc,         // The constructed CompletionDoc
            position,
            true,                     // argCompletion is true
          )

          if (completionItem) {
            // itemKind was already determined and used in createCompletionItem if it defaults
            // completionItem.kind = itemKind; // kind is set within createCompletionItem
            completionItem.sortText = `order${index.toString().padStart(4, '0')}`
            this.completionItems.push(completionItem)
            anyAdded = true
          }
          index++
        }

        // Only clear completions if there are no more to suggest
        if (!anyAdded) {
          PineSharedCompletionState.clearCompletions()
          return []
        }

        return new vscode.CompletionList(this.completionItems)
      }
    } catch (error) {
      console.error(error)
      PineSharedCompletionState.clearCompletions()
      return []
    }
  }
}

// PineInlineCompletionContext.ts
async function safeExecute<T>(action: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await action()
  } catch (error) {
    console.error(error)
    return fallback
  }
}

function buildLabel(
  name: string,
  doc: any,
  namespace: string | null,
): { label: string; openParen: string; closeParen: string } {
  let label = name
  let openParen = ''
  let closeParen = ''
  const kind = doc?.kind
  if (kind && (kind.includes('Function') || kind.includes('Method'))) {
    label = name.replace(/\(\)/g, '')
    openParen = '('
    closeParen = ')'
  }
  if (doc?.isMethod && namespace) {
    label = `${namespace}.${label.split('.').pop()}`
  }
  return { label: label + openParen + closeParen, openParen, closeParen }
}

export class PineInlineCompletionContext implements vscode.InlineCompletionItemProvider {
  completionItems: vscode.InlineCompletionItem[] = []
  docType: any
  userDocs: any
  map: any
  isMapNew: any
  namespaces: any
  match: string | undefined = undefined
  activeArg: string | null = null
  argumentCompletionsFlag: boolean = false
  sigCompletions: Record<string, any> = {}

  /**
   * Checks if completions are available for the current context.
   * @returns An array of completions.
   */
  checkCompletions(): Record<string, any>[] {
    try {
      const activeArg = PineSharedCompletionState.getActiveArg
      if (PineSharedCompletionState.getArgumentCompletionsFlag && activeArg) {
        PineSharedCompletionState.setArgumentCompletionsFlag(false)
        return PineSharedCompletionState.getCompletions[activeArg] ?? []
      }
      return []
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Provides inline completion items for the current position in the document.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param context - The inline completion context.
   * @param token - A cancellation token.
   * @returns An array of inline completion items.
   */
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
    try {
      // Initialize the completion items array
      this.completionItems = []

      const completionsFromState: Record<string, any>[] = this.checkCompletions()

      if (token.isCancellationRequested) {
      }

      if (completionsFromState.length > 0) {
        return await this.argumentInlineCompletions(document, position, completionsFromState)
      } else {
        return await this.mainInlineCompletions(document, position)
      }
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Creates an inline completion item for the given name and documentation.
   * @param document - The current document.
   * @param name - The name of the item.
   * @param namespace - The namespace of the item, if it's a method.
   * @param doc - The documentation for the item.
   * @param position - The current position within the document.
   * @param argCompletion - A flag indicating whether this is an argument completion.
   * @returns A InlineCompletionItem object.
   */
  async createInlineCompletionItem(
    document: vscode.TextDocument,
    name: string,
    namespace: string | null,
    doc: any,
    position: vscode.Position,
    argCompletion: boolean = false,
  ): Promise<vscode.InlineCompletionItem | null> {
    return safeExecute(async () => {
      const { label } = buildLabel(name, doc, namespace)
      let insertText = label
      const textBeforeCursor = document.lineAt(position.line).text.substring(0, position.character)
      let startPosition: number
      if (argCompletion) {
        const argStartMatch = /(?:\(|,)?\s*\b[\w.]+$/.exec(textBeforeCursor)
        startPosition = Math.max(position.character - (argStartMatch ? argStartMatch[0].length : 0), 0)
      } else {
        const wordStartMatch = /\b[\w.]+$/.exec(textBeforeCursor)
        startPosition = Math.max(position.character - (wordStartMatch ? wordStartMatch[0].length : 0), 0)
      }
      return new vscode.InlineCompletionItem(
        insertText,
        new vscode.Range(new vscode.Position(position.line, startPosition), position),
      )
    }, null)
  }

  /**
   * Provides inline completion items for method completions.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param match - The text to match.
   * @returns null
   */
  async methodInlineCompletions(document: vscode.TextDocument, position: vscode.Position, match: string) {
    try {
      const map = Class.PineDocsManager.getMap('methods', 'methods2')

      let namespace: string = ''
      let funcName: string = ''

      if (match.includes('.')) {
        const split = match.split('.')
        if (split.length > 1) {
          namespace = split.shift() ?? ''
          funcName = split.join('.') ?? ''
        }
      } else {
        return []
      }

      if (!namespace || Class.PineDocsManager.getAliases.includes(namespace)) {
        return []
      }

      const lowerNamespace = namespace.toLowerCase()
      const lowerFuncName = funcName.toLowerCase()
      const fullName = `${lowerNamespace}.${lowerFuncName}`

      for (let [name, doc] of map.entries()) {
        if (!doc.isMethod || name[0] === '*') {
          continue
        }

        let docNameSplitLast: string | null = null
        if (name.includes('.')) {
          const docNameSplit = name.split('.')
          docNameSplitLast = docNameSplit.pop() ?? null
        } else {
          docNameSplitLast = name
        }

        const namejoin = `${namespace}.${docNameSplitLast}`
        const lowerNameJoin = namejoin.toLowerCase()

        if (lowerNamespace && docNameSplitLast) {
          let typoTrack = 0
          let minorTypoCount = 0
          let matchIndex = 0

          for (let i = 0; i < fullName.length; i++) {
            const char = fullName[i]
            const foundIndex = lowerNameJoin.indexOf(char, matchIndex)

            if (foundIndex === -1) {
              typoTrack++
              if (typoTrack > 1) {
                break
              }
            } else if (foundIndex !== matchIndex) {
              minorTypoCount++
              if (minorTypoCount >= 3) {
                break
              }
              matchIndex = foundIndex + 1
            } else {
              matchIndex++
            }
          }

          if (typoTrack > 1 || minorTypoCount >= 3) {
            continue
          }

          let nType = Helpers.identifyType(namespace)
          let dType = Helpers.getThisTypes(doc)

          if (!nType || !dType) {
            continue
          }

          // Convert array types to a more consistent format
          nType = nType.replace(/([\w.]+)\[\]/, 'array<$1>')
          dType = dType.replace(/([\w.]+)\[\]/, 'array<$1>')

          // Normalize dType to one of the basic types if it includes any of 'array', 'matrix', 'map'
          const basicTypes = ['array', 'matrix', 'map']
          const replacementTypes = ['any', 'type', 'array', 'matrix', 'map']

          for (const t of basicTypes) {
            if (dType.includes(t)) {
              for (const r of replacementTypes) {
                if (dType.includes(r) || dType === r) {
                  dType = t
                  break
                }
              }
              break
            }
          }

          // Ensure types are strings and perform the final type check
          if (typeof nType !== 'string' || typeof dType !== 'string') {
            continue
          }

          if (!nType.includes(dType)) {
            continue
          }

          const completionItem = await this.createInlineCompletionItem(document, name, namespace, doc, position, false)
          if (completionItem) {
            this.completionItems.push(completionItem)
          }
        }
      }
    } catch (error) {
      console.error('An error occurred:', error)
      return []
    }
  }

  /**
   * Provides inline completion items for function completions.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param match - The text to match.
   * @returns null
   */
  async functionInlineCompletions(document: vscode.TextDocument, position: vscode.Position, match: string) {
    try {
      // Get the documentation map
      const map = Class.PineDocsManager.getMap(
        'functions',
        'completionFunctions',
        'variables',
        'variables2',
        'constants',
        'UDT',
        'types',
        'imports',
        'controls',
        'annotations',
        'fields',
        'fields2',
      )

      const lowerMatch = match.toLowerCase()
      const matchLength = match.length

      for (const [name, doc] of map.entries()) {
        const lowerName = name.toLowerCase()
        if (lowerName.startsWith(lowerMatch[0])) {
          let minorTypoCount = 0
          let majorTypoCount = 0
          let matchIndex = 0

          for (let i = 0; i < matchLength; i++) {
            const char = lowerMatch[i]
            const foundIndex = lowerName.indexOf(char, matchIndex)

            if (foundIndex === -1) {
              majorTypoCount++
              if (majorTypoCount > 1) {
                break
              }
            } else if (foundIndex !== matchIndex) {
              minorTypoCount++
              if (minorTypoCount >= 3) {
                break
              }
              matchIndex = foundIndex + 1
            } else {
              matchIndex++
            }
          }

          if (majorTypoCount <= 1 && minorTypoCount < 3) {
            const completionItem = await this.createInlineCompletionItem(document, name, null, doc, position, false)
            if (completionItem) {
              this.completionItems.push(completionItem)
            }
          }
        }
      }
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Provides inline completion items for the main completions.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @returns An array of inline completion items
   */
  async mainInlineCompletions(document: vscode.TextDocument, position: vscode.Position) {
    try {
      // Get the text on the current line up to the cursor position
      const line = document.lineAt(position)
      if (line.text.trim().startsWith('//') || line.text.trim().startsWith('import')) {
        return []
      }

      const linePrefix = line.text.substring(0, position.character)
      // If there's no text before the cursor, return an empty array
      if (!linePrefix) {
        return []
      }

      // Check if we are right after an opening parenthesis (possibly with whitespace)
      const argumentContextRegex = /\([\s]*$/
      if (argumentContextRegex.test(linePrefix.trim())) {
        // Trigger argument completions directly
        const functionCallMatch = linePrefix.trim().match(/(\w+)\([\s]*$/) // Capture function name if needed for context
        if (functionCallMatch && functionCallMatch[1]) {
          const functionName = functionCallMatch[1]
          const functionDoc = Class.PineDocsManager.getFunctionDocs(functionName) // Use the new getFunctionDocs

          if (functionDoc && functionDoc.args) {
            // Check if functionDoc and args exist
            PineSharedCompletionState.setCompletions(functionDoc.args) // Set completions from functionDoc.args
            PineSharedCompletionState.setArgumentCompletionsFlag(true) // Ensure flag is set
            return await this.argumentInlineCompletions(document, position, functionDoc.args) // Pass functionDoc.args to argumentInlineCompletions
          }
        }
        return [] // If no function name or args found in this context, return empty
      }

      // If there are no completions in the shared state, match the text before the cursor
      const match = linePrefix.match(/[\w.]+$/)?.[0].trim()
      if (!match) {
        return []
      }

      await this.functionInlineCompletions(document, position, match)
      await this.methodInlineCompletions(document, position, match)

      if (this.completionItems.length > 0) {
        return new vscode.InlineCompletionList(this.completionItems)
      }
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Provides inline completion items for argument completions.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param docs - The documentation for the arguments.
   * @returns An array of inline completion items.
   */
  async argumentInlineCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    allSuggestionsForActiveArg: Record<string, any>[],
  ) {
    try {
      this.completionItems = []
      if (!allSuggestionsForActiveArg || allSuggestionsForActiveArg.length === 0) {
        return []
      }

      const linePrefix = document.lineAt(position.line).text.substring(0, position.character)
      const whatUserIsTypingMatch = linePrefix.match(/(\w*)$/) // What user is currently typing for the current argument
      const whatUserIsTyping = whatUserIsTypingMatch ? whatUserIsTypingMatch[0].toLowerCase() : ''

      let bestSuggestionForInline: Record<string, any> | null = null

      // Scenario 1: Cursor is immediately after '(' or ', ' (empty argument slot)
      if (linePrefix.endsWith('(') || linePrefix.match(/,\s*$/)) {
        // Suggest the first available field/param name (these names end with '=')
        bestSuggestionForInline = allSuggestionsForActiveArg.find((s) => s.name.endsWith('=')) ?? null
      }
      // Scenario 2: User is typing something for the argument
      else if (whatUserIsTyping) {
        // Prioritize matching a field/param name that starts with what user is typing
        bestSuggestionForInline =
          allSuggestionsForActiveArg.find(
            (s) => s.name.endsWith('=') && s.name.toLowerCase().startsWith(whatUserIsTyping),
          ) ?? null
        if (!bestSuggestionForInline) {
          // If not matching a field/param name, try to match a value suggestion
          bestSuggestionForInline =
            allSuggestionsForActiveArg.find(
              (s) => !s.name.endsWith('=') && s.name.toLowerCase().startsWith(whatUserIsTyping),
            ) ?? null
        }
      }
      // Scenario 3: Cursor is after "fieldname = " (i.e., linePrefix ends with "= " or just "=")
      // Suggest a value for the current field.
      else if (linePrefix.match(/=\s*$/)) {
        // activeArg should be the LHS of '='. allSuggestionsForActiveArg are for this activeArg.
        // We prefer a value suggestion (not ending with '=')
        bestSuggestionForInline = allSuggestionsForActiveArg.find((s) => !s.name.endsWith('=')) ?? null
      }

      if (bestSuggestionForInline) {
        const inlineCompletion = await this.createInlineCompletionItem(
          document,
          bestSuggestionForInline.name,
          null,
          bestSuggestionForInline,
          position,
          true,
        )
        if (inlineCompletion) {
          this.completionItems.push(inlineCompletion)
        }
      }
      return new vscode.InlineCompletionList(this.completionItems)
    } catch (error) {
      console.error('Error in argumentInlineCompletions (InlineContext):', error)
      return []
    }
  }
}
