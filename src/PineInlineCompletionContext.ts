// src/PineInlineCompletionContext.ts
import { Helpers, PineSharedCompletionState } from './index' // Assuming these are correctly defined elsewhere
import { Class } from './PineClass' // Assuming PineDocsManager is accessed via Class
import * as vscode from 'vscode'
// PineCompletionService and CompletionDoc are not used in this file.

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

async function safeExecute<T>(action: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await action()
  } catch (error) {
    console.error(error)
    return fallback
  }
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

      // Argument context is handled by the regular SignatureHelp provider now,
      // so we can simplify this part for inline suggestions.

      // Match the word being typed
      const match = linePrefix.match(/[\w.]+$/)?.[0].trim()
      if (!match) {
        return []
      }

      // Use the centralized PineCompletionService
      const allCompletions = [
        ...Class.pineCompletionService.getGeneralCompletions(match),
        ...Class.pineCompletionService.getMethodCompletions(match),
        ...Class.pineCompletionService.getUdtConstructorCompletions(match),
        ...Class.pineCompletionService.getInstanceFieldCompletions(match),
      ];

      // Inline completions usually show one best-fit item. We'll find the first good match.
      if (allCompletions.length > 0) {
        // For simplicity, we'll take the first result from the service.
        // A more advanced implementation could score them.
        const bestSuggestion = allCompletions[0];

        // createInlineCompletionItem expects the full doc object.
        const vscodeCompletionItem = await this.createInlineCompletionItem(
          document,
          bestSuggestion.name,
          bestSuggestion.namespace,
          bestSuggestion, // Pass the whole CompletionDoc object
          position,
          false,
        )

        if (vscodeCompletionItem) {
          this.completionItems.push(vscodeCompletionItem);
        }
      }

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
          null, // namespace for arguments is typically null
          bestSuggestionForInline, // the doc object
          position,
          true, // this is an argument completion
        ) // Corrected: Removed extra argument that was causing a mismatch
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
