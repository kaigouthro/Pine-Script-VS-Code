import * as vscode from 'vscode';
import { Helpers, PineDocString } from '../index';

export class PineHoverBuildMarkdown {

  static async appendSyntax(
    keyedDocs: any,
    key: string,
    namespace: string | undefined,
    contextualType: string,
    mapArrayMatrixKey?: string // Kept for consistency, even if unused in this method
    ): Promise<string[]> {
    let build: string[] = [];
    let syntax = '';

    if (keyedDocs?.syntax) {
      syntax = keyedDocs.syntax;
    } else if (key) {
      const typeInfo = keyedDocs?.type || 'unknown';
      const parentUDT = keyedDocs?.parentUDT;
      const parentEnum = keyedDocs?.parentEnum;

      switch (contextualType) {
        case 'variable':
          syntax = `${key}: ${typeInfo}`;
          if (keyedDocs?.isConst) syntax = `(const) ${syntax}`;
          if (keyedDocs?.isInput) syntax = `input ${syntax}`;
          if (keyedDocs?.isSeries) syntax = `series ${syntax}`;
          break;
        case 'field':
          syntax = `(field) ${parentUDT ? parentUDT + '.' : (namespace ? namespace + '.' : '')}${key}: ${typeInfo}`;
          break;
        case 'enumMember':
           syntax = `(enum member) ${parentEnum ? parentEnum + '.' : (namespace ? namespace + '.' : '')}${key}`;
          break;
        case 'UDT':
          syntax = `type ${key}`;
          break;
        case 'enum':
          syntax = `enum ${key}`;
          break;
        case 'constant':
           syntax = `(constant) ${namespace ? namespace + '.' : ''}${key}: ${typeInfo}`;
           break;
        case 'type':
            syntax = `(type) ${key}`;
            break;
        case 'annotation':
            syntax = `${key}`;
            break;
        case 'localVariable': // New case for local variables
            syntax = `(local) ${key}: ${typeInfo}`;
            break;
        case 'parameter': // New case for parameters
            const parentFunction = keyedDocs?.parentFunction ? `${keyedDocs.parentFunction}.` : '';
            syntax = `(parameter) ${parentFunction}${key}: ${typeInfo}`;
            break;
        case 'function':
        case 'method':
            let paramsString = "";
            if (keyedDocs?.args && Array.isArray(keyedDocs.args)) {
                paramsString = keyedDocs.args.map((arg: any) => {
                    let argType = arg.type || 'any';
                    let defaultValue = arg.default !== undefined ? ` = ${arg.default}` : '';
                    return `${arg.name}: ${argType}${defaultValue}`;
                }).join(', ');
            }
            const returnTypeArray = keyedDocs?.returnedTypes;
            const returnTypeStr = (Array.isArray(returnTypeArray) && returnTypeArray.length > 0)
                                 ? returnTypeArray.join(' | ')
                                 : (keyedDocs?.type || 'void');

            let prefixSyntax = "";
            let kindTag = "";

            if (contextualType === 'method') {
                 prefixSyntax = `(${keyedDocs.thisType || namespace || 'object'}).`;
                 kindTag = '(method) ';
            } else if (namespace && keyedDocs?.name && !keyedDocs.name.startsWith(namespace)) {
                prefixSyntax = `${namespace}.`;
            }

            if (contextualType === 'function') {
                kindTag = keyedDocs?.kind === 'Constructor' ? '(constructor) ' : '(function) ';
            }

            syntax = `${kindTag}${prefixSyntax}${key}(${paramsString})${returnTypeStr.toLowerCase() !== 'void' ? ` → ${returnTypeStr}` : ''}`;
            break;
        default:
          syntax = key;
      }
    }

    if (syntax) {
      // FIX: The method in PineHelpers.ts is 'cbWrap', not 'codeBlockWrap'.
      build.push(Helpers.cbWrap(syntax));
    }
    return build;
  }

  static async appendDescription(keyedDocs: any, contextualType: string): Promise<string[]> {
    let build: string[] = [];
    let description = keyedDocs?.desc || keyedDocs?.documentation || '';

    if (typeof description === 'object' && description !== null &&
        description.hasOwnProperty('value') && description.hasOwnProperty('isTrusted')) {
        description = (description as vscode.MarkdownString).value;
    } 
    // FIXME: Removed call to non-existent PineDocString.format.
    // You may need to add logic here to handle your 'description' object if it's not a string.
    // else if (typeof description === 'object' && description !== null) {
    //     description = PineDocString.format(description);
    // }

    if (description && typeof description === 'string') {
      build.push(`${Helpers.formatUrl(description)}  \n`);
    }
    return build;
  }

