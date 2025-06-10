/**
 * # Signature Help for UDT.new
 * - Analyze how UDT fields are processed for signature help.
 * - Verify `fieldCompletions` and `fieldArgsForState` population.
 * - Check `PineSharedCompletionState` update for UDT fields.
 * - Ensure `udtSignature` construction is correct.
 *
 * # Debugging UDT.new Completion Flow
 * - Add `console.log` in `isUdtNew` block to inspect data.
 *   - `udtName`, `udtDocs`
 *   - `fieldCompletions`, `fieldArgsForState`, `fieldNames`
 *   - `PineSharedCompletionState` data
 *   - `this.signatureHelp`
 * - Examine output to identify data discrepancies.
 *
 * # Hypothesis: Incorrect Active Argument or Completion Filtering for UDTs
 * - Check if `PineSharedCompletionState` handles multiple UDT fields.
 * - Review `PineCompletionProvider` (if available) for UDT completion logic.
 * - Verify `activeArg` updates and filtering in `UDT.new`.
 *
 * # Refinement: Robust UDT Handling
 * - After fix, refactor for clarity and efficiency in UDT field handling.
 * - Consider a dedicated helper for UDT logic.
 * - Add tests for UDT.new scenarios to prevent regressions.
 */

import { Helpers, PineSharedCompletionState } from './index'
import { Class } from './PineClass'
import * as vscode from 'vscode'
import { PineDocsManager } from './PineDocsManager'
// PineCompletionService is accessed via Class.pineCompletionService

interface CompletionItem {
  name: string
  kind: string
  desc: string
  preselect?: boolean
  required?: boolean
  defaultValue?: any
}

/**
 * Provides signature help for Pine functions.
 */
export class PineSignatureHelpProvider implements vscode.SignatureHelpProvider {
  private signatureHelp: vscode.SignatureHelp = new vscode.SignatureHelp()
  private line: string = ''
  private lineLength: number = 0
  private position: vscode.Position = new vscode.Position(0, 0)
  private document: vscode.TextDocument | undefined
  private paramIndexes: string[][] = []
  private activeArg: string | null = null
  private activeSignature: number = 0
  private activeFunction: string | null = null
  private activeParameter: number | null = null
  private commaSwitch: number = 0
  private lastIndex: number = 0
  private hasEqual: boolean = false
  private usedParams: string[] = []
  private isParamOrArg: boolean = false
  private argsLength: number = 0
  private offset: number = 0
  private newFunction: boolean = false
  private keyValueMatchesSave: any = null
  private lastSelection: string | null = null
  // private pineCompletionService: PineCompletionService // Removed
  private docsToMatchArgumentCompletions?: Map<string | number, PineDocsManager> = Class.PineDocsManager.getMap(
    'variables',
    'constants',
    'controls',
    'types',
  )

  constructor() {
    // Constructor is now empty or can be used for other initializations
    // if (!Class.pineCompletionService) {
    //     console.error("PineCompletionService not initialized in Class object!");
    // }
  }

