import { PineAnnotationParser, ParsedDocumentation } from './PineAnnotationParser';

// Assertion Helper
function assertDeepEqual(actual: any, expected: any, message: string) {
    // Helper to sort keys of an object for consistent stringification
    const sortObjectKeys = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(sortObjectKeys);
        }
        const sortedKeys = Object.keys(obj).sort();
        const result: { [key: string]: any } = {};
        for (const key of sortedKeys) {
            result[key] = sortObjectKeys(obj[key]);
        }
        return result;
    };

    const actualSorted = sortObjectKeys(actual);
    const expectedSorted = sortObjectKeys(expected);

    const actualJson = JSON.stringify(actualSorted);
    const expectedJson = JSON.stringify(expectedSorted);

    if (actualJson !== expectedJson) {
        console.error(`Assertion Failed: ${message}`);
        console.error(`Expected: ${JSON.stringify(expected)}`); // Log original for clarity
        console.error(`Actual:   ${JSON.stringify(actual)}`);   // Log original for clarity
        console.error(`Expected (sorted JSON): ${expectedJson}`);
        console.error(`Actual (sorted JSON):   ${actualJson}`);
        throw new Error(`Assertion Failed: ${message}. Expected (sorted): ${expectedJson}, Actual (sorted): ${actualJson}`);
    }
    console.log(`Assertion Passed: ${message}`);
}

