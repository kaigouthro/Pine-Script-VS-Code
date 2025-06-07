import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
// VSCode helper is not strictly needed here anymore if we remove the flag check
// import { VSCode } from './VSCode'

export function checkForNewVersionAndShowChangelog(context: vscode.ExtensionContext) {
  // Read the user's setting from their VS Code configuration
  const config = vscode.workspace.getConfiguration('pinescript')
  const showChangelog = config.get<boolean>('showChangelogOnUpdate')

  // If the user has disabled this feature, do nothing.
  if (showChangelog === false) {
    return
  }

  // The original logic continues from here...
  const extensionDir = context.extensionPath
  const newVersionFileFlag = path.join(extensionDir, '.update')
  const changelogFilePath = path.join(extensionDir, 'CHANGELOG.md')

  // Read the content of .update
  fs.readFile(newVersionFileFlag, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading .update:', err)
      return
    }

    // Check if the content is "true"
    if (data.trim() === 'true') {
      // Open CHANGELOG.md in a Markdown preview in the second editor group
      const uri = vscode.Uri.file(changelogFilePath)
      vscode.commands.executeCommand('markdown.showPreviewToSide', uri).then(
        () => {
          // Rewrite .update with "false"
          fs.writeFile(newVersionFileFlag, 'false', (writeErr) => {
            if (writeErr) {
              console.error('Error writing to .update:', writeErr)
            }
          })
        },
        (error) => {
          console.error('Error opening Markdown preview:', error)
        },
      )
    }
  })
}