  /**
   * Provides signature help for a Pine function.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param _token - A cancellation token.
   * @param _context - The signature help context.
   * @returns A SignatureHelp object or null.
   */
  public async provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken, // eslint-disable-line @typescript-eslint/no-unused-vars
    _context: vscode.SignatureHelpContext, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<vscode.SignatureHelp | null> {
    try {
      this.initializeState(document, position)

      if (this.shouldReturnEarly()) {
        this.resetState()
        return null
      }

      if (this.detectNewFunction()) {
        this.resetFunctionState()
      }

      const functionName = this.extractFunctionName()
      let isUdtNew = false
      let udtName: string | null = null

      if (functionName && functionName.endsWith('.new')) {
        udtName = functionName.substring(0, functionName.length - 4)
        const udtMap = Class.PineDocsManager.getMap('UDT', 'types')
        if (udtMap.has(udtName)) {
          isUdtNew = true
          // const udtFunctionName = udtName; // Not used
        } else {
          // If udtName.new was typed but udtName is not a known UDT, treat as normal function.
          isUdtNew = false;
          udtName = null; // Reset udtName if not a valid UDT context
        }
      }

      if (isUdtNew && udtName) {
        const constructorDocs = Class.pineCompletionService.getFunctionDocs(udtName + '.new')

        if (constructorDocs && Array.isArray(constructorDocs.args)) {
          const constructorArgs = constructorDocs.args; // This is the array of rich argument objects
          const argNames = constructorArgs.map((arg: any) => arg.name);

          // Populate PineSharedCompletionState with argument details for completion provider
          const sharedArgsForState: CompletionItem[] = constructorArgs.map((arg: any, index: number) => ({
            name: `${arg.name}=`,
            kind: 'Parameter', // Or 'Field' if preferred for UDT constructor params
            desc: arg.desc || `Parameter ${arg.name} of type ${arg.displayType || arg.type}.`,
            defaultValue: arg.default,
            required: arg.required !== false, // Assume required if not explicitly false
            preselect: index === 0,
          }));
          // PineSharedCompletionState.setCompletions({ [udtName + ".new"]: sharedArgsForState }); // Or set per active arg later
          PineSharedCompletionState.setArgs(argNames); // Set names for active parameter calculation

          // Build SignatureInformation
          // Use constructorDocs.syntax if available and suitable, otherwise build from args
          let sigLabel = constructorDocs.syntax;
          if (!sigLabel || typeof sigLabel !== 'string' || !sigLabel.includes('(')) {
             sigLabel = `${udtName}.new(${constructorArgs
            .map((arg: any) => `${arg.name}: ${arg.displayType || arg.type}${arg.default ? ` = ${arg.default}` : ''}`)
            .join(', ')})`;
          }

          const udtConstructorSignature = new vscode.SignatureInformation(sigLabel);

          if (constructorDocs.desc) {
            udtConstructorSignature.documentation = new vscode.MarkdownString(constructorDocs.desc);
          }

          udtConstructorSignature.parameters = constructorArgs.map((arg: any) => {
            const paramLabel = `${arg.name}: ${arg.displayType || arg.type}`;
            let paramDoc = new vscode.MarkdownString();
            paramDoc.appendCodeblock(`(parameter) ${paramLabel}`, 'pine'); // Use 'parameter' kind
            if (arg.desc) {
              paramDoc.appendMarkdown(`\n\n${arg.desc}`);
            }
            if (arg.default) {
              paramDoc.appendMarkdown(`\n\n*Default: \`${arg.default}\`*`);
            }
            return new vscode.ParameterInformation(paramLabel, paramDoc);
          });

          this.signatureHelp.signatures.push(udtConstructorSignature);
          this.paramIndexes = [argNames]; // Store names for active parameter calculation
          this.activeSignature = 0; // Only one signature for the constructor usually

          this.signatureHelp.activeParameter = this.calculateActiveParameter();
          PineSharedCompletionState.setActiveParameterNumber(this.signatureHelp.activeParameter);

          // Send completions for the current active parameter
          // constructorDocs itself is the rich function object.
          // activeSignatureHelper needs to be an array of {arg: name, type: type}
          const activeSignatureHelperForConstructor = constructorArgs.map((arg: any) => ({ arg: arg.name, type: arg.displayType || arg.type }));
          await this.sendCompletions(constructorDocs, activeSignatureHelperForConstructor);

          await this.setActiveArg(this.signatureHelp);

          // --- DEBUG LOGS ---
          // console.log('UDT Name:', udtName)
          // console.log('UDT Docs:', udtDocs)
          // console.log('Field Completions:', fieldCompletions)
          // console.log('Field Args for State:', fieldArgsForState)
          // console.log('Field Names:', fieldNames)
          // console.log(
          //   'PineSharedCompletionState Completions:',
          //   PineSharedCompletionState.getCompletions(),
          // )
          // console.log('PineSharedCompletionState Args:', PineSharedCompletionState.getArgs())
          // console.log('Signature Help:', this.signatureHelp)
          // --- DEBUG LOGS ---

          return this.signatureHelp
        }
      }

      if (!functionName) {
        return null
      }

      // const { isMethod, map } = this.determineFunctionType(functionName)
      // if (!map) {
      //   return null
      // }
      // const docs = map.get(functionName)

      const docs = Class.pineCompletionService.getFunctionDocs(functionName)

      if (!docs) {
        return null
      }

      const isMethod = docs.kind === 'Method' // Determine if it's a method from the service response
      // const methodString = isMethod ? this.extractMethodString(docs) : null // extractMethodString might be obsolete if service provides full name
      const methodString = isMethod ? functionName : null // Use functionName if it's a method (e.g. namespace.methodName)

      const [buildSignatures, activeSignatureHelper, paramIndexes] = this.buildSignatures(docs, isMethod, methodString)
      this.paramIndexes = paramIndexes
      this.signatureHelp.signatures = buildSignatures

      this.signatureHelp.activeParameter = this.calculateActiveParameter()
      this.signatureHelp.activeSignature = this.calculateActiveSignature(activeSignatureHelper)

      PineSharedCompletionState.setActiveParameterNumber(this.signatureHelp.activeParameter)

      await this.sendCompletions(docs, activeSignatureHelper[this.signatureHelp.activeSignature])
      await this.setActiveArg(this.signatureHelp)

      return this.signatureHelp
    } catch (error) {
      console.error('signatureProvider error', error)
      this.activeSignature = 0
      return null
    }
  }

