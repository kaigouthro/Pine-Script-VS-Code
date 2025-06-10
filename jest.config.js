module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      // isolatedModules: true, // Can speed up, but sacrifices type-checking during test compilation
    }],
  },

  moduleNameMapper: {
    // Map 'vscode' module to our simplified stub
    '^vscode$': '<rootDir>/src/__mocks__/vscode.stub.ts',

    // Map problematic internal modules to their stubs
    // These regexes try to catch imports regardless of relative path (e.g. './', '../', '../../')
    // Assumes stub files are in <rootDir>/src/__mocks__/
    '^.*/PineHoverProvider/PineHoverBuildMarkdown$': '<rootDir>/src/__mocks__/PineHoverBuildMarkdown.stub.ts',
    '^.*/PineHelpers$': '<rootDir>/src/__mocks__/PineHelpers.stub.ts',
    '^.*/PineStrings$': '<rootDir>/src/__mocks__/PineStrings.stub.ts',

    // If PineClass or VSCode wrapper itself becomes an issue due to static init or complex dependencies
    // that are NOT needed for PineParser unit tests, they could also be mapped here.
    // Example:
    // "^(.*)/PineClass$": "<rootDir>/src/__mocks__/PineClass.stub.ts", // If PineClass needed stubbing
    // "^(.*)/VSCode$": "<rootDir>/src/__mocks__/VSCode.stub.ts", // If the VSCode wrapper needed stubbing
  },

  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],

  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/src/__mocks__/', // Don't run tests on the stubs themselves
  ],

  transformIgnorePatterns: [
    '/node_modules/',
    '\\.pnp\\.[^\\/]+$',
  ],
};
