import { Helpers, PineSharedCompletionState } from './index'
import { Class } from './PineClass'
import * as vscode from 'vscode'
import { CompletionDoc } from './PineCompletionService' // PineCompletionService itself is no longer instantiated here

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
      // Initialize the completion items array
      this.completionItems = []

      const completionsFromState: Record<string, any>[] = this.checkCompletions()

      if (token.isCancellationRequested) {
      }

      if (completionsFromState.length > 0) {
        return await this.argumentCompletions(document, position, completionsFromState)
      } else {
        return await this.mainCompletions(document, position)
      }
    } catch (error) {
      console.error(error)
      return []
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
      const {kind} = doc
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

      // Use doc.description from CompletionDoc (which should be the primary source now)
      let descriptionText = doc.description || doc.doc?.desc || '' // Fallback to old way if new description isn't there
      descriptionText = Helpers.formatUrl(Helpers?.checkDesc(descriptionText))

      let detailText = kind ?? ''
      if (doc.libId) {
        detailText += ` (from ${doc.libId})`
      }

      // Enrich documentation with args or fields
      let extraDocs = ''
      if (doc.args && doc.args.length > 0) {
        extraDocs += `\n\n**Parameters:**\n`
        doc.args.forEach((arg: any) => {
          extraDocs += `- \`${arg.name}\`: ${arg.displayType || arg.type} ${arg.desc ? `- ${arg.desc}` : ''}\n`
        })
      }
      if (doc.fields && doc.fields.length > 0) { // For UDTs/Enums
        const fieldTitle = doc.kind?.toLowerCase().includes('enum') ? '**Members:**' : '**Fields:**'
        extraDocs += `\n\n${fieldTitle}\n`
        doc.fields.forEach((field: any) => {
          extraDocs += `- \`${field.name}\`: ${field.type || ''} ${field.desc ? `- ${field.desc}` : ''}\n`
        })
      }

      const itemKind = await this.determineCompletionItemKind(kind, doc.doc) // doc.doc is the original full object
      const completionItem = new vscode.CompletionItem(label, itemKind)
      completionItem.documentation = new vscode.MarkdownString(`${descriptionText}\n${extraDocs}\n\`\`\`pine\n${modifiedSyntax}\n\`\`\``)
      completionItem.detail = detailText

      // Use a snippet string for the insert text
      let insertText = name // Use `name` from CompletionDoc which might be `fieldName=` or `functionName`
      if (kind && (kind.includes('Function') || kind.includes('Method'))) {
        if (doc.args && doc.args.length > 0) {
          // Create snippet with placeholders for arguments
          const argPlaceholders = doc.args.map((arg: any, index: number) => `\${${index + 1}:${arg.name}}`).join(', ')
          insertText = `${name.replace(/\(\)/g, '')}(${argPlaceholders})`
        } else {
          insertText = `${name.replace(/\(\)/g, '')}()` // No args, just add parentheses
        }
        // For functions/methods, the label was already adjusted. `insertText` should be the snippet.
      } else if (name.endsWith('=')) { // For named arguments like "fieldName="
        insertText = `${name}$1` // Add placeholder for value
      }
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
        return vscode.CompletionItemKind.Text
      }

      // Check for const fields first (potential enum members) based on docDetails
      if (docDetails?.isConst && kind?.toLowerCase().includes('field')) {
        // This was an attempt to identify enum members before 'EnumMember' kind existed.
        // Now, rely on explicit 'EnumMember' kind if available.
        // If kind is 'EnumMember', it will be handled by the switch or map.
      }

      const lowerKind = kind.toLowerCase()

      // Specific kind checks first
      if (lowerKind === 'udt' || lowerKind === 'user type' || lowerKind.includes('udt from')) {
        return vscode.CompletionItemKind.Class // Or Struct, Class is common for UDTs
      }
      if (lowerKind === 'enum' || lowerKind.includes('enum from')) {
        return vscode.CompletionItemKind.Enum
      }
      if (lowerKind === 'enummember' || lowerKind === 'enum member') { // Standardize to 'enummember' from service if possible
        return vscode.CompletionItemKind.EnumMember
      }
      if (lowerKind === 'constructor' || lowerKind.includes('udt constructor')) {
        return vscode.CompletionItemKind.Constructor
      }
       if (lowerKind === 'parameter' || lowerKind === 'param' || lowerKind === 'arg' || lowerKind === 'argument') {
        return vscode.CompletionItemKind.TypeParameter // Or .Parameter, but TypeParameter is often used for func/method params
      }


      // General mapping (can be extended)
      const kindMap: { [key: string]: vscode.CompletionItemKind } = {
        function: vscode.CompletionItemKind.Function,
        method: vscode.CompletionItemKind.Method,
        variable: vscode.CompletionItemKind.Variable,
        constant: vscode.CompletionItemKind.Constant,
        field: vscode.CompletionItemKind.Field,
        property: vscode.CompletionItemKind.Property, // Often used interchangeably with Field
        class: vscode.CompletionItemKind.Class, // If 'class' kind is used for UDTs
        struct: vscode.CompletionItemKind.Struct, // If 'struct' kind is used
        keyword: vscode.CompletionItemKind.Keyword,
        module: vscode.CompletionItemKind.Module, // For imports or namespaces
        color: vscode.CompletionItemKind.Color,
        value: vscode.CompletionItemKind.Value,
        text: vscode.CompletionItemKind.Text,
        reference: vscode.CompletionItemKind.Reference, // For annotations or similar
        type: vscode.CompletionItemKind.Interface, // 'Type' can often mean an interface or type alias
        interface: vscode.CompletionItemKind.Interface,
        snippet: vscode.CompletionItemKind.Snippet,
        file: vscode.CompletionItemKind.File,
        folder: vscode.CompletionItemKind.Folder,
        unit: vscode.CompletionItemKind.Unit, // For units of measure if applicable
        event: vscode.CompletionItemKind.Event,
        operator: vscode.CompletionItemKind.Operator,
        // Pine specific that were there:
        'user export function': vscode.CompletionItemKind.Function,
        'user method': vscode.CompletionItemKind.Method,
        'user function': vscode.CompletionItemKind.Function,
        'user export type': vscode.CompletionItemKind.Class,
        local: vscode.CompletionItemKind.Module,
        imported: vscode.CompletionItemKind.Module,
        integer: vscode.CompletionItemKind.Value,
        control: vscode.CompletionItemKind.Keyword,
        boolean: vscode.CompletionItemKind.EnumMember, // Boolean constant often like an enum member
        annotation: vscode.CompletionItemKind.Reference,
        'literal string': vscode.CompletionItemKind.Text,
        other: vscode.CompletionItemKind.Value,

      }

      // Try exact match
      if (kindMap[lowerKind]) {
        return kindMap[lowerKind]
      }

      // Try partial match (e.g., "Function from LibX" contains "function")
      for (const key in kindMap) {
        if (lowerKind.includes(key)) {
          return kindMap[key]
        }
      }

      // Fallback, could use docDetails for more hints
      // For example, if docDetails has `thisType` it's likely a method.
      // If docDetails has `args` it's likely a function or method.
      // If docDetails has `fields` it's likely a UDT/Class/Enum.
      if (docDetails?.thisType) {
        return vscode.CompletionItemKind.Method;
      }
      if (docDetails?.args) {
        return vscode.CompletionItemKind.Function;
      } // Could be Constructor too, but handled above
      if (docDetails?.fields || docDetails?.members) { // .members for enums
          if (kind?.toLowerCase().includes('enum')) {
            return vscode.CompletionItemKind.Enum;
          } // Check again if kind had 'enum'
          return vscode.CompletionItemKind.Class; // Default for things with fields
      }


      return vscode.CompletionItemKind.Text // Default fallback
    } catch (error) {
      console.error('Error in determineCompletionItemKind:', error)
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
      // If there's no text before the cursor, return an empty array
      if (!linePrefix) {
        return []
      }
      // If there are no completions in the shared state, match the text before the cursor
      const match = linePrefix.match(/[\w.]+$/)?.[0].trim()
      if (!match) {
        return []
      }

      const allCompletions: CompletionDoc[] = []
      allCompletions.push(...Class.pineCompletionService.getGeneralCompletions(match))
      allCompletions.push(...Class.pineCompletionService.getMethodCompletions(match))
      allCompletions.push(...Class.pineCompletionService.getUdtConstructorCompletions(match))
      allCompletions.push(...Class.pineCompletionService.getInstanceFieldCompletions(match))

      for (const completionDoc of allCompletions) {
        const vscodeCompletionItem = await this.createCompletionItem(
          document,
          completionDoc.name, // This is correct, completionDoc.name is the specific name
          completionDoc.namespace, // Correct
          completionDoc, // Pass the whole CompletionDoc object as the 'doc' argument
          position,
          false,
        )
        if (vscodeCompletionItem) {
          this.completionItems.push(vscodeCompletionItem)
        }
      }

      if (this.completionItems.length > 0) {
        return new vscode.CompletionList(this.completionItems, true)
      }
    } catch (error) {
      console.error(error)
      return []
    }
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

        // completionData is already a CompletionDoc object from PineCompletionService.getArgumentCompletions
        const docData = completionData as CompletionDoc

        // The name from CompletionDoc for arguments should be like "paramName="
        // The kind should be "Parameter" or similar, set by the service.
        // Let createCompletionItem handle the details based on CompletionDoc.
        const completionItem = await this.createCompletionItem(
          document,
          docData.name, // e.g., "length="
          docData.namespace ?? null,
          docData, // Pass the full CompletionDoc
          position,
          true, // True for argument completion
        )

        if (completionItem) {
          // Kind is already set by createCompletionItem via determineCompletionItemKind
          // Sort text is also set by CompletionService if needed, or can be set here.
          // Ensure createCompletionItem handles sortText or set it here if it's specific to arg context.
          // completionItem.sortText = `order${index.toString().padStart(4, '0')}`; // Already in CompletionDoc from service
          this.completionItems.push(completionItem)
          anyAdded = true
        }
        index++
      } // End of loop

      // Only clear completions if there are no more to suggest (moved outside loop)
      if (!anyAdded && completionsFromState.length > 0) {
        // If we had items but none were added (e.g., all filtered out), clear.
        // Or, if completionsFromState was empty to begin with, this won't run.
        // The original logic might have cleared too eagerly if the first item wasn't added.
        PineSharedCompletionState.clearCompletions()
        return []
      }

      if (this.completionItems.length > 0) { // Check if any items were actually added
        return new vscode.CompletionList(this.completionItems)
      } else {
        // If completionsFromState was not empty but resulted in no items (e.g. all filtered by prefix)
        // then we might not want to clear, to allow user to backspace and see them again.
        // However, if the intent is that once argumentCompletions is called, the state is "used", then clear.
        // For now, let's assume if nothing is added, the "current set" is exhausted.
        PineSharedCompletionState.clearCompletions()
        return []
      }
    } catch (error) {
      console.error('Error in argumentCompletions:', error)
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
