import { PineDocsManager } from '../PineDocsManager'
import { PineHoverHelpers } from './PineHoverHelpers'
import { Helpers } from '../PineHelpers'
import { PineStrings } from '../PineStrings'
// import { PineConsole } from '../PineConsole'

/** Builds the markdown for the hover provider. */
export class PineHoverBuildMarkdown {
  static iconString: string = `\n${Helpers.boldWrap('See Also')}  \n${PineStrings.pineIconSeeAlso} - `

  /**
   * Builds the markdown for the hover provider.
   * @param item - The item to build the markdown for.
   * @returns A promise that formats the provided item to be bold in markdown.
   */
  static boldWrap(item: string) {
    try {
      return `**${item}**`
    } catch (error) {
      console.error(error)
      return ''
    }
  }

  /** 
   * Builds the markdown for the hover provider.
   * @param item - The item to build the markdown for.
   * @returns A promise that resolves to a markdown codeblock.
   */
  static cbWrap(item: string) {
    try {
      return `\n\`\`\`pine\n${item.trim()}\n\`\`\`\n`
    } catch (error) {
      console.error(error)
      return ''
    }
  }

  /** 
   * Appends the syntax to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @param key - The key identifying the symbol.
   * @param namespace - The namespace of the symbol, if any.
   * @param regexId - The regex ID of the symbol.
   * @param mapArrayMatrix - The map, array, or matrix, if any.
   * @returns A promise that resolves to an array containing the syntax.
   * @remarks This method is used for fields, variables, constants, functions, methods, UDTs, types, and parameters.
   */
  static async appendSyntax(
    keyedDocs: PineDocsManager,
    key: string,
    namespace: string | undefined,
    regexId: string,
    mapArrayMatrix: string,
  ) {
    try {
      let syntax
      if (['function', 'method', 'UDT', 'type', 'param'].includes(regexId)) {
        if (regexId === 'UDT') {
          this.buildUDTDefaultSyntax(keyedDocs)
        }
        const isMethod = regexId === 'method'
        syntax = keyedDocs?.syntax ?? key
        syntax = PineHoverHelpers.replaceNamespace(syntax, namespace, isMethod)
        syntax = this.formatSyntaxContent(syntax, mapArrayMatrix)
        syntax = await this.checkSyntaxContent(syntax, isMethod)
      }

      if (['field', 'variable', 'constant'].includes(regexId)) {
        syntax = await this.buildKeyBasedContent(keyedDocs, key)
        syntax = Helpers.replaceSyntax(syntax)
      }

      if (['control', 'annotation'].includes(regexId)) {
        syntax = keyedDocs?.name ?? key
      }

      if (!syntax || syntax === '') {
        // If syntax is still empty, attempt to use key as a fallback, especially for simple constants or variables.
        syntax = key
      }

      // If keyedDocs itself has a libId, it can be added here or in the main hover provider
      let libIdText = '';
      if (keyedDocs?.libId) {
        // This will be outside the ```pine block, which is better.
        // Let's move libId display to PineHoverProvider.createHoverMarkdown
        // libIdText = `\n**Library:** ${keyedDocs.libId}\n`;
      }

      if (keyedDocs && keyedDocs.thisType && regexId !== 'method') { // Ensure regexId is updated if thisType is present
        regexId = 'method'
      }

      let syntaxPrefix = this.getSyntaxPrefix(syntax, regexId)

      if (regexId !== 'control' && regexId !== 'UDT') { // UDTs have their own block formatting typically
        if (syntax.includes('\n') && regexId !== 'param') {
          // For multi-line syntaxes (like some function signatures), apply prefix to each line.
          syntax = syntax
            .split('\n')
            .map((s: string) => syntaxPrefix + s.trim()) // Trim each line before prefixing
            .join('\n') // Use single \n for tighter code blocks
        } else {
          syntax = syntaxPrefix + syntax.trim()
        }
      } else if (regexId === 'UDT' && !syntax.startsWith('type ')) {
        // Ensure UDT syntax starts with "type" keyword if not already present
        // syntax = `type ${syntax}`; // This might be too aggressive if syntax is already complete
      }


      if (['UDT', 'field', 'function', 'method'].includes(regexId)) {
        syntax = this.addDefaultArgsToSyntax(syntax, keyedDocs)
      }

      // Ensure syntax is not empty before wrapping, fallback to key if needed
      const finalSyntaxString = (syntax && syntax.trim() !== '') ? syntax : key;

      return [this.cbWrap(finalSyntaxString), '***  \n'] // Add libIdText here if kept in this method
    } catch (error) {
      console.error('Error in appendSyntax:', error)
      return []
    }
  }

