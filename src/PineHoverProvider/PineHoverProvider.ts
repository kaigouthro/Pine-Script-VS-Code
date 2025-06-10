import * as vscode from 'vscode'
import { PineDocsManager } from '../PineDocsManager'
import { PineHoverHelpers } from './PineHoverHelpers'
import { PineHoverBuildMarkdown } from './PineHoverBuildMarkdown'
import { PineHoverMethod } from './PineHoverIsMethod'
import { PineHoverFunction } from './PineHoverIsFunction'
import { PineHoverParam } from './PineHoverIsParam'
// import { PineConsole } from '../PineConsole'

export class PineHoverProvider implements vscode.HoverProvider {
  document: vscode.TextDocument
  position!: vscode.Position
  mapArrayMatrix: string = ''
  isMethod: boolean = false
  isFunction: boolean = false
  isParam: boolean = false
  isType: boolean = false

  constructor() {
    this.document = vscode.window.activeTextEditor?.document ?? vscode.workspace.textDocuments[0]
  }

  /**
   * @param {vscode.TextDocument} document - The active TextDocument in which the hover was invoked.
   * @param {vscode.Position} position - The Position at which the hover was invoked.
   * @param {vscode.CancellationToken} CancellationToken - A cancellation token.
   * @return {Promise<vscode.Hover | undefined>} - A promise that resolves to a Hover object providing the hover information, or undefined if no hover information is available.
   */
  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    CancellationToken: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    // Check if the document is valid
    const editor = vscode.window.activeTextEditor
    if (!(editor && editor.document.languageId === 'pine' && editor.document.uri.scheme === 'file')) {
      return
    }
    // not implemented yet
    if (CancellationToken.isCancellationRequested) {
      return
    }
    // Set the current document
    this.document = document
    this.position = position
    this.mapArrayMatrix = ''

    const lineRange = document.getWordRangeAtPosition(position, /(\S+)/)
    // If there's no word at the given position, return undefined
    if (!lineRange) {
      return
    }
    // Get the text from the start of the line until the given position
    const lineUntilPosition = document.getText(new vscode.Range(new vscode.Position(position.line, 0), position))
    // Regular expressions to match single-line comments
    const commentRegex = /^(?:(?!\/\/).)*\/\/.*$/
    const inlineCommentRegex = /^.*\/\/.*$/
    // If the line contains a comment, get the hover for the annotation
    if (commentRegex.test(lineUntilPosition) || inlineCommentRegex.test(lineUntilPosition)) {
      return this.annotationHover()
    }

