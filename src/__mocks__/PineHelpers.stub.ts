// src/__mocks__/PineHelpers.stub.ts
export class Helpers {
  public static boldWrap = jest.fn(text => `mockBold(${text})`); // Used by PineHoverBuildMarkdown static init
  public static checkDesc = jest.fn(desc => desc || '');
  public static formatUrl = jest.fn(text => text);
  public static checkSyntax = jest.fn(syntax => syntax);
  public static returnTypeArrayCheck = jest.fn(() => undefined); // Or a suitable mock return
  public static getThisTypes = jest.fn(() => '');
  public static identifyType = jest.fn(() => '');
  public static replaceSyntax = jest.fn(syntax => syntax);
  public static replaceType = jest.fn(type => type);

  // Add any other static methods from the actual Helpers class that might be called
  // by any module that gets loaded during the test run.
}
export default Helpers;
