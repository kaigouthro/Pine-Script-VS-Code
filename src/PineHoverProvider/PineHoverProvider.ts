import * as vscode from 'vscode';
import { PineDocsManager } from '../PineDocsManager';
import { PineCompletionService } from '../PineCompletionService';
import { PineHoverBuildMarkdown } from './PineHoverBuildMarkdown';
import { Class } from '../PineClass';

export class PineHoverProvider implements vscode.HoverProvider {
    document!: vscode.TextDocument;
    position!: vscode.Position;
    private pineDocsManager: PineDocsManager;
    private pineCompletionService: PineCompletionService;

    constructor() {
        if (!Class.PineDocsManager) {
            Class.PineDocsManager = new PineDocsManager();
        }
        this.pineDocsManager = Class.PineDocsManager;

        if (!Class.PineCompletionService) {
            Class.PineCompletionService = new PineCompletionService(this.pineDocsManager);
        }
        this.pineCompletionService = Class.PineCompletionService;
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.Hover | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (!(editor && editor.document.languageId === 'pine' && editor.document.uri.scheme === 'file')) {
            return;
        }
        if (token.isCancellationRequested) {
            return;
        }

        this.document = document;
        this.position = position;

        const wordRange = document.getWordRangeAtPosition(position, /([a-zA-Z_][a-zA-Z0-9_]*(\s*\.\s*[a-zA-Z_][a-zA-Z0-9_]*)*)/);

        let potentialFullPathText: string;
        let targetWordRange: vscode.Range | undefined = wordRange;

        if (!targetWordRange) {
            targetWordRange = document.getWordRangeAtPosition(position);
            if (!targetWordRange) return;
            potentialFullPathText = document.getText(targetWordRange);
        } else {
            potentialFullPathText = document.getText(targetWordRange);
        }

        const lineText = document.lineAt(position.line).text;
        if (/^\s*\/\/\s*@/.test(lineText)) {
            const annotationKeywordRange = document.getWordRangeAtPosition(position, /@[a-zA-Z_][a-zA-Z0-9_]*/);
            if (annotationKeywordRange && annotationKeywordRange.contains(position)) {
                const annotationKey = document.getText(annotationKeywordRange);
                const annotationDoc = this.pineDocsManager.getMap('annotations').get(annotationKey.substring(1));
                if (annotationDoc) {
                    const markdown = await this.createHoverMarkdown(annotationDoc, annotationKey, undefined, 'annotation');
                    return new vscode.Hover(markdown, annotationKeywordRange);
                }
            }
        }

        const cleanedFullPath = potentialFullPathText.replace(/\s/g, '');

        return this.resolveAndBuildHover(cleanedFullPath, targetWordRange);
    }

    private async resolveAndBuildHover(fullPath: string, originalWordRange: vscode.Range): Promise<vscode.Hover | undefined> {
        if (!fullPath) return;

        const { doc, name, context } = await this.resolveSymbolDocumentation(fullPath, originalWordRange);

        if (doc && name) {
            let finalHoverRange = originalWordRange;
            if (fullPath.includes('.')) {
                const lastPart = fullPath.substring(fullPath.lastIndexOf('.') + 1);
                const textInOriginalRange = this.document.getText(originalWordRange);
                const lastPartStartIndexInOriginal = textInOriginalRange.lastIndexOf(lastPart);

                if (lastPartStartIndexInOriginal !== -1) {
                    const charAfterLastPart = textInOriginalRange.substring(lastPartStartIndexInOriginal + lastPart.length);
                    if (!charAfterLastPart || !/^\w/.test(charAfterLastPart)) {
                        const startCharacter = originalWordRange.start.character + lastPartStartIndexInOriginal;
                        finalHoverRange = new vscode.Range(
                            originalWordRange.start.line,
                            startCharacter,
                            originalWordRange.start.line,
                            startCharacter + lastPart.length
                        );
                    }
                }
            }
            const markdown = await this.createHoverMarkdown(doc, name, context?.namespace, context?.type || 'identifier', context?.mapArrayMatrix);
            return new vscode.Hover(markdown, finalHoverRange);
        }
        return undefined;
    }