    return await this.getFirstTruthyHover();
  }

  /** This function produces an array of hover functions.
   * @param {number} num - The number of the hover function to provide.
  */
  provideHoverFunctions(num: number = 0) {
    switch (num) {
      case 0:
        // console.log('functionsHover ProvideHoverFunctions')
        return this.functionsHover()
      case 1:
        // console.log('UDTHover ProvideHoverFunctions')
        return this.UDTHover()
      case 2:
        // console.log('controlsHover ProvideHoverFunctions')
        return this.controlsHover()
      case 3:
        // console.log('fieldsHover ProvideHoverFunctions')
        return this.fieldsHover()
      case 4:
        // console.log('typesHover ProvideHoverFunctions')
        return this.typesHover()
      case 5:
        // console.log('paramsHover ProvideHoverFunctions')
        return this.paramsHover()
      case 6:
        // console.log('variablesHover ProvideHoverFunctions')
        return this.variablesHover()
      case 7:
        // console.log('constantsHover ProvideHoverFunctions')
        return this.constantsHover()
      case 8:
        // console.log('methodsHover ProvideHoverFunctions')
        return this.methodsHover()
      default:
        return
    }
  }

  /** This function iterates through a list of hover functions and returns the first one that returns a truthy value.
   * @param {any} isTestPosition - The position to test.
   * @returns {Promise<vscode.Hover | undefined>} - A promise that resolves to a Hover object providing the hover information, or undefined if no hover information is available.
  */
  async getFirstTruthyHover(isTestPosition?: any): Promise<vscode.Hover | undefined> {
    if (isTestPosition) {
      this.position = isTestPosition.Position
    }
    for (let i = 0; i < 9; i++) {
      const hover = await this.provideHoverFunctions(i)
      if (hover) {
        return hover
      }
    }
  }

  /** This function provides hover information for types. */
  async typesHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('types')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, type] = regexAndDocs
    return this.processWordRange(
      type,
      new RegExp(
        '(?<!(?:int|float|bool|string|color|line|label|box|table|linefill|map|matrix|array)\\s+)(?:\\b' +
        hoverRegex +
        ')(?!>)(?!\\s*\\.|\\w|\\()(?:\\[\\])?',
        'g',
      ),
      'type',
      (key) => {
        this.mapArrayMatrix = key
        return key.replace(/map<[^,]+,[^>]+>/g, 'map<type,type>').replace(/(matrix|array)<[^>]+>/g, '$1<type>')
      },
    )
  }

  /** This function provides hover information for methods. */
  async methodsHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('methods', 'methods2')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, method] = regexAndDocs
    return this.processWordRange(
      method,
      new RegExp(
        '\\s*.\\s*(' + PineHoverHelpers.replaceAlias(`${hoverRegex}`) + ')(?=\\s*\\()',
        'g',
      ),
      'method',
      (key) => key,
    )
  }//\\b(?:([\\w.]+(?:\\([^)]*\\))?

  /** This function provides hover information for functions. */
  async functionsHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('functions', 'completionFunctions')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, func] = regexAndDocs
    return this.processWordRange(
      func,
      new RegExp('(?<!\\.\\s*)\\b(?:' + hoverRegex + ')(?=\\s*\\()', 'g'),
      'function',
      (key) => {
        this.mapArrayMatrix = key
        return key
          .replace(/map\.new<[^,]+,[^>]+>/g, 'map.new<type,type>')
          .replace(/(matrix\.new|array\.new)<[^>]+>/g, '$1<type>')
      },
    )
  }

  /** This function provides hover information for user-defined types. */
  async UDTHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('UDT')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, UDT] = regexAndDocs
    return this.processWordRange(UDT, new RegExp('\\b(?:' + hoverRegex + ')(?=\\s*\\.?)', 'g'), 'UDT', (key) => key)
  }

  /** This function provides hover information for controls. */
  async controlsHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('controls')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, control] = regexAndDocs
    return this.processWordRange(
      control,
      new RegExp('(?:\\b|^)(?:' + hoverRegex + ')(?!\\.|\\w|\\(|\\[)\\b', 'g'),
      'control',
      (key) => {
        return key.replace(/\s*\(/g, '').replace(/for\s+\w+\s+in/, 'for...in')
      },
    )
  }

  /** This function provides hover information for constants. */
  async constantsHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('constants')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, constant] = regexAndDocs
    return this.processWordRange(
      constant,
      new RegExp('\\b(?:' + hoverRegex + ')(?!\\.|\\w)', 'g'),
      'constant',
      (key) => key,
    )
  }

  /** This function provides hover information for fields. */
  async fieldsHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('fields', 'fields2')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, field] = regexAndDocs
    return this.processWordRange(
      field,
      new RegExp('(?<=\\.\\s*|(?:[\\w.<>\\[\\](]*?)\\s*)\\b(?:' + hoverRegex + ')\\b(?!\\s*?\\()', 'g'),
      'field',
      (key) => key,
    )
  }

  /** This function provides hover information for variables. */
  async variablesHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('variables', 'variables2')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, variable] = regexAndDocs
    return this.processWordRange(
      variable,
      new RegExp(
        '(?<=(?:' +
        hoverRegex +
        '|<)?)(?!\\[)(?:(?!,\\s*[\\w\\[\\]<>.]+\\s+)\\b(?:' +
        hoverRegex +
        ')\\b(?!\\s*[^)]+\\s+=>))(?!\\w|\\()\\b',
        '',
      ),
      'variable',
      (key) => key,
    )
  }

  /** This function provides hover information for parameters. */
  async paramsHover(): Promise<vscode.Hover | undefined> {
    const regexes = [
      /(?<=\(|,)(?:.*?\s*)(\w+\s*(?==|,|\)))+(?=.*=>)/gm,
      /(?<=[\w.]+\s*.*[\(,])\s*(?:[^(,]*?\s*)(?<!\n)(\w+\s*(?==))+(?=.+\))/gm,
      // /(?=[,\s]*)([\w]+?)\s*?(?=\s*=\s*[\w."'<>#]+\(?|,(?<!\.*?))/g,
      // /(?<=\(|,|[\w<>\[\].]*?)(\w+)(?:\s*=\s*[^\(,=>]+)?(?=(?=\)|,)|(?=\s*=>))/gm,
    ]

    const paramHover = (regex: RegExp) => this.processWordRange(null, regex, 'param', (key) => key.trim().split(' ').pop() ?? key)
    for (const regex of regexes) {
      const hover = await paramHover(regex)
      if (hover) {
        return hover
      }
    }
  }

  /** This function provides hover information for annotations. */
  async annotationHover() {
    const regexAndDocs = await PineHoverHelpers.formRegexGetDocs('annotations')
    if (!regexAndDocs) {
      return
    }
    const [hoverRegex, annotation] = regexAndDocs
    return this.processWordRange(annotation, new RegExp(`${hoverRegex}`, 'g'), 'annotation', (key) => key)
  }

  /** Processes a range of words in the document.
   * @param docs - The PineDocsManager instance.
   * @param hoverRegex - The regular expression hoverRegex to match.
   * @param regexId - The regular expression ID.
   * @param transformKey - The function to transform the key.
   * @returns A promise that resolves to a vscode.Hover instance or undefined.
   */
  private async processWordRange(
    docs: PineDocsManager | null,
    hoverRegex: RegExp | undefined,
    regexId: string,
    transformKey: (key: string) => string,
  ): Promise<vscode.Hover | undefined> {
    // If the regexId is not 'param' and either docs or hoverRegex is not defined, return undefined
    if (regexId !== 'param' && !docs) {
      return
    }

    // Set the type of the symbol based on the regexId
    this.isMethod = regexId === 'method'
    this.isFunction = regexId === 'function'
    this.isParam = regexId === 'param'
    this.isType = regexId === 'UDT'

    // Get the position of the symbol in the document
    if (!this.position) {
      return
    }

    // Get the range of the word at the position
    let wordRange: vscode.Range | undefined = this.document.getWordRangeAtPosition(this.position, hoverRegex)
    if (!wordRange) {
      return
    }

    // Transform the key
    let key = transformKey(this.document.getText(wordRange))

    // Get the documentation for the symbol
    const originalKeyedDocs = docs?.get(key)
    // Determine whether the symbol is a parameter, method, or function
    let resolvedValues = await this.paramMethodFunction(originalKeyedDocs, key, wordRange)
    if (!resolvedValues) {
      return
    }

    let [resolvedKeyedDocs, resolvedKey, resolvedNamespace] = resolvedValues

    if (!resolvedKeyedDocs || !resolvedKey) {
      return
    }
    const markdown = await this.createHoverMarkdown(resolvedKeyedDocs, resolvedKey, resolvedNamespace, regexId)

    // Create a new hover with the markdown and word range
    return new vscode.Hover(markdown, wordRange);
  }

  /** Determines whether the documentation matches a parameter, method, or function.
   * @param docs - The PineDocsManager instance.
   * @param key - The key identifying the symbol.
   * @param wordRange - The range of the word to match.
   * @returns A promise that resolves to an array containing the matched documentation, key, and namespace.
   */
  async paramMethodFunction(
    docs: PineDocsManager,
    key: string,
    wordRange: vscode.Range,
  ): Promise<[PineDocsManager | undefined, string | undefined, string | undefined] | undefined> {
    // Depending on the type of the symbol, call the appropriate matching function
    switch (true) {
      // If the symbol is a parameter, call isParamMatch
      case this.isParam:
        return new PineHoverParam(key, wordRange).isParam()
      // If the symbol is a method, call isMethodMatch
      case this.isMethod:
        return new PineHoverMethod(docs, key, wordRange).isMethod()
      // If the symbol is a function, call isFunctionMatch
      case this.isFunction:
        return new PineHoverFunction(docs, key).isFunction()
    }
    // If the documentation is an array, use the first element
    if (Array.isArray(docs)) {
      docs = docs[0]
    }
    // Return the documentation, key, and namespace
    return [docs, key, undefined]
  }

  /** Creates a Markdown string for hover information using data from a PineDocsManager.
   * @param keyedDocs - The PineDocsManager instance containing the documentation data.
   * @param key - The key identifying the symbol for which to create the hover information.
   * @param namespace - The namespace of the symbol, if any.
   * @param regexId - The regular expression ID used to match the symbol in the documentation.
   * @return A promise that resolves to a MarkdownString providing the hover information.
   */
  private async createHoverMarkdown(
    keyedDocs: PineDocsManager,
    key: string,
    namespace: string | undefined,
    regexId: string,
  ): Promise<vscode.MarkdownString> {
    const markdownSections: string[][] = [];

    // Syntax (already returns an array, potentially with a separator)
    markdownSections.push(await PineHoverBuildMarkdown.appendSyntax(keyedDocs, key, namespace, regexId, this.mapArrayMatrix));

    // Library ID
    if (keyedDocs?.libId) {
      markdownSections.push([`**Library:** \`${keyedDocs.libId}\`  \n`]);
    }

    // Description
    markdownSections.push(await PineHoverBuildMarkdown.appendDescription(keyedDocs, regexId));
    // Parameters
    markdownSections.push(await PineHoverBuildMarkdown.appendParams(keyedDocs));
    // Return types
    markdownSections.push(await PineHoverBuildMarkdown.appendReturns(keyedDocs, regexId));
    // Remarks
    markdownSections.push(await PineHoverBuildMarkdown.appendRemarks(keyedDocs));
    // See Also
    markdownSections.push(await PineHoverBuildMarkdown.appendSeeAlso(keyedDocs, key));

    // Join all sections. Each section is an array of strings. Flatten and join.
    const markdownContent = markdownSections.flat().join('\n').trim();

    const markdownString = new vscode.MarkdownString(markdownContent);
    markdownString.isTrusted = true; // Allow command URIs, HTTP(S) links and markdown.render setting
    return markdownString;
  }
}

