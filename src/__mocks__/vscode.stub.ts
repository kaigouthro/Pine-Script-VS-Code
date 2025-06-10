// src/__mocks__/vscode.stub.ts
// Using 'any' for mock implementations to avoid complex type signature mismatches with jest.Mock generics.
// The goal is to satisfy type checks in the codebase, not to have a fully typed mock here.

export const Position = jest.fn((line, character) => ({ line, character, isEqual: jest.fn(), translate: jest.fn(), with: jest.fn() } as any));
export const Range = jest.fn((start, end) => ({ // start and end are positions
  start,
  end,
  contains: jest.fn(),
  isEmpty: true,
  isSingleLine: true,
  isEqual: jest.fn(),
} as any));

export const Uri = {
  file: jest.fn(path => ({
      fsPath: path,
      path,
      scheme: 'file',
      toString: () => `file://${path.replace(/\\/g, '/')}`
    } as any)),
  parse: jest.fn(uriString => ({
      fsPath: uriString.startsWith('file://') ? uriString.substring(7) : uriString,
      path: uriString.startsWith('file://') ? uriString.substring(7) : uriString,
      scheme: uriString.startsWith('file://') ? 'file' : 'untitled',
      toString: () => uriString
    } as any)),
};

export const window = {
  activeTextEditor: undefined,
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  createTextEditorDecorationType: jest.fn(),
  createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn(), clear: jest.fn(), hide: jest.fn() } as any)),
  // Add any other window properties if they are accessed
  visibleTextEditors: [],
  onDidChangeActiveTextEditor: jest.fn(),
  onDidChangeVisibleTextEditors: jest.fn(),
  onDidChangeTextEditorSelection: jest.fn(),
} as any;

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn((section, defaultValue) => defaultValue), // Return defaultValue
    has: jest.fn(() => false),
    inspect: jest.fn(),
    update: jest.fn()
  } as any)),
  textDocuments: [],
  workspaceFolders: undefined,
  fs: {
    readFile: jest.fn().mockResolvedValue(new Uint8Array()),
    stat: jest.fn().mockResolvedValue({type: 0, ctime:0, mtime:0, size:0}), // Type 0 is Unknown or File
  },
  onDidOpenTextDocument: jest.fn(),
  onDidChangeTextDocument: jest.fn(),
  onDidChangeConfiguration: jest.fn(),
  // Add any other workspace properties if they are accessed
} as any;

export const MarkdownString = jest.fn(value => ({
  value: value || '',
  isTrusted: undefined, // boolean | undefined
  supportThemeIcons: undefined, // boolean | undefined
  appendCodeblock: jest.fn(function(this: {value: string}, code, lang) { this.value += `\n\`\`\`${lang || ''}\n${code}\n\`\`\`\n`; return this; }),
  appendText: jest.fn(function(this: {value: string}, text) { this.value += text; return this; }),
  appendMarkdown: jest.fn(function(this: {value: string}, md) { this.value += md; return this; }),
} as any));

export const CompletionItem = jest.fn((label, kind?) => ({ label, kind } as any));
export const CompletionItemKind = {
    Text: 0, Function: 1, Method: 2, Constructor: 3, Field: 4, Variable: 5, Class: 6, Interface: 7, Module: 8, Property: 9,
    Unit: 10, Value: 11, Enum: 12, Keyword: 13, Snippet: 14, Color: 15, File: 16, Reference: 17, Folder: 18,
    EnumMember: 19, Constant: 20, Struct: 21, Event: 22, Operator: 23, TypeParameter: 24, User: 25, Issue: 26,
} as any;

export const Hover = jest.fn((contents, range?) => ({ contents, range } as any));
export const SnippetString = jest.fn(value => ({ value } as any));
export const TreeItem = jest.fn(label => ({ label } as any));
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as any;
export const ThemeIcon = jest.fn(id => ({ id } as any));
export const commands = {
    registerCommand: jest.fn(),
    executeCommand: jest.fn().mockResolvedValue(undefined)
} as any;
export const languages = {
    registerHoverProvider: jest.fn(),
    registerCompletionItemProvider: jest.fn(),
    createDiagnosticCollection: jest.fn(),
    match: jest.fn(),
} as any;

export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 } as any;
export const StatusBarAlignment = { Left: 1, Right: 2 } as any;
export const OverviewRulerLane = { Left:1, Center: 2, Right: 4, Full: 7 } as any;
export const TextEditorRevealType = { Default:0, InCenter:1, InCenterIfOutsideViewport:2, AtTop:3 } as any;
export const EndOfLine = { LF: 1, CRLF: 2 } as any;
export const SymbolKind = {
    File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4, Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9, Interface: 10, Function: 11, Variable: 12,
    Constant: 13, String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18, Key: 19, Null: 20, EnumMember: 21, Struct: 22, Event: 23, Operator: 24, TypeParameter: 25
} as any;

// Ensure __esModule is set for Jest's ES module interop
module.exports = {
    __esModule: true,
    Position,
    Range,
    Uri,
    window,
    workspace,
    MarkdownString,
    CompletionItem,
    CompletionItemKind,
    Hover,
    SnippetString,
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    commands,
    languages,
    DiagnosticSeverity,
    StatusBarAlignment,
    OverviewRulerLane,
    TextEditorRevealType,
    EndOfLine,
    SymbolKind,
    TextEdit: { replace: jest.fn(), insert: jest.fn(), delete: jest.fn() },
};