  /** 
   * Adds default arguments to the syntax.
   * @param syntax - The syntax.
   * @param docs - The PineDocsManager instance.
   */
  static addDefaultArgsToSyntax(syntax: string, docs: PineDocsManager) {
    if (docs && (docs.args || docs.fields)) {
      for (const i of docs.args ?? docs.fields) {
        if (i?.default) {
          const argField = i.name
          syntax = syntax.replace(RegExp(`${argField}(\\s*[,)])`, 'g'), `${argField}=${i.default}$1`)
        }
      }
    }
    return syntax
  }

  /** 
   * Modifies the syntax to include default values for UDTs.
   * @param keyedDocs - The PineDocsManager instance.
   */
  static buildUDTDefaultSyntax(keyedDocs: PineDocsManager) {
    try {
      if (keyedDocs?.syntax && keyedDocs?.fields) {
        const { fields } = keyedDocs
        let { syntax } = keyedDocs
        for (const field of fields) {
          if (field?.name && field.type) {
            const regex = RegExp(`    ${field.name}: [^\\n]+`)
            syntax = syntax.replace(regex, `    ${field.name}: ${field.type}${field.default ? ` = ${field.default}` : ''}`)
          }
        }
        keyedDocs.syntax = syntax
      }
    } catch (error) {
      console.error(error, 'buildUDTDefaultSyntax')
    }
  }

  /** 
   * Gets the syntax prefix.
   * @param syntax - The syntax.
   * @param regexId - The regex ID.
   * @returns The syntax prefix.
   */
  static getSyntaxPrefix(syntax: string, regexId: string) {
    let prefix = ''

    if (syntax.includes('<?>') || syntax.includes('undetermined type')) {
      return prefix

    } else if (regexId === 'variable') {
      if (
        !/(?::\s*)(array|map|matrix|int|float|bool|string|color|line|label|box|table|linefill|polyline|na)\b/g.test(
          syntax,
        ) || (syntax.includes('chart.point') && !/chart\.point$/.test(syntax))
      ) {
        return '(object) '
      }

      return '(variable) '

    } else if (regexId !== 'control' && regexId !== 'UDT') {

      return '(' + regexId + ') '
    }
    return prefix
  }

  /** 
   * Formats the syntax content.
   * @param syntax - The syntax content.
   * @param mapArrayMatrix - The map, array, or matrix, if any.
   * @returns The formatted syntax content.
   */
  static formatSyntaxContent(syntax: string | undefined, mapArrayMatrix: string) {
    try {
      if (!syntax) {
        return ''
      }
      syntax = syntax.replace(/undetermined type/g, '<?>')
      if (mapArrayMatrix && /(map|array|matrix)(\.new)?<[^>]+>/.test(syntax)) {
        return PineHoverHelpers.replaceMapArrayMatrix(syntax, mapArrayMatrix)
      }
      return syntax
    } catch (error) {
      console.error(error)
      return ''
    }
  }


  /** 
   * Builds the syntax or key content.
   * @param syntaxContent - The syntax content.
   * @param isMethod - Whether or not the symbol is a method.
   * @returns A promise that resolves to the built content.
   */
  static async checkSyntaxContent(syntaxContent: string, isMethod: boolean = false) {
    try {
      return Helpers.checkSyntax(syntaxContent, isMethod)
    } catch (error) {
      console.error(error)
      return ''
    }
  }

  /** 
   * Builds the content based on the key.
   * @param keyedDocs - The PineDocsManager instance.
   * @param key - The key identifying the symbol.
   * @returns A promise that resolves to the built content.
   */
  static async buildKeyBasedContent(keyedDocs: PineDocsManager, key: string) {
    try {
      const returnType = Helpers.returnTypeArrayCheck(keyedDocs)
      if (returnType) {
        return `${keyedDocs?.name ?? key}: ${returnType || '<?>'} `;
      } else {
        return key
      }
    } catch (error) {
      console.error(error)
      return ''
    }
  }

