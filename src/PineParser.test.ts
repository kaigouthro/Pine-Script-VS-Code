// vscode is globally mocked via jest.config.js -> moduleNameMapper -> vscode.stub.ts
// PineHelpers, PineStrings, PineHoverBuildMarkdown are also globally mocked via moduleNameMapper

import { PineParser } from './PineParser';
import { Class } from './PineClass'; // Used to mock Class.PineRequest

jest.mock('./PineClass', () => {
    const actualPineClass = jest.requireActual('./PineClass');
    return {
        __esModule: true,
        Class: {
            ...actualPineClass.Class, // Spreads actual static members/getters
            PineRequest: { // Specific mock for PineRequest
                libList: jest.fn().mockResolvedValue([]),
                getScript: jest.fn().mockResolvedValue({ source: '' }),
            },
            // Explicitly mock PineDocsManager getter to return an object with a setParsed mock method
            get PineDocsManager() {
                return {
                    setParsed: jest.fn(),
                };
            }
        },
    };
});

jest.mock('./VSCode', () => ({
    __esModule: true,
    VSCode: {
        Text: '',
    }
}));


describe('PineParser Focused Diagnosis Tests', () => {
    let parser: PineParser;

    beforeEach(() => {
        (Class.PineRequest.libList as jest.Mock).mockClear().mockResolvedValue([]);
        (Class.PineRequest.getScript as jest.Mock).mockClear().mockResolvedValue({ source: '' });
        parser = new PineParser();
    });

    // --- Minimal UDT Test ---
    describe('Minimal UDT Parsing', () => {
        it('should parse a minimal UDT', () => {
            const script = 'type MinimalUDT\n int i';
            const result = parser.parseTypes([{ script, alias: undefined, libId: undefined }]);

            expect(result).toBeDefined();
            expect(result.udts).toBeDefined();
            expect(result.udts.length).toBeGreaterThanOrEqual(1);

            const udtData = result.udts.find((d: any) => d.originalName === 'MinimalUDT');
            expect(udtData).toBeDefined();
            if (udtData) {
                expect(udtData.name).toBe('MinimalUDT');
                expect(udtData.kind).toBe('User Type');
                expect(udtData.fields).toBeDefined();
                expect(udtData.fields.length).toBe(1);
                expect(udtData.fields[0]).toMatchObject({ name: 'i', type: 'int' });
            }
            expect(result.enums.length).toBe(0);
        });
    });

    // --- Minimal Enum Test ---
    describe('Minimal Enum Parsing', () => {
        it('should parse a minimal Enum', () => {
            const script = 'enum MinimalEnum\n A';
            const result = parser.parseTypes([{ script, alias: undefined, libId: undefined }]);

            expect(result).toBeDefined();
            expect(result.enums).toBeDefined();
            expect(result.enums.length).toBeGreaterThanOrEqual(1);

            const enumData = result.enums.find((d: any) => d.originalName === 'MinimalEnum');
            expect(enumData).toBeDefined();
            if (enumData) {
                expect(enumData.name).toBe('MinimalEnum');
                expect(enumData.kind).toBe('User Enum');
                expect(enumData.members).toBeDefined();
                expect(enumData.members.length).toBe(1);
                expect(enumData.members[0]).toMatchObject({ name: 'A', desc: '' });
            }
            expect(result.udts.length).toBe(0);
        });
    });

    // --- Minimal Function Test ---
    describe('Minimal Function Parsing', () => {
        it('should parse a minimal function', () => {
            const script = 'minimalFunc() => 0';
            const funcs = parser.parseFunctions([{ script, alias: undefined, libId: undefined }]);

            expect(funcs).toBeDefined();
            expect(funcs.length).toBeGreaterThanOrEqual(1);

            const funcData = funcs.find((f: any) => f.originalName === 'minimalFunc');
            expect(funcData).toBeDefined();
            if (funcData) {
                expect(funcData.name).toBe('minimalFunc');
                expect(funcData.kind).toBe('User Function');
                expect(funcData.args).toBeDefined();
                expect(funcData.args.length).toBe(0); // No parameters in this minimal version
                // Body parsing check can be added if necessary, e.g. expect(funcData.body).toBe('0') or similar
            }
        });

        it('should parse a minimal function with one parameter', () => {
            const script = 'minimalFuncOneParam(int p1) => p1';
            const funcs = parser.parseFunctions([{ script, alias: undefined, libId: undefined }]);

            expect(funcs).toBeDefined();
            expect(funcs.length).toBeGreaterThanOrEqual(1);

            const funcData = funcs.find((f: any) => f.originalName === 'minimalFuncOneParam');
            expect(funcData).toBeDefined();
            if (funcData) {
                expect(funcData.args).toBeDefined();
                expect(funcData.args.length).toBe(1);
                expect(funcData.args[0]).toMatchObject({ name: 'p1', type: 'int', required: true });
            }
        });
    });

    // --- Slightly More Complex UDT (from original tests) ---
    describe('parseTypes - UDTs (Original Cases)', () => {
        it('Basic UDT (Original)', () => {
            const script = 'type MyUDT\n int anInt\n string aString';
            const result = parser.parseTypes([{ script, alias: undefined, libId: undefined }]);
            expect(result).toBeDefined();
            const udtData = result.udts.find((d: any) => d.name === 'MyUDT');
            expect(udtData).toBeDefined();
            expect(udtData!).toMatchObject({
                name: 'MyUDT',
                originalName: 'MyUDT',
                kind: 'User Type',
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: 'anInt', type: 'int' }),
                    expect.objectContaining({ name: 'aString', type: 'string' }),
                ]),
            });
            expect(result.enums).toEqual([]);
        });

        it('UDT with Annotations (Original)', () => {
            const script = '//@type MyUDT UDT Doc\n//@field anInt FieldDoc\ntype MyUDT\n int anInt';
            const result = parser.parseTypes([{ script }]);
            expect(result).toBeDefined();
            const udtData = result.udts.find((d: any) => d.name === 'MyUDT');
            expect(udtData).toBeDefined();
            expect(udtData!.doc).toContain('UDT Doc');
            expect(udtData!.fields.find((f:any) => f.name === 'anInt').desc).toBe('FieldDoc');
        });

        it('Library UDT (Original)', () => {
            const script = 'type LibUDT\n int f';
            const result = parser.parseTypes([{ script, alias: 'Lib', libId: 'user/Lib/1' }]);
            expect(result).toBeDefined();
            const udtData = result.udts.find((d:any) => d.name === 'Lib.LibUDT');
            expect(udtData).toBeDefined();
            expect(udtData!).toMatchObject({ name: 'Lib.LibUDT', originalName: 'LibUDT', libraryOrigin: 'user/Lib/1' });
        });
    });

    // --- Slightly More Complex Enum (from original tests) ---
    describe('parseTypes - Enums (Original Cases)', () => {
        it('Enum with Annotations (Original)', () => {
            const script = '//@enum MyEnum EnumDoc\nenum MyEnum\n // VAL_A Doc\n VAL_A';
            const result = parser.parseTypes([{ script }]);
            expect(result).toBeDefined();
            const enumData = result.enums.find((d:any) => d.name === 'MyEnum');
            expect(enumData).toBeDefined();
            expect(enumData!.doc).toContain('EnumDoc');
            expect(enumData!.members.find((m:any) => m.name === 'VAL_A').desc).toBe('VAL_A Doc');
        });

        it('Library Enum (Original)', () => {
            const script = 'enum LibEnum\n YES';
            const result = parser.parseTypes([{ script, alias: 'Lib', libId: 'user/Lib/2' }]);
            expect(result).toBeDefined();
            const enumData = result.enums.find((d:any) => d.name === 'Lib.LibEnum');
            expect(enumData).toBeDefined();
            expect(enumData!).toMatchObject({ name: 'Lib.LibEnum', originalName: 'LibEnum', libraryOrigin: 'user/Lib/2' });
        });
    });

    // --- Slightly More Complex Function (from original tests) ---
    describe('parseFunctions (Original Cases)', () => {
        it('Function with Annotations (Original)', () => {
            const script = '//@function myFunc FuncDoc\n//@param p1 ParamDoc\nmyFunc(int p1 = 0) => 0';
            const funcs = parser.parseFunctions([{ script }]);
            expect(funcs).toBeDefined();
            const funcData = funcs.find((d:any) => d.name === 'myFunc');
            expect(funcData).toBeDefined();
            expect(funcData!.doc).toContain('FuncDoc');
            const param1 = funcData!.args.find((p:any) => p.name === 'p1');
            expect(param1).toMatchObject({ desc: 'ParamDoc', default: '0', required: false });
        });

        it('Library Function (Original - UDT Constructor like Lib.Type.new)', () => {
            const script = 'LibType.new(int val) =>\n 0';
            const funcs = parser.parseFunctions([{ script, alias: 'Lib', libId: 'user/Lib/3' }]);
            expect(funcs).toBeDefined();
            const funcData = funcs.find((d:any) => d.name === 'Lib.LibType.new');
            expect(funcData).toBeDefined();
            expect(funcData!).toMatchObject({
                name: 'Lib.LibType.new',
                originalName: 'LibType.new',
                libraryOrigin: 'user/Lib/3'
            });
            expect(funcData!.args.find((p:any) => p.name === 'val')).toMatchObject({ type: 'int' });
        });
    });
});