  static async appendParams(keyedDocs: any): Promise<string[]> {
    return this.appendParamsFields(keyedDocs, 'args', '**Parameters**');
  }

  static async appendParamsFields(keyedDocs: any, memberName: 'args' | 'fields' | 'members', title: string): Promise<string[]> {
    let build: string[] = [];
    const members = keyedDocs?.[memberName];

    if (members && Array.isArray(members) && members.length > 0) {
      build.push(`${title}  \n`);
      members.forEach((member: any) => {
        let memberDesc = member.desc || member.documentation || '';
        if (typeof memberDesc === 'object' && memberDesc !== null && memberDesc.hasOwnProperty('value') && memberDesc.hasOwnProperty('isTrusted')) {
            memberDesc = (memberDesc as vscode.MarkdownString).value;
        } 
        // FIXME: Removed call to non-existent PineDocString.format.
        // else if (typeof memberDesc === 'object' && memberDesc !== null) {
        //     memberDesc = PineDocString.format(memberDesc);
        // }

        let paramSignature = `- \`${member.name}\``;
        const typeToShow = member.type || member.displayType;
        if (typeToShow) {
          paramSignature += `: \`${typeToShow}\``;
        }

        let flags = [];
        if (memberName === 'args') {
            if (member.default !== undefined) {
                flags.push(`default: \`${member.default}\``);
            }
        }
        if (member.isConst) flags.push('const');
        if (member.isInput) flags.push('input');
        if (member.isSeries) flags.push('series');


        if (flags.length > 0) {
            paramSignature += ` (${flags.join(', ')})`;
        }

        if (memberDesc && typeof memberDesc === 'string') {
          paramSignature += ` - ${Helpers.formatUrl(memberDesc)}`;
        }
        build.push(paramSignature);
      });
      build.push('  \n');
    }
    return build;
  }

  static async appendReturns(keyedDocs: any, contextualType: string): Promise<string[]> {
    let build: string[] = [];
    let returnsType: string | undefined = undefined;
    let returnDesc = keyedDocs?.returns || '';

    if (keyedDocs?.returnedTypes && Array.isArray(keyedDocs.returnedTypes) && keyedDocs.returnedTypes.length > 0) {
        returnsType = keyedDocs.returnedTypes.join(' | ');
    } else if (keyedDocs?.type && (contextualType === 'function' || contextualType === 'method')) {
        returnsType = keyedDocs.type;
    }

    if (typeof returnDesc === 'object' && returnDesc !== null && returnDesc.hasOwnProperty('value') && returnDesc.hasOwnProperty('isTrusted')) {
        returnDesc = (returnDesc as vscode.MarkdownString).value;
    } 
    // FIXME: Removed call to non-existent PineDocString.format.
    // else if (typeof returnDesc === 'object' && returnDesc !== null) {
    //     returnDesc = PineDocString.format(returnDesc);
    // }

    if (returnsType && returnsType.toLowerCase() !== 'void') {
      build.push(`**Returns:** \`${returnsType}\`  \n`);
      if (returnDesc && typeof returnDesc === 'string') {
        build.push(`${Helpers.formatUrl(returnDesc)}  \n`);
      }
    } else if (returnDesc && typeof returnDesc === 'string') {
        build.push(`**Returns:** ${Helpers.formatUrl(returnDesc)}  \n`);
    }
    return build;
  }

  static async appendRemarks(keyedDocs: any): Promise<string[]> {
    let build: string[] = [];
    let remarks = keyedDocs?.remarks;
    if (typeof remarks === 'object' && remarks !== null && remarks.hasOwnProperty('value') && remarks.hasOwnProperty('isTrusted')) {
        remarks = (remarks as vscode.MarkdownString).value;
    } 
    // FIXME: Removed call to non-existent PineDocString.format.
    // else if (typeof remarks === 'object' && remarks !== null) {
    //     remarks = PineDocString.format(remarks);
    // }

    if (remarks && typeof remarks === 'string') {
      build.push(`**Remarks**  \n${Helpers.formatUrl(remarks)}  \n`);
    }
    return build;
  }

  static async appendSeeAlso(keyedDocs: any, key: string): Promise<string[]> {
    let build: string[] = [];
    if (keyedDocs?.seealso && Array.isArray(keyedDocs.seealso) && keyedDocs.seealso.length > 0) {
      const seeAlsoLinks = keyedDocs.seealso
        .map((sa: string) => {
            if (sa.startsWith('http://') || sa.startsWith('https://')) {
                return `[${sa}](${sa})`;
            }
            return `[\`${sa}\`](command:pine.searchDocs?${encodeURIComponent(JSON.stringify({ query: sa }))})`;
        })
        .join(' | ');
      build.push(`**See Also:** ${seeAlsoLinks}  \n`);
    }
    return build;
  }
}