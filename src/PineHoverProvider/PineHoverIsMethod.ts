import { PineDocsManager } from '../PineDocsManager';
import { Helpers } from '../PineHelpers';
import { Class } from '../PineClass';
import * as vscode from 'vscode';
// import { VSCode } from '../VSCode'; // Removed
import { PineHoverHelpers } from './PineHoverHelpers';
// import { PineConsole } from '../PineConsole';
// Ensure to adjust imports according to your actual structure

export class PineHoverMethod {
  private namespace: string = '';
  private functionName: string = '';
  private docs: PineDocsManager | undefined;
  private wordRange: vscode.Range;
  private line: string | undefined = undefined;
  private varNamespace: string | null = null;
  private funcNamespace: string | null = null;

  constructor(docs: PineDocsManager, key: string, wordRange: vscode.Range) {
    this.docs = docs;
    let splitKey = this.splitNamespaceAndFunction(key);
    this.namespace = splitKey.namespace;
    this.functionName = splitKey.functionName;
    this.wordRange = wordRange;
    // PineConsole.log('Constructor', `Namespace: ${this.namespace}, FunctionName: ${this.functionName}`);
  }

  /**
   * Checks if the method is a valid method.
   * @returns A Promise that resolves to an array containing PineDocsManager, key, and namespace.
   */
  public async isMethod(): Promise<[PineDocsManager | undefined, string | undefined, string | undefined] | undefined> {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return;
      }
      // Replaced VSCode.LineText
      this.line = activeEditor.document.lineAt(this.wordRange.start.line).text;
      // PineConsole.log('isMethod', `Line text: ${this.line}`);
      if (!this.line) {
        return;
      }

      const match = this.line.match(RegExp(`(?:([\\w.]+)\\s*\\([^\\)]+\\)|(\\w+))\\s*\\.\\s*${this.functionName}`));
      // PineConsole.log('isMethod', `Match result: ${match}`);
      if (match) {
        this.funcNamespace = match[1]
        this.varNamespace = match[2];
      }

      if (!this.namespace && !this.functionName) {
        return [this.docs, this.functionName, undefined];
      }

      let docsAndKey = await this.locateUserTypeMethod();
      // PineConsole.log('isMethod', `Docs and key: ${docsAndKey}`);
      if (docsAndKey) {
        return [...docsAndKey, this.namespace];
      }