// +++++++++++++++++++  UNUSED CODE  ++++++++++++++++++++++
// private async appendKind(keyedDocs: PineDocsManager, regexId: string) {
//   let build: string[] = []
//   if (regexId === 'param') {
//     return build
//   }
//   if (keyedDocs?.kind) {
//     const kind = this.isMethod ? keyedDocs.kind.replace('Function', 'Method') : keyedDocs.kind
//     return [Helpers.boldWrap(kind)]
//   }
//   return build
// }

// private async appendFields(keyedDocs: PineDocsManager) {
//   return ''
//   //  this.appendParamsFields(keyedDocs, 'fields', 'Fields')
// }

/** Append a detailed description to the markdown if available */
// private async appendDetailedDescription(keyedDocs: PineDocsManager) {
//   console.log(keyedDocs, 'appendDetailedDescription')
//   const detailedDescriptions = keyedDocs?.detailedDesc

//   if (detailedDescriptions && detailedDescriptions.length > 0) {
//     let build = [`\n***  \n**Detailed Description**  \n`]
//     detailedDescriptions.forEach((descAndExample: any, index: number) => {
//       if (index > 0) build.push('\n***  \n')

//       if (descAndExample?.desc) {
//         console.log(descAndExample?.desc, 'descAndExample?.desc')
//         const formattedUrl = Helpers.formatUrl(descAndExample?.desc?.join('  \n') ?? descAndExample?.desc)
//         build.push(`${formattedUrl}  \n`)
//       }
//       if (descAndExample?.examples) {
//         build = [...build, `  \n`, Helpers.boldWrap(`Example #${index + 1}`), `  \n`, cbWrap(descAndExample.examples)]
//       }
//     })
//     return build
//   }
//   return ['']
// }

// private async appendExamples(keyedDocs: PineDocsManager) {
//   if (keyedDocs?.examples) {
//     if (Array.isArray(keyedDocs.examples)) {
//       return this.appendDetails(keyedDocs.examples.join('\n\n'), 'Examples')
//     }
//     return this.appendDetails(keyedDocs.examples, 'Examples')
//   }
//   return ['']
// }

// this.appendKind(keyedDocs, regexId),
// this.appendDetailedDescription(keyedDocs),
// this.appendExamples(keyedDocs),
