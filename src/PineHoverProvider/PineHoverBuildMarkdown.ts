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
    keyedDocs: any, // Actual doc object
    key: string,
    namespace: string | undefined,
    regexId: string,
    mapArrayMatrix: string,
  ) {
    try {
      let syntax: string | undefined;
      const docKind = keyedDocs?.kind || ''; // Get kind from keyedDocs

      if (docKind.toLowerCase().includes('udt') || regexId === 'UDT' || (docKind.toLowerCase().includes('type') && keyedDocs?.fields)) { // Check if it's a UDT
        // For UDTs, construct syntax from name and fields if syntax array isn't detailed
        if (keyedDocs?.name && keyedDocs?.fields && Array.isArray(keyedDocs.fields)) {
          let udtSyntax = `type ${keyedDocs.name} {\n`;
          keyedDocs.fields.forEach((field: any) => {
            udtSyntax += `    ${field.name}: ${field.type}${field.default ? ` = ${field.default}` : ''}\n`;
          });
          udtSyntax += `}`;
          syntax = udtSyntax;
        } else if (Array.isArray(keyedDocs?.syntax)) {
          syntax = keyedDocs.syntax.join('\n');
        } else {
          syntax = keyedDocs?.syntax ?? key;
        }
        regexId = 'UDT'; // Ensure regexId is UDT for prefix handling
      } else if (docKind.toLowerCase().includes('enum') && keyedDocs?.fields) { // Check if it's an Enum
         if (keyedDocs?.name && keyedDocs?.fields && Array.isArray(keyedDocs.fields)) {
          let enumSyntax = `enum ${keyedDocs.name} {\n`;
          keyedDocs.fields.forEach((member: any) => {
            enumSyntax += `    ${member.name}${member.title ? ` (${member.title})` : ''}\n`;
          });
          enumSyntax += `}`;
          syntax = enumSyntax;
        } else if (Array.isArray(keyedDocs?.syntax)) {
          syntax = keyedDocs.syntax.join('\n');
        } else {
          syntax = keyedDocs?.syntax ?? key;
        }
        regexId = 'Enum'; // Special regexId for prefix handling
      } else if (['function', 'method', 'type', 'param'].includes(regexId)) {
        const isMethod = regexId === 'method' || (keyedDocs?.thisType && keyedDocs.thisType.length > 0);
        if (Array.isArray(keyedDocs?.syntax)) {
          syntax = keyedDocs.syntax.join('\n');
        } else {
          syntax = keyedDocs?.syntax ?? key;
        }
        syntax = PineHoverHelpers.replaceNamespace(syntax, namespace, isMethod);
        syntax = this.formatSyntaxContent(syntax, mapArrayMatrix);
        syntax = await this.checkSyntaxContent(syntax, isMethod);
        // addDefaultArgsToSyntax is called later, which is good.
      } else if (['field', 'variable', 'constant'].includes(regexId)) {
        // For fields, ensure parent UDT name is part of syntax if available
        if (regexId === 'field' && keyedDocs?.parent && keyedDocs?.name && keyedDocs?.type) {
            syntax = `${keyedDocs.parent}.${keyedDocs.name}: ${keyedDocs.type}`;
        } else {
            syntax = await this.buildKeyBasedContent(keyedDocs, key);
        }
        syntax = Helpers.replaceSyntax(syntax ?? key) // Ensure syntax is not undefined
      } else if (['control', 'annotation'].includes(regexId)) {
        syntax = keyedDocs?.name ?? key;
      }

      if (!syntax || syntax === '') {
        return [this.cbWrap(key), '***  \n']; // Wrap key if syntax is empty
      }

      // Determine effective regexId for prefixing, especially if it's a method
      let effectiveRegexId = regexId;
      if (keyedDocs?.thisType && keyedDocs.thisType.length > 0) {
        effectiveRegexId = 'method';
      } else if (docKind.toLowerCase().includes('udt') || (docKind.toLowerCase().includes('type') && keyedDocs?.fields)) {
        effectiveRegexId = 'UDT';
      } else if (docKind.toLowerCase().includes('enum')) {
        effectiveRegexId = 'Enum';
      }


      let syntaxPrefix = this.getSyntaxPrefix(syntax, effectiveRegexId);

      if (effectiveRegexId === 'UDT' || effectiveRegexId === 'Enum') {
        // For UDTs and Enums, the main syntax is already formatted (multi-line)
        // No additional prefix per line. Prefix is applied by getSyntaxPrefix to the whole block if needed.
      } else if (regexId !== 'control') { // No prefix for controls generally
        if (syntax.includes('\n') && regexId !== 'param') {
          syntax = syntax
            .split('\n')
            .map((s: string) => syntaxPrefix + s) // Apply prefix to each line for multi-line functions/methods
            .join('\n\n');
        } else {
          syntax = syntaxPrefix + syntax.trim(); // Apply prefix to single line
        }
      }

      // addDefaultArgsToSyntax was more for the old style where syntax string was simpler.
      // The new syntax array from lint or constructed UDT/Enum syntax should already include defaults.
      // If keyedDocs.args is present (for functions/methods from new lint format), their defaults are in their objects, not in syntax strings.
      // Let's remove this explicit call if syntax comes from `keyedDocs.syntax` (array) or is UDT/Enum
      if (!Array.isArray(keyedDocs?.syntax) && (effectiveRegexId === 'function' || effectiveRegexId === 'method')) {
         if (['UDT', 'field', 'function', 'method'].includes(effectiveRegexId)) { // field might be too broad here
            syntax = this.addDefaultArgsToSyntax(syntax, keyedDocs); // Keep for non-array syntax if still relevant
         }
      }


      return [this.cbWrap(syntax), '***  \n'];
    } catch (error) {
      console.error(error)
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
  static async appendDescription(keyedDocs: any, regexId: string) { // keyedDocs is any (actual doc object)
    // The old logic skipped description for individual fields.
    // New UDT field structure has a 'desc' field, so we should show it.
    // if (regexId === 'field') {
    //   return []
    // }
    try {
      // Prioritize keyedDocs.desc as the primary source of description.
      // The new lint format provides 'desc' as an array of strings for most entities.
      const descriptionText = keyedDocs?.desc;

      if (descriptionText) {
        const description = Array.isArray(descriptionText) ? descriptionText.join('  \n') : descriptionText;
        if (description.trim() !== "") {
          return [Helpers.formatUrl(description.trim())];
        }
      }
      // Fallback to keyedDocs.info if .desc is not available or empty, though less common for main desc.
      const infoText = keyedDocs?.info;
      if (infoText) {
        const infoDescription = Array.isArray(infoText) ? infoText.join('  \n') : infoText;
        if (infoDescription.trim() !== "") {
          return [Helpers.formatUrl(infoDescription.trim())];
        }
      }
      return []
    } catch (error) {
      console.error(error)
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
  static async appendParamsFields(keyedDocs: any, argsOrFieldsKey: string, title: string = 'Params') { // keyedDocs is any
    try {
      const argsOrFields = keyedDocs?.[argsOrFieldsKey];
      // If no arguments or fields are provided, or if it's not an array, return an empty array
      if (!argsOrFields || !Array.isArray(argsOrFields) || argsOrFields.length === 0) {
        return []
      }
      let build: string[] = ['  \n', Helpers.boldWrap(title), '\n']
      for (const argFieldInfo of argsOrFields) {
        if (!argFieldInfo || typeof argFieldInfo !== 'object') {
          continue
        }
        // For UDT Fields (argsOrFieldsKey === 'fields'): name, type, desc, default
        // For Function Args (argsOrFieldsKey === 'args'): name, displayType, desc, required, default
        const name = argFieldInfo.name;
        const type = argFieldInfo.displayType || argFieldInfo.type || 'any'; // Use displayType for args, type for fields
        const descArray = argFieldInfo.desc; // desc is expected to be an array
        const desc = descArray ? (Array.isArray(descArray) ? descArray.join(' ') : descArray) : '';

        // Determine if required. For 'args', use 'required' field. For 'fields' (UDT fields), they are implicitly required unless a 'default' is present.
        let isRequired;
        if (argsOrFieldsKey === 'args') {
          isRequired = argFieldInfo.required ?? false; // Assume not required if undefined
        } else { // 'fields'
          isRequired = typeof argFieldInfo.default === 'undefined';
        }

        const defaultValue = argFieldInfo.default;

        let paramSignature = `- **${name}** (\`${type}\`)`
        if (!isRequired) {
          paramSignature += ' (optional)';
        }
        paramSignature += `: ${Helpers.formatUrl(desc) || 'No description.'}`;
        if (typeof defaultValue !== 'undefined') { // Check if defaultValue is explicitly set
          paramSignature += ` (default: \`${defaultValue}\`)`;
        }
        build.push(paramSignature + '  \n');
      }
      return build
    } catch (error) {
      console.error(error)
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
  static async appendReturns(keyedDocs: any, regexId: string) { // keyedDocs is any
    if (['UDT', 'field', 'variable', 'constant', 'control', 'param', 'annotation'].includes(regexId) ||
        (keyedDocs?.kind && keyedDocs.kind.toLowerCase().includes("udt")) ||
        (keyedDocs?.kind && keyedDocs.kind.toLowerCase().includes("enum"))) {
      return [] // UDTs, Enums, fields, vars, etc., don't have 'returns' in this context
    }
    try {
      if (keyedDocs) {
        const returnedTypes = keyedDocs.returnedTypes; // Expected: array of strings like ["bool"], ["float", "na"]
        const returnsDescription = keyedDocs.returns; // Expected: array of strings (description for the return) or string

        if (returnedTypes && Array.isArray(returnedTypes) && returnedTypes.length > 0) {
          const typesString = returnedTypes.map(t => `\`${Helpers.replaceType(t)}\``).join(' or ');
          let returnsMarkdown = `  \n${Helpers.boldWrap('Returns')} - ${typesString}`;

          if (returnsDescription) {
            const descStr = Array.isArray(returnsDescription) ? returnsDescription.join(' ') : returnsDescription;
            if (descStr.trim()) {
              returnsMarkdown += `: ${Helpers.formatUrl(descStr.trim())}`;
            }
          }
          return [returnsMarkdown];
        }
        // Fallback for older structures or if only keyedDocs.returns (as a string description) exists
        // This part might be redundant if PineDocsManager consistently provides returnedTypes
        const oldReturnsStyle = Helpers.returnTypeArrayCheck(keyedDocs); // This helper might rely on old structure
        if (oldReturnsStyle && typeof oldReturnsStyle === 'string') {
             const details = this.appendDetails(Helpers.replaceType(oldReturnsStyle), 'Returns')
             if (details.length > 0 && !oldReturnsStyle.includes('`')) {
                 const split = details[0].split(' - ');
                 if (split.length > 1) {
                    split[1] = '`' + split[1];
                    split[split.length - 1] += '`';
                    details[0] = split.join(' - ');
                 }
                 return details;
             }
             return details;
        }
        return []
      }
      return []
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Appends remarks to the markdown.
   * @param keyedDocs - The PineDocsManager instance.
   * @returns A promise that resolves to an array containing the remarks.
   */
  static async appendRemarks(keyedDocs: any) { // keyedDocs is any
    try {
      if (keyedDocs?.remarks) {
        if (Array.isArray(keyedDocs.remarks)) {
          return this.appendDetails(keyedDocs?.remarks?.join('\n') ?? keyedDocs?.remarks ?? '', 'Remarks')
        }
        return this.appendDetails(keyedDocs.remarks, 'Remarks')
      }
      return [] // Return empty array if no remarks
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
  static async appendSeeAlso(keyedDocs: any, key: string) { // keyedDocs is any
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
      return [] // Return empty array if no seeAlso
    } catch (error) {
      console.error(error)
      return [] // Return empty array on error for consistency
    }
  }

  /**
   * Appends UDT fields to the markdown.
   * @param keyedDocs - The documentation object for the UDT.
   * @returns A promise that resolves to an array containing the UDT fields markdown.
   */
  static async appendUDTFields(keyedDocs: any) {
    try {
      // Reuses appendParamsFields logic, as UDT fields are similar to parameters in structure
      // { name, type, desc, default }
      return await this.appendParamsFields(keyedDocs, 'fields', 'Fields');
    } catch (error) {
      console.error('Error in appendUDTFields:', error);
      return [];
    }
  }

  /**
   * Appends Enum members to the markdown.
   * @param keyedDocs - The documentation object for the Enum.
   * @returns A promise that resolves to an array containing the Enum members markdown.
   */
  static async appendEnumMembers(keyedDocs: any) {
    try {
      const members = keyedDocs?.fields; // Enum members are in 'fields' property
      if (!members || !Array.isArray(members) || members.length === 0) {
        return [];
      }
      let build: string[] = ['  \n', Helpers.boldWrap('Members'), '\n'];
      for (const member of members) {
        if (!member || typeof member !== 'object') {
          continue;
        }
        const name = member.name;
        const title = member.title; // Optional title for enum member
        const descArray = member.desc; // desc is expected to be an array or string
        const desc = descArray ? (Array.isArray(descArray) ? descArray.join(' ') : descArray) : '';

        let memberSignature = `- **${name}**`;
        if (title) {
          memberSignature += ` (${title})`;
        }
        memberSignature += `: ${Helpers.formatUrl(desc) || 'No description.'}`;
        build.push(memberSignature + '  \n');
      }
      return build;
    } catch (error)
      console.error('Error in appendEnumMembers:', error);
      return [];
    }
  }
}