      const methods = this.generatePossibleMethodNames();
      return await this.findDocumentationForMethods(methods);

    } catch (e: any) {
      console.error('isMethod', `Error: ${e.message}`);
      throw e;
    }
  }


  /**
   * Splits the namespace and function name.
   * @param key The key.
   * @returns An object containing the namespace and function name.
   */
  private splitNamespaceAndFunction(key: string): { namespace: string; functionName: string } {
    try {
      const split: string[] = key.split('.');
      const functionName = split.pop();
      const namespace = split.join('.');
      return {
        functionName: functionName ?? '',
        namespace: namespace ?? '',
      };
    } catch (e: any) {
      console.error('splitNamespaceAndFunction', `Error: ${e.message}`);
      throw e;
    }
  }


  /**
   * Locates the user type method.
   * @returns A Promise that resolves to an array containing PineDocsManager and key.
   */
  private async locateUserTypeMethod(): Promise<[PineDocsManager | undefined, string | undefined] | undefined> {
    try {
      // PineConsole.log('locateUserTypeMethod', `Namespace: ${this.varNamespace}, FunctionNamespace: ${this.funcNamespace}`);
      if (!this.varNamespace && !this.funcNamespace) {
        return;
      }

      let map: Map<string, any> | undefined;
      let docs: PineDocsManager | undefined;

      if (this.varNamespace) {
        map = Class.PineDocsManager.getMap('variables', 'variables2');
        if (map.has(this.varNamespace)) {
          docs = map.get(this.varNamespace);
        }

      } else if (this.funcNamespace) {
        map = Class.PineDocsManager.getMap('functions', 'completionFunctions');
        if (map.has(this.funcNamespace)) {
          docs = map.get(this.funcNamespace);
        }
      }

      if (!docs) {
        return;
      }

      let type: string | string[] = Helpers.returnTypeArrayCheck(docs);

      if (type.includes('|')) {
        type = type.split('|')
      } else {
        type = [type]
      }

      map = Class.PineDocsManager.getMap('methods', 'methods2');
      // PineConsole.log('locateUserTypeMethod 0', `Type: ${type}`);

      let matchDocs: PineDocsManager | undefined;
      let matchKey: string | undefined;
      Loop: for (let [key, value] of map.entries()) {

        if (value.methodName === this.functionName) {
          matchDocs = value;
          matchKey = key;

          let thisTypeValues: string | string[] = Helpers.returnTypeArrayCheck(value, ['thisType'])

          if (thisTypeValues.includes('|')) {
            thisTypeValues = thisTypeValues.split('|')
          } else {
            thisTypeValues = [thisTypeValues]
          }

          // PineConsole.log('locateUserTypeMethod 1', `Key: ${key}, Type: ${type}, ThisTypeValues: ${thisTypeValues}`);
          for (const i of thisTypeValues) {

            // PineConsole.log('locateUserTypeMethod 2 ', `Type includes: ${type.some((str: string) => str.includes(i))}`, `Type: ${type}, i: ${i}`);

            if (PineHoverHelpers.includesHelper(type, i)) {
              // PineConsole.log('locateUserTypeMethod 3 ', `Type includes: ${type.some((str: string) => str.includes(i))}`, `Type: ${type}, i: ${i}`);
              matchDocs = value;
              matchKey = key;
              // PineConsole.log('locateUserTypeMethod 4', `Matched key: ${JSON.stringify(matchKey)}`, `Matched docs: ${JSON.stringify(matchDocs)}`);
              break Loop;
            }
          }
        }
      }

      if (!matchDocs || !matchKey) {
        return
      }

      map = Class.PineDocsManager.getMap('functions', 'functionCompletions');
      if (map.has(matchKey)) {
        docs = map.get(matchKey)

        if (docs) {
          const copy = JSON.parse(JSON.stringify(docs))

          if (copy?.syntax && copy.args && copy.args.length > 0) {
            copy.syntax = copy.syntax.replace(/[\w.]*?(\w+\(.+)/, `${copy.args[0].name}.$1`)
          }

          return [copy, matchKey];
        }
      }

      return;
    } catch (e: any) {
      console.error('locateUserTypeMethod', `Error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Generates possible method names.
   * @returns An array containing the possible method names.
   */
  private generatePossibleMethodNames(): string[] {
    try {
      const methods = Class.PineDocsManager.getAliases.map((alias: string) => `${alias}.${this.functionName}`);
      methods.push(this.functionName);
      // PineConsole.log('generatePossibleMethodNames', `Generated Methods: ${methods.join(', ')}`);
      return methods;
    } catch (e: any) {
      console.error('generatePossibleMethodNames', `Error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Finds documentation for methods.
   * @param methods The methods.
   * @returns A Promise that resolves to an array containing PineDocsManager, key, and namespace.
   */
  private async findDocumentationForMethods(methods: string[]): Promise<[PineDocsManager | undefined, string | undefined, string | undefined] | undefined> {
    try {
      let docsGet: PineDocsManager | undefined;

      let type = Helpers.identifyType(this.namespace);
      // PineConsole.log('findDocumentationForMethods', `Type identified: ${type}`);
      const funcMap = Class.PineDocsManager.getMap('functions', 'completionFunctions');

      if (type && typeof type === 'string') {
        docsGet = await this.getDocumentationFromFunctionMap(funcMap, type, this.functionName);
      }

      // const methodMap = Class.PineDocsManager.getMap('completionFunctions');
      // docsGet ??= await this.getDocumentationFromMethodMap(methodMap, this.functionName);

      for (const method of methods) {
        if (docsGet) { break }

        docsGet = await this.getDocumentationFromFunctionMap(funcMap, '', method);
      }

      if (docsGet) {
        docsGet = JSON.parse(JSON.stringify(docsGet))

        // PineConsole.log('findDocumentationForMethods', `First docsGet check: ${docsGet}`);

        if (docsGet && docsGet.args[0].name && docsGet.args.length > 0) {
          this.namespace = docsGet.args[0].name
        }

        if (this.namespace && docsGet?.syntax) {
          docsGet.syntax = docsGet.syntax.replace(/[\w.]*?(\w+\(.+)/, `${this.namespace}.$1`)
        }

        // PineConsole.log('findDocumentationForMethods', `Second docsGet check: ${docsGet}`);

        return [docsGet, this.functionName, this.namespace];
      }

      return
    } catch (e: any) {
      console.error('findDocumentationForMethods', `Error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Gets documentation from the function map.
   * @param funcMap The function map.
   * @param type The type.
   * @param functionName The function name.
   * @returns A Promise that resolves to PineDocsManager.
   */
  private async getDocumentationFromFunctionMap(funcMap: Map<string, any>, type: string, functionName: string): Promise<PineDocsManager | undefined> {
    try {
      let docsGet: PineDocsManager | undefined;
      let keyToSearch = type ? `${type}.${functionName}` : functionName;
      if (funcMap.has(keyToSearch)) {
        docsGet = funcMap.get(keyToSearch);
      }
      return docsGet;
    } catch (e: any) {
      console.error('getDocumentationFromFunctionMap', `Error: ${e.message}`);
      throw e;
    }
  }

  // private async getDocumentationFromMethodMap(methodMap: Map<string, any>, functionName: string): Promise<PineDocsManager | undefined> {
  //   try {
  //     if (methodMap.has(`*.${functionName}`)) {
  //       return methodMap.get(`*.${functionName}`);
  //     }
  //     return
  //   } catch (e: any) {
  //     console.error('getDocumentationFromMethodMap', `Error: ${e.message}`);
  //     throw e;
  //   }
  // }
}