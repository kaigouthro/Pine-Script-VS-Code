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
      const docKind = keyedDocs?.kind || '';
      const libOrigin = keyedDocs?.libraryOrigin ? ` (from ${keyedDocs.libraryOrigin})` : '';

      if (regexId === 'variable' && keyedDocs?.calculatedTypeString) {
        syntax = `${key}: ${keyedDocs.calculatedTypeString}`;
      } else if (docKind.toLowerCase().includes('udt') || regexId === 'UDT' || (docKind.toLowerCase().includes('type') && keyedDocs?.fields && !keyedDocs?.members)) {
        if (keyedDocs?.name && keyedDocs?.fields && Array.isArray(keyedDocs.fields)) {
          let udtSyntax = `type ${keyedDocs.name}${libOrigin} {\n`;
          keyedDocs.fields.forEach((field: any) => {
            // Assuming field.type is a string; if it's ParsedType, it needs stringifying
            udtSyntax += `    ${field.isConst ? 'const ' : ''}${field.type} ${field.name}${field.default ? ` = ${field.default}` : ''};\n`;
          });
          udtSyntax += `}`;
          syntax = udtSyntax;
        } else {
          syntax = keyedDocs?.syntax ?? key; // Fallback for UDTs without detailed fields in keyedDocs
        }
        regexId = 'UDT';
      } else if (docKind.toLowerCase().includes('enum') || (regexId === 'Enum' && keyedDocs?.members)) {
         if (keyedDocs?.name && keyedDocs?.members && Array.isArray(keyedDocs.members)) {
          let enumSyntax = `enum ${keyedDocs.name}${libOrigin} {\n`;
          keyedDocs.members.forEach((member: any) => { // Iterate members
            enumSyntax += `    ${member.name}${member.value ? ` = ${member.value}` : ''}\n`; // Assuming members might have a value
          });
          enumSyntax += `}`;
          syntax = enumSyntax;
        } else {
          syntax = keyedDocs?.syntax ?? key; // Fallback for Enums
        }
        regexId = 'Enum';
      } else if (['function', 'method', 'type', 'param'].includes(regexId)) {
        const isMethod = regexId === 'method' || (keyedDocs?.thisType && keyedDocs.thisType.length > 0);
        if (Array.isArray(keyedDocs?.syntax)) {
          syntax = keyedDocs.syntax.join('\n'); // This is an array of strings for function signatures
        } else {
          syntax = keyedDocs?.syntax ?? key; // Fallback to single string syntax or key
        }
        // Ensure syntax and namespace are strings before passing
        syntax = PineHoverHelpers.replaceNamespace(syntax || key || '', namespace || '', isMethod);
        syntax = this.formatSyntaxContent(syntax, mapArrayMatrix);
        syntax = await this.checkSyntaxContent(syntax, isMethod);
        syntax += libOrigin; // Add library origin for functions/methods
      } else if (regexId === 'field' && keyedDocs?.name && keyedDocs?.type) {
        // For fields, use calculatedTypeString if available (more precise), else keyedDocs.type
        const fieldTypeString = keyedDocs.calculatedTypeString || keyedDocs.type;
        syntax = `${key}: ${fieldTypeString}`; // key is field name here
        // namespace here is the UDT name. We can make it more explicit:
        // syntax = `${namespace}.${key}: ${fieldTypeString}`;
        // libOrigin for fields is handled by the parent UDT's libOrigin.
      } else if (['variable', 'constant'].includes(regexId) && !keyedDocs?.calculatedTypeString) {
        // If it's a variable/constant but type wasn't calculated by PineTypify (e.g. built-in from docs manager)
        syntax = await this.buildKeyBasedContent(keyedDocs, key);
        syntax = Helpers.replaceSyntax(syntax ?? key);
      } else if (['control', 'annotation'].includes(regexId)) {
        syntax = keyedDocs?.name ?? key;
      } else if (!syntax && keyedDocs?.name) { // Fallback for other types if syntax isn't set yet
        syntax = keyedDocs.name;
      }


      if (!syntax || syntax.trim() === '') {
        return [this.cbWrap(key + libOrigin), '***  \n']; // Wrap key if syntax is empty
      }

      let effectiveRegexId = regexId;
      if (keyedDocs?.kind) { // Prioritize kind from keyedDocs if available
          if (keyedDocs.kind.toLowerCase().includes('method')) effectiveRegexId = 'method';
          else if (keyedDocs.kind.toLowerCase().includes('function')) effectiveRegexId = 'function';
          else if (keyedDocs.kind.toLowerCase().includes('udt') || (keyedDocs.kind.toLowerCase().includes('type') && keyedDocs.fields && !keyedDocs.members)) effectiveRegexId = 'UDT';
          else if (keyedDocs.kind.toLowerCase().includes('enum') || keyedDocs.members) effectiveRegexId = 'Enum';
          else if (keyedDocs.kind.toLowerCase() === 'field') effectiveRegexId = 'field';
          else if (keyedDocs.kind.toLowerCase() === 'variable') effectiveRegexId = 'variable';
      }

      let syntaxPrefix = this.getSyntaxPrefix(syntax, effectiveRegexId, keyedDocs?.calculatedTypeString);

      if (effectiveRegexId === 'UDT' || effectiveRegexId === 'Enum') {
        // Syntax already includes type name and libOrigin. Prefix is for the whole block.
        // No changes to syntax string itself here needed.
      } else if (effectiveRegexId !== 'control' && effectiveRegexId !== 'annotation') {
        if (syntax.includes('\n') && effectiveRegexId !== 'param') { // Param syntax usually single line
          syntax = syntax
            .split('\n')
            .map((s: string) => syntaxPrefix + s)
            .join('\n\n');
        } else {
          syntax = syntaxPrefix + syntax.trim();
        }
      }

      // Default args for functions/methods are now part of their 'args' objects with 'default' property
      // The main syntax string from PineDocsManager or from PineParser's 'syntax' field should be mostly complete.
      // No specific call to addDefaultArgsToSyntax if we rely on args array for details.

      return [this.cbWrap(syntax), '***  \n'];
    } catch (error) {
      console.error('Error in appendSyntax:', error);
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
  static getSyntaxPrefix(syntax: string, regexId: string, calculatedType?: string) {
    let prefix = '';
    if (syntax.includes('<?>') || syntax.includes('undetermined type')) {
      return prefix;
    }

    const kindToPrefixMap: Record<string, string> = {
      'variable': `(variable)${calculatedType ? '' : ' object'} `, // If type is known, don't add 'object'
      'function': '(function) ',
      'method': '(method) ',
      'param': '(parameter) ',
      'field': '(field) ',
      'UDT': '', // UDT syntax is `type Name {...}` - no prefix needed here
      'Enum': '', // Enum syntax is `enum Name {...}`
      'type': '(type) ', // For built-in types like 'color' if not UDT/Enum
      // 'constant', 'control', 'annotation' usually don't need prefix or are handled by their syntax.
    };

    prefix = kindToPrefixMap[regexId] || '';

    // Special handling for variables if type is unknown or a generic object from old docs
    if (regexId === 'variable' && !calculatedType) {
        if (!/(?::\s*)(array|map|matrix|int|float|bool|string|color|line|label|box|table|linefill|polyline|na)\b/g.test(syntax) ||
            (syntax.includes('chart.point') && !/chart\.point$/.test(syntax))) {
            // It's likely a UDT instance or some other complex object if its type isn't a basic one.
            // The `(variable object)` prefix might be too strong if PineTypify couldn't find type.
            // Let's rely on calculatedTypeString in appendSyntax to show the type if known.
            // If not, just "(variable)" is fine.
        }
    }

    return prefix;
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
    // if (regexId === 'field') { // Fields now have descriptions from PineParser
    //   return []
    // }
    try {
      // keyedDocs.doc is for main description (functions, UDT, Enum) from PineParser's @description or main comment.
      // keyedDocs.desc is for individual item description (field, param, enum member, or built-in's general desc).
      let description = '';
      if (regexId === 'param' || regexId === 'field' || regexId === 'EnumMember') { // EnumMember used as example if members have own desc
        description = keyedDocs?.desc;
      } else { // For main symbols like function, UDT, Enum
        description = keyedDocs?.doc || keyedDocs?.desc;
      }

      if (description) {
        const descString = Array.isArray(description) ? description.join('  \n') : description;
        if (descString.trim()) {
          const formatted = Helpers.formatUrl(descString.trim());
          if (formatted && formatted.trim()) { // Ensure formatUrl didn't return empty or undefined
            return [formatted];
          }
        }
      }
      return ["(No description available)"];
    } catch (error) {
      console.error('Error in appendDescription:', error);
      return ["(Error loading description)"]; // This path returns string[]
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
      for (const item of argsOrFields) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const name = item.name;
        const type = item.type || item.displayType || 'any'; // 'type' from PineParser, 'displayType' as fallback
        const itemDesc = item.desc || '(No description)'; // 'desc' from PineParser
        const defaultValue = item.default;
        const isRequired = argsOrFieldsKey === 'args' ? (item.required ?? (typeof defaultValue === 'undefined')) : (typeof defaultValue === 'undefined');


        let signature = `- **${name}** (\`${type}\`)`;
        if (!isRequired && argsOrFieldsKey === 'args') { // Only show optional for function/method args
          signature += ' (optional)';
        }
        signature += `: ${Helpers.formatUrl(itemDesc)}`;
        if (typeof defaultValue !== 'undefined') {
          signature += ` (default: \`${defaultValue}\`)`;
        }
        build.push(signature + '  \n');
      }
      return build;
    } catch (error) {
      console.error('Error in appendParamsFields:', error);
      return [];
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
  static appendDetails(detail: string, detailType: string): string[] { // Explicitly string[]
    try {
      let build: string[] = [];
      if (detail && detailType.toLowerCase() !== 'examples') { // Ensure detail is not empty
        const formattedDetail = Helpers.formatUrl(detail);
        if (formattedDetail && formattedDetail.trim()) { // Ensure formatted detail is not empty
          build = [`  \n${Helpers.boldWrap(detailType)} - ${formattedDetail}`];
        }
      }
      return build; // Returns string[] (possibly empty)
    } catch (error) {
      console.error(error);
      return []; // Returns string[]
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
        // Use 'returnedTypes' (array of strings from PineParser) and 'returns' (string description from PineParser)
        const returnedTypes = keyedDocs.returnedTypes; // Array like ["float", "na"] or ["bool"]
        const returnsDesc = keyedDocs.returns; // String description

        if (returnedTypes && Array.isArray(returnedTypes) && returnedTypes.length > 0) {
          const typesString = returnedTypes.map(t => `\`${t}\``).join(' or ');
          let md = `  \n${Helpers.boldWrap('Returns')} - ${typesString}`;
          if (returnsDesc && typeof returnsDesc === 'string' && returnsDesc.trim()) {
            md += `: ${Helpers.formatUrl(returnsDesc.trim())}`;
          }
          return [md];
        } else if (returnsDesc && typeof returnsDesc === 'string' && returnsDesc.trim()) {
          // Only description, no specific types array
          return [`  \n${Helpers.boldWrap('Returns')} - ${Helpers.formatUrl(returnsDesc.trim())}`];
        }
        return []; // No return info
      }
      return [];
    } catch (error) {
      console.error('Error in appendReturns:', error);
      return [];
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
        let build: string[] = []; // Initialize as string[]
        const seeAlsoContent = keyedDocs.seeAlso instanceof Array ? keyedDocs.seeAlso.join(', ') : keyedDocs.seeAlso;
        const formattedUrl = Helpers.formatUrl(seeAlsoContent ?? '');

        if (formattedUrl && formattedUrl.trim()) {
          build.push(PineHoverBuildMarkdown.iconString);
          build.push(formattedUrl);
        }
        return build; // Returns string[] (possibly empty or with content)
      }
      return [];
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  /**
   * Appends UDT fields to the markdown.
   * @param keyedDocs - The documentation object for the UDT.
   * @returns A promise that resolves to an array containing the UDT fields markdown.
   */
  static async appendUDTFields(keyedDocs: any) { // keyedDocs is the UDT documentation object
    try {
      // UDT fields are in keyedDocs.fields, each with name, type, desc, default
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
  static async appendEnumMembers(keyedDocs: any) { // keyedDocs is the Enum documentation object
    try {
      const members = keyedDocs?.members; // Enum members are in keyedDocs.members from PineParser
      if (!members || !Array.isArray(members) || members.length === 0) {
        return [];
      }
      let build: string[] = ['  \n', Helpers.boldWrap('Members'), '\n'];
      for (const member of members) {
        if (!member || typeof member !== 'object' || !member.name) {
          continue;
        }
        const name = member.name;
        // const value = member.value; // If enum members have values and we want to show them
        const memberDesc = member.desc || '(No description)'; // desc from PineParser

        let memberSignature = `- **${name}**`;
        // if (value) {
        //   memberSignature += ` = \`${value}\``;
        // }
        memberSignature += `: ${Helpers.formatUrl(memberDesc)}`;
        build.push(memberSignature + '  \n');
      }
      return build;
    } catch (error) {
      console.error('Error in appendEnumMembers:', error);
      return [];
    }
  }
}
