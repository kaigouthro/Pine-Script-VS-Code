import { PineTypify, ParsedType, EditorUtils } from './PineTypify';
import { VSCode as ActualVSCode } from './VSCode'; // To allow spying/mocking parts of it
import { Class as ActualClass } from './PineClass'; // To allow spying/mocking parts of it

// Mocking the ./VSCode module
jest.mock('./VSCode', () => ({
  __esModule: true,
  VSCode: {
    Editor: undefined, // Default to undefined, tests can set this
    Document: undefined, // Default to undefined, tests can set this
    Window: {
      showErrorMessage: jest.fn(),
    },
    Linter: { // Mock Linter and its getLintResponse method
      getLintResponse: jest.fn().mockReturnValue({ success: false, result: {} }),
    },
  },
}));

// Mocking the ./PineClass module
jest.mock('./PineClass', () => ({
  __esModule: true,
  Class: {
    PineDocsManager: {
      getDocs: jest.fn().mockImplementation((docType) => {
        if (docType === 'variables') {
          return [];
        }
        return [];
      }),
    },
  },
}));

describe('PineTypify', () => {
  let pineTypifyInstance: PineTypify;

  beforeEach(() => {
    jest.clearAllMocks();
    pineTypifyInstance = new PineTypify();
  });

  it('should be defined', () => {
    expect(pineTypifyInstance).toBeDefined();
  });

  describe('parseType', () => {
    const defaultExpectedBase: Omit<ParsedType, 'baseType'> = {
        modifier: undefined,
        lib: undefined,
        containerType: undefined,
        elementType: undefined,
        keyType: undefined,
        valueType: undefined,
    };

    it('should parse simple types', () => {
        expect(PineTypify.parseType('int')).toEqual({ ...defaultExpectedBase, baseType: 'int' });
        expect(PineTypify.parseType('string')).toEqual({ ...defaultExpectedBase, baseType: 'string' });
        // ... other simple types ...
        expect(PineTypify.parseType('box')).toEqual({ ...defaultExpectedBase, baseType: 'box' });
    });

    it('should parse types with modifiers', () => {
        expect(PineTypify.parseType('series float')).toEqual({ ...defaultExpectedBase, modifier: 'series', baseType: 'float' });
        expect(PineTypify.parseType('series const color')).toEqual({ ...defaultExpectedBase, modifier: 'series', baseType: 'const color' });
        // ... other modifiers ...
    });

    it('should parse library qualified types', () => {
        expect(PineTypify.parseType('MyLib.MyType')).toEqual({ ...defaultExpectedBase, lib: 'MyLib', baseType: 'MyType' });
        expect(PineTypify.parseType('series MyLib.MyType')).toEqual({ ...defaultExpectedBase, modifier: 'series', lib: 'MyLib', baseType: 'MyType' });
    });

    it('should parse array shorthand types', () => {
        expect(PineTypify.parseType('int[]')).toEqual({
            ...defaultExpectedBase, // lib: undefined for the array container
            baseType: 'array',
            containerType: 'array',
            elementType: { ...defaultExpectedBase, baseType: 'int' }, // element has no lib
        });
        expect(PineTypify.parseType('MyLib.Point[]')).toEqual({
            ...defaultExpectedBase,
            lib: 'MyLib', // MyLib is the lib of the array type itself
            baseType: 'array',
            containerType: 'array',
            elementType: { // The element type is "Point", its lib is undefined because it's parsed from "Point"
                ...defaultExpectedBase,
                baseType: 'Point',
            },
        });
        expect(PineTypify.parseType('series color[]')).toEqual({
            ...defaultExpectedBase,
            modifier: 'series', // Modifier for the array
            baseType: 'array',
            containerType: 'array',
            elementType: { ...defaultExpectedBase, baseType: 'color' },
        });
    });

    it('should parse generic types', () => {
        expect(PineTypify.parseType('array<float>')).toEqual({
            ...defaultExpectedBase,
            baseType: 'array',
            containerType: 'array',
            elementType: { ...defaultExpectedBase, baseType: 'float' },
        });
        expect(PineTypify.parseType('matrix<int>')).toEqual({
            ...defaultExpectedBase,
            baseType: 'matrix',
            containerType: 'matrix',
            elementType: { ...defaultExpectedBase, baseType: 'int' },
        });
        expect(PineTypify.parseType('map<string, bool>')).toEqual({
            ...defaultExpectedBase,
            baseType: 'map',
            containerType: 'map',
            keyType: { ...defaultExpectedBase, baseType: 'string' },
            valueType: { ...defaultExpectedBase, baseType: 'bool' },
        });
        // For array<MyLib.Point>, MyLib.Point is the type1String.
        // parseType("MyLib.Point") will correctly return { baseType: "Point", lib: "MyLib" }
        expect(PineTypify.parseType('array<MyLib.Point>')).toEqual({
            ...defaultExpectedBase, // Top level lib is undefined
            baseType: 'array',
            containerType: 'array',
            elementType: { ...defaultExpectedBase, lib: 'MyLib', baseType: 'Point' },
        });
         expect(PineTypify.parseType('MyLib.map<string, MyOtherLib.Data>')).toEqual({
            ...defaultExpectedBase,
            lib: 'MyLib', // lib of the map container
            baseType: 'map',
            containerType: 'map',
            keyType: { ...defaultExpectedBase, baseType: 'string'},
            valueType: {...defaultExpectedBase, lib: 'MyOtherLib', baseType: 'Data'}
        });
    });

    it('should parse complex combinations', () => {
        expect(PineTypify.parseType('series array<MyLib.Data>')).toEqual({
            ...defaultExpectedBase,
            modifier: 'series', // for the array
            baseType: 'array',  // container is array
            containerType: 'array',
            elementType: { ...defaultExpectedBase, lib: 'MyLib', baseType: 'Data' },
        });
        expect(PineTypify.parseType('map<string, float>[]')).toEqual({
            ...defaultExpectedBase, // lib for array container is undefined
            baseType: 'array',
            containerType: 'array',
            elementType: { // element is a map
                ...defaultExpectedBase,
                baseType: 'map',
                containerType: 'map',
                keyType: { ...defaultExpectedBase, baseType: 'string' },
                valueType: { ...defaultExpectedBase, baseType: 'float' },
            },
        });
        expect(PineTypify.parseType('MyLib.Generic<AnotherLib.TypeA[], map<string, color>>')).toEqual({
            ...defaultExpectedBase,
            lib: 'MyLib',
            baseType: 'Generic<AnotherLib.TypeA[], map<string, color>>',
        });
    });

    it('should handle whitespace appropriately', () => {
        expect(PineTypify.parseType('  series   float  ')).toEqual({ ...defaultExpectedBase, modifier: 'series', baseType: 'float' });
        expect(PineTypify.parseType('array < int >')).toEqual({
            ...defaultExpectedBase,
            baseType: 'array',
            containerType: 'array',
            elementType: { ...defaultExpectedBase, baseType: 'int' },
        });
        expect(PineTypify.parseType('map < string , bool >')).toEqual({
            ...defaultExpectedBase,
            baseType: 'map',
            containerType: 'map',
            keyType: { ...defaultExpectedBase, baseType: 'string' },
            valueType: { ...defaultExpectedBase, baseType: 'bool' },
        });
        expect(PineTypify.parseType('  MyLib.TypeA[]  ')).toEqual({
            ...defaultExpectedBase,
            lib: 'MyLib', // Lib of the array container
            baseType: 'array',
            containerType: 'array',
            elementType: { // Element is "TypeA", no lib for it after parsing "MyLib.TypeA[]"
                ...defaultExpectedBase,
                baseType: 'TypeA',
            },
        });
    });

    it('should handle edge cases and invalid syntax gracefully', () => {
        const unknownResult = { ...defaultExpectedBase, baseType: 'unknown' };
        expect(PineTypify.parseType('')).toEqual(unknownResult);
        expect(PineTypify.parseType(null as any)).toEqual(unknownResult);
        expect(PineTypify.parseType(undefined as any)).toEqual(unknownResult);

        expect(PineTypify.parseType('array<')).toEqual({...defaultExpectedBase, baseType: 'array<' });
        expect(PineTypify.parseType('map<string,')).toEqual({...defaultExpectedBase, baseType: 'map<string,' });
        expect(PineTypify.parseType('MyLib.')).toEqual({ ...defaultExpectedBase, lib: 'MyLib', baseType: '' });
        expect(PineTypify.parseType('series const const float')).toEqual({ ...defaultExpectedBase, modifier: 'series', baseType: 'const const float'});
        expect(PineTypify.parseType('int float')).toEqual({ ...defaultExpectedBase, baseType: 'int float' });
        expect(PineTypify.parseType('[]')).toEqual({
            ...defaultExpectedBase,
            baseType: 'array',
            containerType: 'array',
            elementType: { ...defaultExpectedBase, baseType: 'unknown'},
        });
        expect(PineTypify.parseType('<int>')).toEqual({ ...defaultExpectedBase, baseType: '<int>' });
    });
  });
});

describe('EditorUtils', () => {
  it('should be defined', () => {
    expect(EditorUtils).toBeDefined();
  });
});