  private initializeState(document: vscode.TextDocument, position: vscode.Position): void {
    this.line = document.lineAt(position).text
    this.position = position
    this.document = document
    this.signatureHelp = new vscode.SignatureHelp()
  }

  private shouldReturnEarly(): boolean {
    const lastCloseParenIndex =
      this.line.lastIndexOf(')', this.position.character) > -1 ? this.line.lastIndexOf(')', this.position.character) : 0
    return this.position.isAfter(new vscode.Position(this.position.line, lastCloseParenIndex))
  }

  private resetState(): void {
    this.activeFunction = null
    this.commaSwitch = 0
    this.argsLength = 0
    this.activeSignature = 0
    this.activeParameter = 0
    this.offset = 0
    this.activeArg = null
    this.newFunction = true
    this.lastSelection = null
    PineSharedCompletionState.clearCompletions()
  }

  private detectNewFunction(): boolean {
    const functionMatch = /.*?([\w.]+)\s*\(/.exec(this.line)
    return !!functionMatch && functionMatch[1] !== this.activeFunction
  }

  private resetFunctionState(): void {
    this.activeFunction = /.*?([\w.]+)\s*\(/.exec(this.line)?.[1] ?? null
    this.activeSignature = 0
    this.activeParameter = 0
    this.commaSwitch = 0
    this.argsLength = 0
    this.offset = 0
    this.activeArg = null
    this.newFunction = true
    this.lastSelection = null
  }

  private extractFunctionName(): string | null {
    const lastOpeningParenIndex = this.line.lastIndexOf('(', this.position.character)
    const trim = this.line.slice(0, lastOpeningParenIndex)
    const trimMatch = trim.match(/([\w.]+)$/g)
    return trimMatch?.[0] || null
  }

  // private determineFunctionType(functionName: string): { isMethod: boolean; map: Map<string, PineDocsManager> | null } {
  //   let isMethod = false
  //   let map: Map<string, PineDocsManager> | null = null

  //   const funcMap = Class.PineDocsManager.getMap('functions', 'functions2')
  //   if (funcMap.has(functionName)) {
  //     return { isMethod, map: funcMap }
  //   }

  //   const methodMap = Class.PineDocsManager.getMap('methods', 'methods2')
  //   for (const key of methodMap.keys()) {
  //     const keySplit = key.includes('.') ? key.split('.')[1] : key
  //     const [namespace, methodName] = functionName.split('.')

  //     if (keySplit === methodName) {
  //       const type = Helpers.identifyType(namespace)
  //       const docs = methodMap.get(key)

  //       if (
  //         !type ||
  //         !docs ||
  //         (typeof type === 'string' && !docs.thisType.includes(Helpers.replaceType(type).replace(/<[^>]+>|\[\]/g, '')))
  //       ) {
  //         continue
  //       }

  //       isMethod = true
  //       return { isMethod, map: methodMap }
  //     }
  //   }

  //   return { isMethod, map }
  // }

  // private extractMethodString(docs: PineDocsManager): string | null {
  //   const trimMatch = this.line.slice(0, this.line.lastIndexOf('(', this.position.character)).match(/([\w.]+)$/g)
  //   const methodString = trimMatch?.[0] || null
  //   return methodString && docs.thisType ? methodString : null
  // }

  private buildSignatures(
    docs: any, // Changed from PineDocsManager to any to accept service response
    isMethod: boolean = false,
    methodString: string | null = null,
  ): [vscode.SignatureInformation[], Record<string, string>[][], string[][]] {
    const signatureInfo: vscode.SignatureInformation[] = []
    const activeSignatureHelper: Record<string, string>[][] = []
    let signatureParamIndexes: string[][] = []

    let syntax = (isMethod ? docs.methodSyntax : docs.syntax) ?? docs.syntax
    syntax = Array.isArray(syntax) ? syntax : [syntax]

    if (isMethod && methodString) {
      const namespace = methodString.split('.')[0]
      syntax = syntax.map((line: string) => {
        return line.includes('(') ? `${namespace}.${line}` : line.replace(/(?:[^.]+\.)?(.+)/, `${namespace}.$1`)
      })
    }

    for (const syn of syntax) {
      const sanitizedSyntax = Helpers.replaceFunctionSignatures(Helpers.replaceType(syn))
      const [parameters, paramIndexes, activeSignatureHelp, updatedSyntax] = this.buildParameters(docs, sanitizedSyntax)

      const signatureInformation = new vscode.SignatureInformation(updatedSyntax)
      signatureInformation.parameters = parameters
      signatureParamIndexes.push(paramIndexes)
      signatureInfo.push(signatureInformation)
      activeSignatureHelper.push(activeSignatureHelp)
    }

    return [signatureInfo, activeSignatureHelper, signatureParamIndexes]
  }

  private buildParameters(
    // docs: PineDocsManager, // Old: expected PineDocsManager structure
    docs: any, // New: accepting rich function object from PineCompletionService.getFunctionDocs
    syntax: string, // The signature string for display, may come from docs.syntax
  ): [vscode.ParameterInformation[], string[], Record<string, string>[], string] {
    const parameters: vscode.ParameterInformation[] = []
    const paramIndexes: string[] = []
    const activeSignatureHelper: Record<string, string>[] = []

    // Use docs.syntax for the main signature string if available and valid, otherwise use/fallback to the passed 'syntax'
    let displaySyntax = syntax; // Default to passed syntax
    if (Array.isArray(docs.syntax) && docs.syntax.length > 0) {
        displaySyntax = Helpers.replaceFunctionSignatures(Helpers.replaceType(docs.syntax[0]));
    } else if (typeof docs.syntax === 'string') {
        displaySyntax = Helpers.replaceFunctionSignatures(Helpers.replaceType(docs.syntax));
    }
    // If displaySyntax is still just a function name (e.g. no '()'), reconstruct it.
    if (!displaySyntax.includes('(') && docs.name) {
        const argsString = (docs.args || [])
            .map((arg: any) => `${arg.name}: ${arg.displayType || arg.type}`)
            .join(', ');
        displaySyntax = `${docs.name}(${argsString})`;
    }


    if (!Array.isArray(docs.args)) {
      // If docs.args is not an array (e.g., missing or wrong format), return empty/default
      console.warn('docs.args is not an array or is missing in buildParameters for:', docs.name);
      return [parameters, paramIndexes, activeSignatureHelper, displaySyntax];
    }

    for (const argDoc of docs.args) { // Iterate directly over the rich argument objects
      const argName = argDoc.name;
      const argType = argDoc.displayType || argDoc.type || 'unknown';
      const argDesc = argDoc.desc || '';
      const { defaultValue: defaultValueStr, required } = this.getParameterDetails(argDoc); // Use helper for default and required

      const paramLabelForInfo = `${argName}${required ? '' : '?'}: ${argType}${defaultValueStr}`;

      const paramDocumentation = new vscode.MarkdownString();
      paramDocumentation.appendMarkdown(`**${argName}**`);
      if (!required) {
        paramDocumentation.appendMarkdown(` (optional)`);
      }
      paramDocumentation.appendCodeblock(`${argType}${defaultValueStr}`, 'pine');
      if (argDesc) {
        paramDocumentation.appendMarkdown(`\n\n${argDesc.trim()}`);
      }

      // For vscode.ParameterInformation, the label can be a substring of the full signature or just name:type
      // Let's try to find its position in the displaySyntax or use a simplified label.
      let paramLabelForVscode: string | [number, number] = `${argName}: ${argType}`; // Fallback label
      const regexToFindParam = new RegExp(`\\b${argName}\\b`);
      const matchInSyntax = regexToFindParam.exec(displaySyntax);
      if (matchInSyntax) {
          const start = matchInSyntax.index;
          // Attempt to find the end of the parameter definition (e.g., up to comma, closing paren, or default value)
          let end = displaySyntax.indexOf(',', start);
          if (end === -1) {
            end = displaySyntax.indexOf(')', start);
          }
          if (end === -1) {
            end = displaySyntax.length;
          } // Fallback

          // More precise end: find where type ends, or default value ends
          const segment = displaySyntax.substring(start, end);
          paramLabelForVscode = [start, start + segment.trimEnd().length];
      } else {
          // If not found in syntax (e.g. syntax was minimal), use the constructed label
          paramLabelForVscode = paramLabelForInfo;
      }


      parameters.push(new vscode.ParameterInformation(paramLabelForVscode, paramDocumentation));
      paramIndexes.push(argName);
      activeSignatureHelper.push({ arg: argName, type: argType });
    }

    return [parameters, paramIndexes, activeSignatureHelper, displaySyntax];
  }

  private getParameterDetails(argDoc: any): { defaultValue: string; required: boolean } {
    // argDoc is one item from the 'args' array of the function/method documentation
    let defaultValue = '';
    // Check if argDoc.default is explicitly provided by the linter
    if (argDoc.hasOwnProperty('default')) { // Check if 'default' key exists
        if (argDoc.default === null || argDoc.default === 'null') {
            defaultValue = ' = na'; // Represent null/na
        } else if (typeof argDoc.default === 'string' && argDoc.default.trim() !== '') {
            defaultValue = ` = ${argDoc.default}`;
        } else if (typeof argDoc.default === 'number' || typeof argDoc.default === 'boolean') {
            defaultValue = ` = ${argDoc.default.toString()}`;
        }
        // If argDoc.default is an empty string or undefined, defaultValue remains empty string.
    }

    // 'required' should also come directly from argDoc if the linter provides it
    // If argDoc.required is explicitly false, it's optional.
    // If argDoc.required is true or undefined (and no default value making it optional), it's required.
    const required = argDoc.required === true || (argDoc.required !== false && defaultValue === '');

    return { defaultValue, required };
  }

  private calculateActiveParameter(): number {
    const lastOpeningParenthesisIndex = this.line.lastIndexOf('(', this.position.character - 1)
    if (lastOpeningParenthesisIndex === -1) {
      console.error('No opening parenthesis found, unable to determine active parameter.')
      return 0
    }

    this.usedParams = []
    const substringToPosition = this.line.substring(lastOpeningParenthesisIndex + 1, this.position.character)
    const args = substringToPosition.split(',')
    this.activeParameter = args.length - 1

    let highestIndex = -1
    let flag = false
    this.hasEqual = false

    const selectedParam = PineSharedCompletionState.getSelectedCompletion

    for (const split of args) {
      if (split.includes('=')) {
        const splitEq = split.split('=')[0].trim()
        const paramIndex = this.paramIndexes[this.activeSignature].findIndex((param) => param === splitEq)
        if (paramIndex > -1) {
          highestIndex = Math.max(highestIndex, paramIndex)
          this.activeParameter = paramIndex
          this.usedParams.push(splitEq)
          flag = false
          this.hasEqual = true
        }
      } else {
        highestIndex++
        this.usedParams.push(this.paramIndexes[this.activeSignature][highestIndex])
        this.activeParameter = highestIndex
        flag = true
        this.hasEqual = false
      }
    }

    if (selectedParam) {
      const selectedParamIndex = this.paramIndexes[this.activeSignature].findIndex(
        (param) => param === selectedParam.replace('=', '').trim(),
      )
      if (selectedParamIndex > -1) {
        this.activeParameter = selectedParamIndex
        this.usedParams.push(selectedParam.replace('=', '').trim())
        flag = false
      }
    }

    if (this.paramIndexes[this.activeSignature]) {
      this.activeArg = this.paramIndexes[this.activeSignature][this.activeParameter]
      if (this.activeParameter >= this.paramIndexes[this.activeSignature].length) {
        console.error('Unable to determine active parameter, returning 0.')
        return 0
      }
    }

    this.usedParams = [...new Set(this.usedParams)]
    if (flag) {
      this.usedParams.pop()
    }
    return this.activeParameter ?? 0
  }

  private calculateActiveSignature(activeSignatureHelper: Record<string, string>[][]): number {
    try {
      if (activeSignatureHelper.length <= 1 && this.activeSignature === 0) {
        return this.activeSignature
      }

      const startToCursor = this.line.slice(0, this.position.character)
      const openingParenIndex = startToCursor.lastIndexOf('(', this.position.character) + 1
      const openingParenToCursor = startToCursor.slice(openingParenIndex, this.position.character)
      const closingParenIndex = openingParenToCursor.lastIndexOf(')')
      const functionCallNoParens = openingParenToCursor.slice(
        0,
        closingParenIndex > -1 ? closingParenIndex : openingParenToCursor.length,
      )
      const matchEq = functionCallNoParens.match(/(\b\w+)\s*=/g)

      let sigMatch: number[] = []

      if (matchEq) {
        matchEq.shift()
        for (const eq of matchEq) {
          for (const [index, help] of activeSignatureHelper.entries()) {
            if (help.some((h) => h.arg === eq.trim())) {
              sigMatch.push(index)
              break
            }
          }
        }
      }

      if (sigMatch.length === 1) {
        this.activeSignature = sigMatch[0]
        return this.activeSignature
      }

      const match = functionCallNoParens.replace(/\(.*\)|\[.*\]/g, '').match(/([^,]+)+/g)
      if (!match) {
        return this.activeSignature
      }

      const popMatch = match.pop()?.trim()
      if (!popMatch) {
        return this.activeSignature
      }

      const iType = Helpers.identifyType(popMatch)

      sigMatch = []
      for (const [index, help] of activeSignatureHelper.entries()) {
        if (help[this.signatureHelp.activeParameter]?.type === iType) {
          sigMatch.push(index)
        }
      }

      if (sigMatch.length === 1) {
        this.activeSignature = sigMatch[0]
        return this.activeSignature
      }

      return this.activeSignature
    } catch (error) {
      console.error('Error occurred:', error)
      return this.activeSignature
    }
  }

  private getArgTypes(argDoc: Record<string, any>): string[] | null {
    // argDoc is a rich argument object from the function's 'args' array
    try {
      let types: string[] = [];
      if (Array.isArray(argDoc?.allowedTypeIDs) && argDoc.allowedTypeIDs.length > 0) {
        // TODO: If allowedTypeIDs are numeric IDs, they need to be resolved to type names.
        // For now, assuming they might contain type names directly or special keywords.
        // This part might need more context on how allowedTypeIDs are structured and used.
        // If they are actual type names (e.g., ["string", "series float"]), use them.
        // If they are IDs that need lookup, that's a larger change.
        // Let's assume for now they can be processed by Helpers.formatTypesArray or are direct type strings.
        types = [...argDoc.allowedTypeIDs];
      } else if (argDoc?.displayType) {
        types = [argDoc.displayType];
      } else if (argDoc?.type) {
        types = [argDoc.type];
      }

      if (types.length === 0) {
        return null;
      }

      // Filter out nulls/undefined before formatting, though types array initialization avoids this.
      const validTypes = types.filter(t => t !== null && t !== undefined) as string[];
      if (validTypes.length === 0) {
        return null;
      }

      // Helpers.formatTypesArray likely expects an array of type strings and processes them.
      return Helpers.formatTypesArray(validTypes);
    } catch (error) {
      console.error('getArgTypes error:', error);
      return null
    }
  }

  private async sendCompletions(
    docs: Record<string, any>,
    activeSignatureHelper: Record<string, string>[], // This seems to be just [{arg: name, type: type}, ...] for the current signature
  ): Promise<void> {
    try {
      const buildCompletions: Record<string, any> = {};

      // docs.args is the array of rich argument objects from the linter
      if (!Array.isArray(docs.args)) {
        console.error('sendCompletions: docs.args is not an array for function:', docs.name);
        return;
      }
      const allArgNamesFromDocs = docs.args.map((arg: any) => arg.name);

      // paramArray: suggestions for "paramName=" items
      // This should be built from docs.args directly, not activeSignatureHelper which is simpler.
      const paramArray: CompletionItem[] = docs.args
        .map((argDoc: any): CompletionItem | null => {
          if (!argDoc || !argDoc.name) {
            return null;
          }
          return {
            name: `${argDoc.name}=`,
            kind: 'Parameter', // Or "NamedArgument"
            desc: argDoc.desc || `Parameter ${argDoc.name} of type ${argDoc.displayType || argDoc.type}.`,
            preselect: argDoc.name === this.activeArg, // Preselect if it's the current active argument
            // required: argDoc.required, // Not directly used by CompletionItem structure here, but good for context
            // defaultValue: argDoc.default, // Not directly used by CompletionItem structure here
          };
        })
        .filter((item: CompletionItem | null): item is CompletionItem => item !== null && !this.usedParams.includes(item.name.replace('=', '')));


      for (const argDoc of docs.args) { // Iterate over rich argDoc from function definition
        const argName = argDoc.name;
        if (!argName) {
          continue;
        }

        // Check if this argName is part of the current signature being processed by activeSignatureHelper
        // This check might be redundant if activeSignatureHelper is for the *active* signature from docs.args already
        const isActiveSignatureArg = activeSignatureHelper.some(param => param.arg === argName);
        if (!isActiveSignatureArg) {
          // This case should ideally not happen if activeSignatureHelper is correctly derived for the current signature
          buildCompletions[argName] = [];
          continue;
        }

        // `possibleValues` needs to be derived/handled. Linter gives `allowedTypeIDs`.
        // For now, let's assume `extractCompletions` will handle `argDoc` which contains `allowedTypeIDs`.
        // If `argDoc.possibleValues` was a specific field in the old structure, it's not in the new one.
        // `extractCompletions` will need to be adapted or this needs to be pre-processed.
        // For now, pass an empty array for `possibleValues` and let `extractCompletions` rely on `argDoc.allowedTypeIDs` or `argDoc.displayType`.
        const possibleValuesForExtract: string[] = []; // Placeholder - see extractCompletions

        const defaultValue = argDoc.default; // Already extracted in argDoc
        const displayType = argDoc.displayType || argDoc.type || '';
        const isString = displayType.toLowerCase() === 'string';

        // Pass the rich argDoc to extractCompletions
        const completions = [...(await this.extractCompletions(possibleValuesForExtract, argDoc, defaultValue, isString, paramArray))];
        buildCompletions[argName] = [...new Set(completions)];
      }

      PineSharedCompletionState.setCompletions(buildCompletions);
      PineSharedCompletionState.setArgs(allArgNamesFromDocs); // All arg names for the function
    } catch (error) {
      console.error('sendCompletions error:', error);
    }
  }

  private async extractCompletions(
    possibleValues: string[],
    docs: Record<string, any> | null,
    def: string | number | null,
    isString: boolean,
    paramArray: Record<string, any>[],
  ): Promise<any[]> {
    try {
      let completions: any[] = []

      if (def) {
        const defDocs = await this.getCompletionDocs(def)
        if (defDocs) {
          completions.push({ ...defDocs, default: true })
        }
      }

      if (possibleValues.includes('colors')) {
        possibleValues = [
          'color.black',
          'color.silver',
          'color.gray',
          'color.white',
          'color.maroon',
          'color.red',
          'color.purple',
          'color.fuchsia',
          'color.green',
          'color.lime',
          'color.olive',
          'color.yellow',
          'color.navy',
          'color.blue',
          'color.teal',
          'color.orange',
          'color.aqua',
        ]
      }

      for (const name of possibleValues) {
        if (!name || name === def) {
          continue
        }

        let nameEdit = typeof name === 'number' ? name : name.split(/[[(]/)[0]

        if (isString) {
          nameEdit = `"${nameEdit.toString()}"`.replace(/""/g, '"')
        }

        const completionDocs = await this.getCompletionDocs(nameEdit)
        completions.push(
          completionDocs || {
            name: name,
            kind: isString ? 'Literal String' : 'Other',
            desc: `${isString ? 'String' : 'Value'} ${nameEdit}.`,
            type: isString ? 'string' : 'unknown',
            default: false,
          },
        )
      }

      if (paramArray.length > 0 && !this.hasEqual) {
        completions.push(...paramArray)
      }

      // Add literal suggestions for primitive types if no specific values were found or to augment them
      if (docs) {
        // docs here is argDocs for the current parameter/field
        const currentArgPrimaryType = (this.getArgTypes(docs)?.[0] || '').toLowerCase() // Get primary type like 'string', 'bool', 'int', 'float'

        switch (currentArgPrimaryType) {
          case 'string':
            if (!completions.some((c) => c.name === '""' || c.kind === 'Literal String')) {
              // Avoid adding if already suggested (e.g. as a default)
              completions.push({
                name: '""',
                kind: 'Literal String',
                desc: 'Empty string literal.',
                type: 'string',
                default: false,
              })
            }
            break
          case 'bool':
            if (!completions.some((c) => c.name === 'true')) {
              completions.push({ name: 'true', kind: 'Boolean', desc: 'Boolean true.', type: 'bool', default: false })
            }
            if (!completions.some((c) => c.name === 'false')) {
              completions.push({ name: 'false', kind: 'Boolean', desc: 'Boolean false.', type: 'bool', default: false })
            }
            break
          case 'int':
          case 'float':
            // Check if '0' or a variant is already present from variable suggestions or default value
            const hasNumericZeroEquivalent = completions.some(
              (c) => c.name === '0' || c.name === '0.0' || c.name === 'na',
            )
            if (!hasNumericZeroEquivalent) {
              completions.push({
                name: '0',
                kind: 'Value',
                desc: `Number zero.`,
                type: currentArgPrimaryType,
                default: false,
              })
            }
            // Suggest 'na' for numeric types if not already present (often used as a default/nil value in Pine)
            if (!completions.some((c) => c.name === 'na')) {
              completions.push({
                name: 'na',
                kind: 'Value',
                desc: 'Not a number value.',
                type: currentArgPrimaryType,
                default: false,
              })
            }
            break
        }

        // Existing logic for suggesting variables of matching types
        const argTypes = this.getArgTypes(docs)
        // Reuse cached argTypes instead of re-calling this.getArgTypes(docs)
        const maps = [
          Class.PineDocsManager.getMap('fields2'),
          Class.PineDocsManager.getMap('variables2'),
          Class.PineDocsManager.getMap('variables', 'constants'),
        ]

        for (const [index, map] of maps.entries()) {
          map.forEach((doc) => {
            argTypes?.forEach((type: string) => {
              const docType = Helpers.replaceType(doc.type)
              if (docType === type) {
                completions.push({
                  ...doc,
                  syntax:
                    index === 0 && doc.parent ? `${doc.parent}.${doc.name}: ${docType}` : `${doc.name}: ${docType}`,
                  name: index === 0 && doc.parent ? `${doc.parent}.${doc.name}` : doc.name,
                  kind: `${doc.kind} | ${type}`,
                })
              }
            })
          })
        }
      }

      return completions.filter((completion) => completion)
    } catch (error) {
      console.error('extractCompletions error', error)
      return []
    }
  }

  private async getCompletionDocs(argName: string | number): Promise<typeof Class.PineDocsManager | null> {
    try {
      if (!this.docsToMatchArgumentCompletions) {
        return null
      }

      return this.docsToMatchArgumentCompletions.get(argName) ?? ({ name: argName, info: '' } as any)
    } catch (error) {
      console.error('getCompletionDocs error', error)
      return null
    }
  }

  private async setActiveArg(signatureHelp: vscode.SignatureHelp): Promise<void> {
    try {
      const activeSig = signatureHelp.signatures[signatureHelp.activeSignature]
      this.activeSignature = signatureHelp.activeSignature

      const sigLabel = activeSig?.label
      const index = signatureHelp.activeParameter
      let activeArg = activeSig?.parameters[index]?.label ?? null

      if (this.offset === 0) {
        this.offset += 1
      }

      if (!activeArg) {
        return
      }

      if (typeof activeArg !== 'string' && typeof activeArg !== 'number') {
        activeArg = sigLabel.substring(activeArg[0], activeArg[1])
      }

      PineSharedCompletionState.setActiveArg(activeArg)
    } catch (error) {
      console.error('setActiveArg error', error)
    }
  }

  private findRegexMatchPosition(syntax: string, arg: string): string | [number, number] | null {
    try {
      const regex = new RegExp(`\\b(${arg})(?!\\.|\\()\\b`)
      const match = regex.exec(syntax)

      if (match && match[1]) {
        const startIndex = match.index
        const endIndex = startIndex + match[1].length
        return [startIndex, endIndex]
      }

      return null
    } catch (error) {
      console.error('findRegexMatchPosition error', error)
      return null
    }
  }
}
