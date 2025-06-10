import { Class } from './PineClass'
import { PineDocString } from './PineDocString'
import { PineResponseFlow } from './PineFormatResponse'
// import { PineTypify } from './index' // REMOVED
import { PineLint } from './PineLint'
import { checkForNewVersionAndShowChangelog } from './newVersionPopUp'
import * as vscode from 'vscode'
import { PineCompletionService } from './PineCompletionService'

export function deactivate() {
  PineLint.versionClear()
  PineLint.handleDocumentChange()
  return undefined
}

let timerStart: number = 0
// Make it so that if there is no change within 5 seconds it runs a lint
function checkForChange() {
  if (timerStart !== 0) {
    let timerEnd: number = new Date().getTime()
    if (timerEnd - timerStart > 5000) {
      PineLint.handleDocumentChange()
      timerStart = 0
    }
  }
}

setInterval(checkForChange, 5000)

// Activate Function =============================================
export async function activate(context: vscode.ExtensionContext) {
  console.log('Pine Language Server Activate')

  // Check for new version
  checkForNewVersionAndShowChangelog(context)

  // Set context
  Class.setContext(context)

  // Initialize PineDocsManager and PineCompletionService
  // PineDocsManager is accessed via a getter that initializes it if not already.
  // We need to ensure PineDocsManager is ready before PineCompletionService uses it.
  // Accessing the getter ensures it's initialized.
  const docmanager = Class.PineDocsManager // Ensure PineDocsManager is initialized
  Class.pineCompletionService = new PineCompletionService(docmanager)

  PineLint.initialLint()

  // Push subscriptions to context
  context.subscriptions.push(
    PineLint.DiagnosticCollection,
    vscode.window.onDidChangeActiveTextEditor(async () => {
      docmanager.cleanDocs()
      PineResponseFlow.resetDocChange()
      const editor = vscode.window.activeTextEditor
      if (editor?.document.languageId !== 'pine' && !(editor && editor.document.languageId === 'pine' && editor.document.uri.scheme === 'file')) {
        deactivate()
      } else {
        if (PineLint.diagnostics.length > 0 && editor?.document.uri) {
          PineLint.DiagnosticCollection.set(editor.document.uri, PineLint.diagnostics)
        }
        PineLint.initialFlag = true
        PineLint.initialLint()
      }
    }),
    vscode.workspace.onDidOpenTextDocument(async () => {
      const editor = vscode.window.activeTextEditor
      if (editor && editor.document.languageId === 'pine' && editor.document.uri.scheme === 'file') {
        PineLint.handleDocumentChange()
      }
    }),

    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const editor = vscode.window.activeTextEditor
      if (event.contentChanges.length > 0 && (editor && editor.document.languageId === 'pine' && editor.document.uri.scheme === 'file')) {
        PineLint.handleDocumentChange()
        timerStart = new Date().getTime()
      }
    }),

    vscode.workspace.onDidChangeConfiguration(() => {
      console.log('Configuration changed')
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      console.log('Document closed:', document.fileName)
      PineLint.handleDocumentChange()
    }),

    vscode.workspace.onDidSaveTextDocument((document) => {
      console.log('Document saved:', document.fileName)
    }),

    vscode.commands.registerCommand('pine.docString', async () => new PineDocString().docstring()),
    vscode.commands.registerCommand('pine.getStandardList', async () => Class.PineScriptList.showMenu('built-in')),
    // vscode.commands.registerCommand('pine.typify', async () => new PineTypify().typifyDocument()), // REMOVED
    vscode.commands.registerCommand('pine.getIndicatorTemplate', async () => Class.PineTemplates.getIndicatorTemplate()),
    vscode.commands.registerCommand('pine.getStrategyTemplate', async () => Class.PineTemplates.getStrategyTemplate()),
    vscode.commands.registerCommand('pine.getLibraryTemplate', async () => Class.PineTemplates.getLibraryTemplate()),
    vscode.commands.registerCommand('pine.setUsername', async () => Class.PineUserInputs.setUsername()),
    vscode.commands.registerCommand('pine.completionAccepted', () => Class.PineCompletionProvider.completionAccepted()),
    vscode.languages.registerColorProvider({ scheme: 'file', language: 'pine' }, Class.PineColorProvider),
    vscode.languages.registerHoverProvider({ scheme: 'file', language: 'pine' }, Class.PineHoverProvider),
    vscode.languages.registerHoverProvider({ scheme: 'file', language: 'pine' }, Class.PineLibHoverProvider),
    vscode.languages.registerRenameProvider({ scheme: 'file', language: 'pine' }, Class.PineRenameProvider),
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: 'file', language: 'pine' },
      Class.PineInlineCompletionContext,
    ),
    vscode.languages.registerSignatureHelpProvider(
      { scheme: 'file', language: 'pine' },
      Class.PineSignatureHelpProvider,
      '(',
      ',',
      '',
    ),
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'pine' }, Class.PineLibCompletionProvider),
    vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'pine' },
      Class.PineCompletionProvider,
      '.',
      ',',
      '(',
    ),
    // vscode.commands.registerCommand                       ('pine.startProfiler'        , () => {console.profile('Start of Start Profiler (Command Triggered')}) ,
    // vscode.commands.registerCommand                       ('pine.stopProfiler'         , () => {console.profileEnd('End of Start Profiler (Command Triggered')}),
    // vscode.commands.registerCommand                       ('pine.getSavedList'         , async () => Class.PineScriptList.showMenu('saved'))                    ,
    // vscode.commands.registerCommand                       ('pine.saveToTv'             , async () => { await Class.PineSaveToTradingView() } )                  ,
    // vscode.commands.registerCommand                       ('pine.compareWithOldVersion', async () => Class.PineScriptList.compareWithOldVersion())              ,
    // vscode.commands.registerCommand                       ('pine.setSessionId'         , async () => Class.pineUserInputs.setSessionId())                       ,
    // vscode.commands.registerCommand                       ('pine.clearKEYS'            , async () => Class.PineUserInputs.clearAllInfo())                       ,

    vscode.commands.registerCommand('extension.forceLint', async () => {
      const response = await Class.PineRequest.lint()
      if (response) {
        console.log(response)
      }
    }),
  )
}