    private async resolveSymbolDocumentation(
        fullPath: string,
        finalWordRange: vscode.Range,
    ): Promise<{ doc: any | null; name: string | null; context?: any }> {
        const parts = fullPath.split('.');
        const charAfterRange = this.document.getText(new vscode.Range(finalWordRange.end, finalWordRange.end.translate(0,1)));
        const isFunctionCall = charAfterRange === '(';

        if (parts.length === 1) {
            const identifier = parts[0];
            let doc: any = null;
            let contextType = 'identifier';

            doc = this.pineDocsManager.getMap('variables2').get(identifier);
            if (doc) contextType = 'variable';

            if (!doc && isFunctionCall) {
                doc = this.pineCompletionService.getFunctionDocs(identifier);
                if (doc) contextType = doc?.kind === 'Constructor' ? 'UDT' : (doc?.isMethod ? 'method' : 'function');
            }

            if (!doc) {
                const funcDoc = this.pineCompletionService.getFunctionDocs(identifier);
                if (funcDoc && !funcDoc.isMethod && funcDoc.name === identifier) {
                    doc = funcDoc;
                    contextType = funcDoc?.kind === 'Constructor' ? 'UDT' : 'function';
                }
            }

            if (!doc) {
                doc = this.pineDocsManager.getMap('UDT').get(identifier);
                if (doc) contextType = 'UDT';
            }
            if (!doc) {
                doc = this.pineDocsManager.getMap('enums').get(identifier);
                if (doc) contextType = 'enum';
            }
            if (!doc) {
                const constDoc = this.pineDocsManager.getMap('constants').get(identifier);
                if (constDoc && !constDoc.name.includes('.')) {
                    doc = constDoc;
                    contextType = 'constant';
                } else if (constDoc && constDoc.name.includes('.')) {
                    doc = null;
                }
            }
             if (!doc) {
                doc = this.pineDocsManager.getMap('types').get(identifier);
                if (doc) contextType = 'type';
            }

            if (doc) {
                return { doc, name: identifier, context: { type: contextType, libId: doc.libId } };
            }
            return { doc: null, name: null };
        }

        let currentTypeName: string | null = null;
        let currentTypeLibId: string | undefined = undefined;
        let effectiveNamespace = parts.slice(0, parts.length -1).join('.');

        const firstPartName = parts[0];
        const variableDoc = this.pineDocsManager.getMap('variables2').get(firstPartName);

        if (variableDoc && variableDoc.type) {
            currentTypeName = variableDoc.type.replace(/(const|input|series|simple|literal)\s*/g, '').replace(/\s*\[\]$/, '');
            const typeDefForLibId = this.pineDocsManager.getMap('UDT', 'enums').get(currentTypeName);
            currentTypeLibId = typeDefForLibId?.libId || variableDoc.libId;
        } else {
            const udtOrEnumDoc = this.pineDocsManager.getMap('UDT', 'enums').get(firstPartName);
            if (udtOrEnumDoc) {
                currentTypeName = firstPartName;
                currentTypeLibId = udtOrEnumDoc.libId;
            } else {
                currentTypeName = firstPartName;
                const typeDoc = this.pineDocsManager.getMap('types').get(firstPartName);
                currentTypeLibId = typeDoc?.libId;
            }
        }

        for (let i = 1; i < parts.length - 1; i++) {
            const segmentName = parts[i];
            if (!currentTypeName) return { doc: null, name: null };

            const udtDefinition = this.pineDocsManager.getMap('UDT').get(currentTypeName);
            if (udtDefinition && udtDefinition.fields) {
                const foundField = udtDefinition.fields.find((f: any) => f.name === segmentName);
                if (foundField && foundField.type) {
                    currentTypeName = foundField.type.replace(/(const|input|series|simple|literal)\s*/g, '').replace(/\s*\[\]$/, '');
                    const nextUdtDef = this.pineDocsManager.getMap('UDT').get(currentTypeName);
                    currentTypeLibId = nextUdtDef?.libId || foundField.libId;
                } else {
                    currentTypeName = null; break;
                }
            } else {
                currentTypeName = null; break;
            }
        }

        const targetName = parts[parts.length - 1];

        if (isFunctionCall) {
            let methodDoc = this.pineCompletionService.getFunctionDocs(fullPath);
            if (!methodDoc && currentTypeName && currentTypeName !== effectiveNamespace.substring(0, currentTypeName.length)) {
                 methodDoc = this.pineCompletionService.getFunctionDocs(\`\${currentTypeName}.\${targetName}\`);
            }

            if (methodDoc && (methodDoc.isMethod || methodDoc.name.includes('.'))) {
                return {
                    doc: methodDoc, name: targetName,
                    context: {
                        type: methodDoc.kind === 'Constructor' ? 'UDT' : (methodDoc.isMethod ? 'method' : 'function'),
                        namespace: effectiveNamespace,
                        thisType: methodDoc.isMethod ? currentTypeName : undefined,
                        libId: methodDoc.libId || currentTypeLibId
                    }
                };
            }
        }

        if (currentTypeName) {
            const udtDefinition = this.pineDocsManager.getMap('UDT').get(currentTypeName);
            if (udtDefinition && udtDefinition.fields) {
                const foundField = udtDefinition.fields.find((f: any) => f.name === targetName);
                if (foundField) {
                    if (!foundField.libId && currentTypeLibId) foundField.libId = currentTypeLibId;
                    foundField.parentUDT = currentTypeName;
                    return { doc: foundField, name: targetName, context: { type: 'field', namespace: effectiveNamespace, libId: foundField.libId } };
                }
            }

            const enumDefinition = this.pineDocsManager.getMap('enums').get(currentTypeName);
            if (enumDefinition && enumDefinition.members) {
                const foundMember = enumDefinition.members.find((m: any) => m.name === targetName);
                if (foundMember) {
                    if (!foundMember.libId && currentTypeLibId) foundMember.libId = currentTypeLibId;
                    foundMember.parentEnum = currentTypeName;
                    return { doc: foundMember, name: targetName, context: { type: 'enumMember', namespace: effectiveNamespace, libId: foundMember.libId } };
                }
            }
        }

        const constantDoc = this.pineDocsManager.getMap('constants').get(fullPath);
        if (constantDoc && constantDoc.name === fullPath) {
             return {
                 doc: constantDoc, name: targetName,
                 context: { type: 'constant', namespace: effectiveNamespace, libId: constantDoc.libId }
             };
        }

        if (!isFunctionCall && parts.length > 1) {
            const funcDoc = this.pineCompletionService.getFunctionDocs(fullPath);
            if (funcDoc && (funcDoc.isMethod || funcDoc.name.includes('.'))) {
                 return {
                    doc: funcDoc, name: targetName,
                    context: {
                        type: funcDoc.kind === 'Constructor' ? 'UDT' : (funcDoc.isMethod ? 'method' : 'function'),
                        namespace: effectiveNamespace,
                        thisType: funcDoc.isMethod ? currentTypeName : undefined,
                        libId: funcDoc.libId || currentTypeLibId
                    }
                };
            }
        }
        return { doc: null, name: null };
    }

    private async createHoverMarkdown(
        keyedDocs: any, key: string, namespace: string | undefined,
        contextualType: string, mapArrayMatrix?: string, // mapArrayMatrix is passed to appendSyntax
    ): Promise<vscode.MarkdownString> {

        const markdownSections: string[][] = [];
        const libIdToDisplay = keyedDocs?.libId ||
                               (namespace ? (this.pineDocsManager.getMap('UDT','enums').get(namespace))?.libId : undefined) ||
                               (keyedDocs?.parentUDT ? (this.pineDocsManager.getMap('UDT').get(keyedDocs.parentUDT))?.libId : undefined) ||
                               (keyedDocs?.parentEnum ? (this.pineDocsManager.getMap('enums').get(keyedDocs.parentEnum))?.libId : undefined);

        // Pass mapArrayMatrix to appendSyntax call
        markdownSections.push(await PineHoverBuildMarkdown.appendSyntax(keyedDocs, key, namespace, contextualType, mapArrayMatrix));


        if (libIdToDisplay) {
            markdownSections.push([\`**Library:** \${libIdToDisplay}\`  \n\`]);
        }

        markdownSections.push(await PineHoverBuildMarkdown.appendDescription(keyedDocs, contextualType));

        if ((contextualType === 'function' || contextualType === 'method' || (contextualType === 'UDT' && key.endsWith('.new'))) && keyedDocs?.args) {
             markdownSections.push(await PineHoverBuildMarkdown.appendParams(keyedDocs));
        }
        if (contextualType === 'UDT' && keyedDocs?.fields) {
             markdownSections.push(await PineHoverBuildMarkdown.appendParamsFields(keyedDocs, 'fields', '**Fields**'));
        } else if (contextualType === 'field' && keyedDocs?.type) {
            // No specific section for single field's "parameters", its type is in syntax.
        }

        if (contextualType === 'enum' && keyedDocs?.members) {
             markdownSections.push(await PineHoverBuildMarkdown.appendParamsFields(keyedDocs, 'members', '**Members**'));
        } else if (contextualType === 'enumMember') {
            // No specific section for single enum member's "parameters".
        }

        if (contextualType === 'function' || contextualType === 'method' || (contextualType === 'UDT' && key.endsWith('.new'))) {
            markdownSections.push(await PineHoverBuildMarkdown.appendReturns(keyedDocs, contextualType));
        }

        markdownSections.push(await PineHoverBuildMarkdown.appendRemarks(keyedDocs));
        markdownSections.push(await PineHoverBuildMarkdown.appendSeeAlso(keyedDocs, key));

        const markdownContent = markdownSections.flat().filter(s => s && s.trim() !== '').join('\n').trim();
        const markdownString = new vscode.MarkdownString(markdownContent);
        markdownString.isTrusted = true;
        return markdownString;
    }
}
