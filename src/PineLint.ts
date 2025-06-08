import { debounce } from 'lodash'
import * as vscode from 'vscode'
import { VSCode } from './VSCode'
import { Class } from './PineClass'
/**
 * PineLint class is responsible for linting Pine Script code.
 */
export class PineLint {
  static diagnostics: vscode.Diagnostic[] = []
  static initialFlag: boolean = true
  static version: string | null = null
  static fileName: string | null = null
  static diagnosticCollection: vscode.DiagnosticCollection

  /**
   * Getter for DiagnosticCollection.
   * Initializes the collection if it doesn't exist.
   */
  static get DiagnosticCollection(): vscode.DiagnosticCollection {
    if (!PineLint.diagnosticCollection) {
      PineLint.diagnosticCollection = vscode.languages.createDiagnosticCollection('pine')
    }
    return PineLint.diagnosticCollection
  }

  /**
   * Sets the file name.
   * @param fileName - The name of the file.
   */
  static setFileName(fileName: string): void {
    PineLint.fileName = fileName
  }

  /**
   * Gets the file name.
   * @returns The file name.
   */
  static async getFileName(): Promise<string | null> {
    await PineLint.checkVersion()
    return PineLint.fileName
  }

  /**
   * Formats the incoming PineRequest using PineFormatResponse.
   * @param incoming - The incoming PineRequest to be formatted.
   */
  static format(incoming: typeof Class.PineRequest): void {
    Class.PineFormatResponse.format(incoming)
  }

