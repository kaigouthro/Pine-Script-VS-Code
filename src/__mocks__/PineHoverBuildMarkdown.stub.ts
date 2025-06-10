// src/__mocks__/PineHoverBuildMarkdown.stub.ts
export class PineHoverBuildMarkdown {
  public static iconString: string = 'mockIconString'; // Stub the problematic static property

  // Add jest.fn() for any static methods that might be called if other modules import this one
  public static appendSyntax = jest.fn();
  public static appendDescription = jest.fn();
  public static appendParams = jest.fn();
  public static appendReturns = jest.fn();
  public static appendRemarks = jest.fn();
  public static appendSeeAlso = jest.fn();
  public static appendUDTFields = jest.fn();
  public static appendEnumMembers = jest.fn();
  public static boldWrap = jest.fn(text => `**${text}**`); // Example implementation
  public static cbWrap = jest.fn(text => `\`\`\`pine\n${text}\n\`\`\``);
}
export default PineHoverBuildMarkdown;