function runPineAnnotationParserTests() {
    console.log("Running PineAnnotationParser Tests...");
    let allTestsPassed = true;

    try {
        // Test 1: Empty Input
        const emptyInput: string[] = [];
        const expectedEmpty: ParsedDocumentation | null = null;
        assertDeepEqual(PineAnnotationParser.parse(emptyInput), expectedEmpty, "Test 1: Empty Input");

        // Test 2: No Annotations
        const noAnnotationsInput = ["// Just a regular comment", "// another comment"];
        const expectedNoAnnotations: ParsedDocumentation | null = null;
        assertDeepEqual(PineAnnotationParser.parse(noAnnotationsInput), expectedNoAnnotations, "Test 2: No Annotations");

        // Test 3: Basic Function
        const basicFunctionInput = ["// @function This is a test function."];
        const expectedBasicFunction: ParsedDocumentation = {
            type: 'function',
            mainDescription: "This is a test function."
        };
        assertDeepEqual(PineAnnotationParser.parse(basicFunctionInput), expectedBasicFunction, "Test 3: Basic Function");

        // Test 4: Function with Params
        const paramsFunctionInput = ["// @function Test with params.", "// @param p1 (string) First param.", "// @param p2 No type info."];
        const expectedParamsFunction: ParsedDocumentation = {
            type: 'function',
            mainDescription: "Test with params.",
            params: [
                { name: "p1", type: "string", description: "First param." },
                { name: "p2", type: undefined, description: "No type info." }
            ]
        };
        assertDeepEqual(PineAnnotationParser.parse(paramsFunctionInput), expectedParamsFunction, "Test 4: Function with Params");

        // Test 5: Function with Returns
        const returnsFunctionInput = ["// @function Test with returns.", "// @returns (number) The result."];
        const expectedReturnsFunction: ParsedDocumentation = {
            type: 'function',
            mainDescription: "Test with returns.",
            returns: { type: "number", description: "The result." }
        };
        assertDeepEqual(PineAnnotationParser.parse(returnsFunctionInput), expectedReturnsFunction, "Test 5: Function with Returns");

        // Test 6: Full Function Example
        const fullFunctionInput = [
            "// @function Initializes a series on the first bar and carries its value forward.",
            "// @param self (bool)The series to initialize.",
            "// @param initial_value (bool) The value to use on the first bar if `self` is `na`.",
            "// @returns The value of `self` on the first bar, or `initial_value` if `self` is `na`."
        ];
        const expectedFullFunction: ParsedDocumentation = {
            type: 'function',
            mainDescription: "Initializes a series on the first bar and carries its value forward.",
            params: [
                { name: "self", type: "bool", description: "The series to initialize." },
                { name: "initial_value", type: "bool", description: "The value to use on the first bar if `self` is `na`." }
            ],
            returns: { description: "The value of `self` on the first bar, or `initial_value` if `self` is `na`.", type: undefined }
        };
        assertDeepEqual(PineAnnotationParser.parse(fullFunctionInput), expectedFullFunction, "Test 6: Full Function Example");

        // Test 7: Type (UDT) Definition
        const udtInput = ["// @type MyCustomType This is a custom type.", "// @field count (int) A counter.", "// @field name The name of the type."];
        const expectedUdt: ParsedDocumentation = {
            type: 'type',
            mainDescription: "MyCustomType This is a custom type.",
            fields: [
                { name: "count", type: "int", description: "A counter." },
                { name: "name", type: undefined, description: "The name of the type." }
            ]
        };
        assertDeepEqual(PineAnnotationParser.parse(udtInput), expectedUdt, "Test 7: Type (UDT) Definition");

        // Test 8: Enum Definition
        const enumInput = ["// @enum MyEnum Represents states.", "// @field PENDING (0) Task is pending.", "// @field COMPLETE (1) Task is complete."];
        const expectedEnum: ParsedDocumentation = {
            type: 'enum',
            mainDescription: "MyEnum Represents states.", // The parser captures everything after @enum as mainDescription
            fields: [
                { name: "PENDING", type: "0", description: "Task is pending." },
                { name: "COMPLETE", type: "1", description: "Task is complete." }
            ]
        };
        assertDeepEqual(PineAnnotationParser.parse(enumInput), expectedEnum, "Test 8: Enum Definition");

        // Test 8b: Enum Definition (mainDescription only)
        const enumInputDescOnly = ["// @enum Represents states."];
        const expectedEnumDescOnly: ParsedDocumentation = {
            type: 'enum',
            mainDescription: "Represents states.",
        };
        assertDeepEqual(PineAnnotationParser.parse(enumInputDescOnly), expectedEnumDescOnly, "Test 8b: Enum Definition (mainDescription only)");


        // Test 9: Mixed Annotations & Spacing
        const mixedInput = ["// @function   Lots of space  ", "invalid line", "// @param  p1  (  bool  )  Param with spaces.  ", "// @returns  Result.  "];
        const expectedMixed: ParsedDocumentation = {
            type: 'function',
            mainDescription: "Lots of space",
            params: [
                { name: "p1", type: "bool", description: "Param with spaces." }
            ],
            returns: { description: "Result.", type: undefined }
        };
        assertDeepEqual(PineAnnotationParser.parse(mixedInput), expectedMixed, "Test 9: Mixed Annotations & Spacing");

        // Test 10: Lines not starting with //
        const nonCommentInput = ["@function This is not a comment.", "regular code line", "// @param p1 Valid."];
        const expectedNonComment: ParsedDocumentation = {
            params: [
                { name: "p1", type: undefined, description: "Valid." }
            ]
        };
        assertDeepEqual(PineAnnotationParser.parse(nonCommentInput), expectedNonComment, "Test 10: Lines not starting with //");

        // Test 11: Only field annotations (e.g. for a UDT without @type)
        const fieldsOnlyInput = ["// @field first (string) The first field", "// @field second (number)"];
        const expectedFieldsOnly: ParsedDocumentation = {
            fields: [
                { name: "first", type: "string", description: "The first field"},
                { name: "second", type: "number", description: ""}
            ]
        };
        assertDeepEqual(PineAnnotationParser.parse(fieldsOnlyInput), expectedFieldsOnly, "Test 11: Only field annotations");

        // Test 12: Parameter without description
        const paramNoDescInput = ["// @param noDesc (string)"];
        const expectedParamNoDesc: ParsedDocumentation = {
            params: [{ name: "noDesc", type: "string", description: "" }]
        };
        assertDeepEqual(PineAnnotationParser.parse(paramNoDescInput), expectedParamNoDesc, "Test 12: Parameter without description");

        // Test 13: Returns without description
        const returnsNoDescInput = ["// @returns (string)"];
        const expectedReturnsNoDesc: ParsedDocumentation = {
            returns: { type: "string", description: "" }
        };
        assertDeepEqual(PineAnnotationParser.parse(returnsNoDescInput), expectedReturnsNoDesc, "Test 13: Returns without description");

        // Test 14: Type annotation with name and description separation
        const typeNameDescInput = ["// @type MyCoolType - This is a very cool type."];
        const expectedTypeNameDesc: ParsedDocumentation = {
            type: 'type',
            mainDescription: "MyCoolType - This is a very cool type."
        };
        assertDeepEqual(PineAnnotationParser.parse(typeNameDescInput), expectedTypeNameDesc, "Test 14: Type annotation with name and description separation");

        // Test 15: Enum annotation with name and description separation
        const enumNameDescInput = ["// @enum MyStatusEnum - Represents various statuses."];
        const expectedEnumNameDesc: ParsedDocumentation = {
            type: 'enum',
            mainDescription: "MyStatusEnum - Represents various statuses."
        };
        assertDeepEqual(PineAnnotationParser.parse(enumNameDescInput), expectedEnumNameDesc, "Test 15: Enum annotation with name and description separation");


    } catch (e: any) {
        allTestsPassed = false;
        console.error(`Test failed: ${e.message}`);
    }

    if (allTestsPassed) {
        console.log("All PineAnnotationParser tests passed!");
        return true;
    } else {
        console.error("Some PineAnnotationParser tests failed.");
        return false;
    }
}

// To run the tests:
// runPineAnnotationParserTests();
// The actual execution will be handled by the environment calling this script.
// We need a way to signal success/failure back to the main process.
// For now, console logs will have to do, or throwing an error on failure.

// If this module is being run directly (e.g. `node src/PineAnnotationParser.test.js`)
// then run the tests. This is a common pattern but might not apply in this sandboxed env.
if (typeof require !== 'undefined' && require.main === module) {
    const success = runPineAnnotationParserTests();
    process.exit(success ? 0 : 1);
}
// Exporting the run function so it can be called from elsewhere if needed.
export { runPineAnnotationParserTests };