  /**
   * Sets the diagnostics for a given URI.
   * @param uri - The URI to set the diagnostics for.
   * @param diagnostics - The diagnostics to set.
   */
  static setDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
    PineLint.DiagnosticCollection.set(uri, diagnostics)
    PineLint.diagnostics = diagnostics
  }

  /**
   * Gets the current diagnostics.
   * @returns The diagnostics if they exist.
   */
  static getDiagnostics(): vscode.Diagnostic[] | undefined {
    return PineLint.diagnostics.length > 0 ? PineLint.diagnostics : undefined
  }

  /**
   * Performs initial linting if the initialFlag is true.
   */
  static async initialLint(): Promise<void> {
    if (PineLint.initialFlag) {
      PineLint.initialFlag = false
      PineLint.lint()
    }
  }

  /**
   * Lints the active document if it exists and the version is correct.
   */
  static async lintDocument(): Promise<void> {
    if (VSCode.ActivePineFile && !PineLint.initialFlag && (await PineLint.checkVersion())) {
      const response = await Class.PineRequest.lint()
      if (response) {
        PineLint.handleResponse(response)
        PineLint.format(response)
      }
    }
  }

  /**
   * Debounced version of the lintDocument method.
   */
  static lint = debounce(
    async () => {
      PineLint.lintDocument()
    },
    500,
    { leading: false, trailing: true },
  )

  /**
   * Updates the diagnostics for the active document.
   * @param dataGroups - The groups of data to update the diagnostics with.
   */
  static async updateDiagnostics(errors: any[], warnings: any[], infos?: any[]): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
      return
    }
    const documentUri = activeEditor.document.uri
    const targetEditor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === documentUri.toString(),
    )
    if (!targetEditor) {
      return
    }

    const diagnostics: vscode.Diagnostic[] = []
    // const errorDecorationRanges: vscode.Range[] = [] // Not used in current logic
    // const warningDecorationRanges: vscode.Range[] = [] // Not used in current logic

    // Process errors
    if (errors && errors.length > 0) {
      for (const data of errors) {
        const { end, message, start } = data
        const range = new vscode.Range(start.line - 1, start.column - 1, end.line - 1, end.column)
        let severity = vscode.DiagnosticSeverity.Error
        // Special case for calculation messages, might need re-evaluation
        if (message.includes('calculation')) {
          severity = vscode.DiagnosticSeverity.Warning
        }
        diagnostics.push(new vscode.Diagnostic(range, message, severity))
      }
    }

    // Process warnings
    if (warnings && warnings.length > 0) {
      for (const data of warnings) {
        const { end, message, start } = data
        const range = new vscode.Range(start.line - 1, start.column - 1, end.line - 1, end.column)
        // If a message was already classified as a warning by the 'calculation' check in errors,
        // it shouldn't be processed again here if backend might send it in both arrays.
        // However, the new structure implies distinct arrays for errors and warnings.
        diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning))
      }
    }

    // Process infos
    if (infos && infos.length > 0) {
      for (const data of infos) {
        const { end, message, start } = data
        const range = new vscode.Range(start.line - 1, start.column - 1, end.line - 1, end.column)
        diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Information))
      }
    }

    const uri = VSCode.Uri
    if (uri) {
      PineLint.setDiagnostics(uri, diagnostics)
    }
  }
  /**
   * Handles the response from the linting process.
   * @param response - The response from the linting process.
   */
  static async handleResponse(response: any): Promise<void> {
    if (VSCode.ActivePineEditor && response && response.success && response.result) {
      PineLint.updateDiagnostics(
        response.result.errors || [],
        response.result.warnings || [],
        response.result.info || [] // Add info messages if they exist in the new structure
      )
    } else if (response && !response.success) {
      // Handle unsuccessful responses, maybe clear diagnostics or log an error
      // For now, if the response indicates failure or is malformed, we clear diagnostics
      // or show a generic error. Let's clear diagnostics for now.
      const uri = VSCode.Uri
      if (uri) {
        PineLint.setDiagnostics(uri, [])
      }
      console.error("Linting request was not successful or result is missing:", response);
    }
    // The old code also had a path for response.reason2.errors, etc.
    // This is removed assuming the new structure is { success: boolean, result: { ... } }
    // The check for `response.result?.errors2` in `checkVersion` for version errors
    // might need to be updated if it's still relevant.
    // For now, this `handleResponse` focuses on the main linting flow.
  }

  /**
   * Handles changes to the active document.
   */
  static async handleDocumentChange(): Promise<void> {
    await PineLint.lint()
  }

  /**
   * Checks the version of PineLint.
   * @returns A boolean indicating whether the version is valid (5 or 6).
   */
  static async checkVersion(): Promise<boolean> {
    if (PineLint.version === '5' || PineLint.version === '6') {
      return true
    }

    const version_statement = /\/\/@version=(\d+)/
    const script_statement =
      /(?:indicator|strategy|library|study)\s*\((?:(?<!['\"].*)\btitle\s*=)?\s*('[^\']*'|"[^\"]*")/

    const document = VSCode?._Document()
    const replaced = document?.getText().replace(/\r\n/g, '\n')

    if (!replaced) {
      return false
    }

    const match = version_statement.exec(replaced)
    const namematch = script_statement.exec(replaced)
    if (!match || !match[1]) {
      return false
    }

    if (namematch) {
      if (namematch[1]) {
        PineLint.setFileName(namematch[1])
      }
      PineLint.version = match[1]

      if (match[1] === '5' || match[1] === '6') {
        PineLint.initialLint()
        return true
      } else if (match.index) {
        const matchPosition = document?.positionAt(match.index)
        const matchEndPosition = document?.positionAt(match.index + 12)
        const versionMsg = `Must be v5 or v6 for linting with this extension. Can convert v${match[1]} to v5 with the Pine Script Editor on ![TV](www.tradingview.com/pine)`

        if (matchPosition && matchEndPosition) {
          const errorObj = {
            success: true, // To align with the new structure expected by handleResponse
            result: {
              errors: [ // Changed from errors2 to errors
                {
                  start: { line: matchPosition.line + 1, column: matchPosition.character + 1 },
                  end: { line: matchEndPosition.line + 1, column: matchEndPosition.character + 1 },
                  message: versionMsg,
                },
              ],
              warnings: [], // Add empty arrays for other expected properties
              info: []      // Add empty arrays for other expected properties
            },
          }
          PineLint.handleResponse(errorObj)
        }
        return false
      }
    }
    return false
  }

  /**
   * Clears the script version for PineLint.
   */
  static versionClear(): void {
    PineLint.version = null
  }
}