  /** 
   * Checks the namespace.
   * @param keyedDocs - The PineDocsManager instance.
   * @param isMethod - Whether or not the symbol is a method.
   */
  static namespaceCheck(syntax: string, keyedDocs: PineDocsManager, isMethod: boolean = false) {
    try {
      if (/^\w+\([^)]*\)/.test(syntax) && isMethod && keyedDocs.args) {
        const namespace = keyedDocs.args[0]?.name ?? null
        if (namespace) {
          return `${namespace}.${syntax}`
        }
      }
      return syntax
    } catch (error) {
      console.error(error)
      return syntax
    }
  }

  /** 
   * Appends the description to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @returns A promise that resolves to an array containing the description.
   */
  static async appendDescription(keyedDocs: PineDocsManager, regexId: string) {
    // if (regexId === 'field') { // Fields can have descriptions
    //   return []
    // }
    try {
      // Prioritize keyedDocs.desc as it's the new direct field from lint
      let description = keyedDocs?.desc
      if (Array.isArray(description)) {
        description = description.join('\n\n') // Join paragraphs with double newline for markdown
      } else if (!description) {
        description = keyedDocs?.info // Fallback to 'info'
      }

      if (description) {
        return [Helpers.formatUrl(description.toString())] // Ensure it's a string
      }
      return []
    } catch (error) {
      console.error('Error in appendDescription:', error)
      return []
    }
  }

  /** 
   * Appends parameters or fields to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @param argsOrFields - The arguments or fields to append.
   * @param title - The title of the section.
   * @returns A promise that resolves to an array containing the parameters or fields.
   */
  static async appendParamsFields(keyedDocs: PineDocsManager, argsOrFields: string, title: string = 'Params') {
    try {
      // If no arguments or fields are provided, return an empty array
      if (!keyedDocs?.[argsOrFields] || keyedDocs[argsOrFields]?.length === 0) {
        return []
      }
      let build: string[] = ['  \n', Helpers.boldWrap(title), '\n'] // Initialize the markdown string
      // If a namespace is provided and the symbol is a method with arguments, add a namespace indicator
      for (const argFieldInfo of keyedDocs[argsOrFields]) {
        // Loop over the arguments or fields
        if (!argFieldInfo || !argFieldInfo.name) { // Ensure argFieldInfo and its name exist
          continue
        }
        // Use argFieldInfo.desc directly for description
        // Type comes from argFieldInfo.type or argFieldInfo.displayType
        const typeString = argFieldInfo.displayType || argFieldInfo.type || ''
        let paramDesc = `\`${typeString}\`` // Type in backticks
        if (argFieldInfo.desc) {
          paramDesc += ` - ${argFieldInfo.desc}` // Append description if available
        }

        const requiredIndicator = argsOrFields === 'args' && !(argFieldInfo?.required === false) ? '' : ' (optional)' // Assuming true if 'required' is not explicitly false
        const argName = Helpers.boldWrap(`${argFieldInfo.name}`)

        build.push(`- ${argName}${requiredIndicator}: ${Helpers.formatUrl(paramDesc)}  \n`)
      }
      return build
    } catch (error)
     {
      console.error('Error in appendParamsFields:', error)
      return []
    }
  }

  /** 
   * Gets the description and type key from the detail item.
   * @param argFieldInfo - The detail item.
   * @returns The description and type key.
   */
  static getDescriptionAndTypeKey(argFieldInfo: any) {
    try {
      let typeKey
      if (argFieldInfo?.type) {
        typeKey = 'type'
      } else if (argFieldInfo?.displayType) {
        typeKey = 'displayType'
      }
      return this.buildParamHoverDescription(argFieldInfo, typeKey ?? '')
    } catch (error) {
      console.error(error)
      return ''
    }
  }

  /** 
   * Builds the hover description for a parameter.
   * @param paramDocs - The documentation for the parameter.
   * @param typeKey - The type key.
   * @returns The hover description.
   */
  static buildParamHoverDescription(paramDocs: Record<string, any>, typeKey: string) {
    try {
      const endingType = Helpers.replaceType(paramDocs[typeKey] ?? '')
      const paramInfo = paramDocs?.info ?? paramDocs?.desc ?? ''
      const paramInfoSplit = paramInfo.split(' ')
      const endingTypeSplit = endingType.split(' ')
      let e1: string | null = endingTypeSplit[0] ?? null
      let e2: string | null = endingTypeSplit[1] ?? null
      let flag = false
      let count = 0
      for (const p of paramInfoSplit) {
        if (e2 && flag) {
          if (!p.includes(e2)) {
            flag = false
          }
          e2 = null
        }
        if (e1 && p.includes(e1)) {
          e1 = null
          flag = true
          continue
        }
        if (p.includes(endingType)) {
          flag = true
          break
        }
        if (count >= 3) {
          break
        }
        count++
      }
      return flag ? paramInfo : `${paramInfo} \`${endingType}\``;
    } catch (error) {
      console.error(error)
      return ''
    }
  }

  /**
   * Appends parameters to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @returns A promise that resolves to an array containing the parameters.
   */
  static async appendParams(keyedDocs: PineDocsManager) {
    try {
      return await this.appendParamsFields(keyedDocs, 'args', 'Params')
    } catch (error) {
      console.error(error)
      return []
    }
  }
  /**
   * Appends details to the markdown.
   * @param detail - The detail to append.
   * @param detailType - The type of the detail.
   * @returns An array containing the details.
   */
  static appendDetails(detail: string, detailType: string) {
    try {
      let build: string[] = []
      if (detail && detailType.toLowerCase() !== 'examples') {
        build = [`  \n${Helpers.boldWrap(detailType)} - ${Helpers.formatUrl(detail)}`]
      }
      return build
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Appends return values to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @returns A promise that resolves to an array containing the return values.
   */
  static async appendReturns(keyedDocs: PineDocsManager, regexId: string) {
    if (['UDT', 'field', 'variable', 'constant', 'control', 'param', 'annotation'].includes(regexId)) {
      return [] // These don't typically have 'return' values in this context
    }
    try {
      if (keyedDocs) {
        // Use keyedDocs.returnedTypes (array of strings)
        const returnedTypes = keyedDocs.returnedTypes
        if (returnedTypes && Array.isArray(returnedTypes) && returnedTypes.length > 0) {
          const typesString = returnedTypes.map(type => `\`${Helpers.replaceType(type)}\``).join(', ')
          return this.appendDetails(typesString, 'Returns')
        } else if (keyedDocs.type && (regexId === 'function' || regexId === 'method')) {
          // Fallback to keyedDocs.type if returnedTypes is not available but it's a function/method
          const legacyReturn = Helpers.returnTypeArrayCheck(keyedDocs) // This helper might use .type or .syntax
           if (legacyReturn) {
            return this.appendDetails(`\`${Helpers.replaceType(legacyReturn)}\``, 'Returns')
           }
        }
      }
      return []
    } catch (error) {
      console.error('Error in appendReturns:', error)
      return []
    }
  }

  /**
   * Appends remarks to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @returns A promise that resolves to an array containing the remarks.
   */
  static async appendRemarks(keyedDocs: PineDocsManager) {
    try {
      if (keyedDocs?.remarks) {
        if (Array.isArray(keyedDocs.remarks)) {
          return this.appendDetails(keyedDocs?.remarks?.join('\n') ?? keyedDocs?.remarks ?? '', 'Remarks')
        }
        return this.appendDetails(keyedDocs.remarks, 'Remarks')
      }
      return ['']
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Appends "see also" references to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @param key - The key identifying the symbol.
   * @returns A promise that resolves to an array containing the "see also" references.
   */
  static async appendSeeAlso(keyedDocs: PineDocsManager, key: string) {
    try {
      if (key && keyedDocs?.seeAlso && keyedDocs?.seeAlso.length > 0) {
        let build = [PineHoverBuildMarkdown.iconString]
        if (keyedDocs.seeAlso instanceof Array) {
          const formatUrl = Helpers.formatUrl(keyedDocs.seeAlso.join(', '))
          build.push(formatUrl ?? '')
        } else {
          build.push(Helpers?.formatUrl(keyedDocs?.seeAlso ?? '') ?? '')
        }
        return build
      }
      return ['']
    } catch (error) {
      console.error(error)
      return ['']
    }
  }
}
