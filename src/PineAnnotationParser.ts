export interface ParsedDocumentation {
  type?: 'function' | 'type' | 'enum';
  mainDescription?: string;
  params?: Array<{
    name: string;
    type?: string;
    description: string;
  }>;
  returns?: {
    type?: string;
    description: string;
  };
  fields?: Array<{
    name: string;
    type?: string;
    description: string;
  }>;
  // Add any other relevant fields you identify during implementation
}

export class PineAnnotationParser {
  public static parse(commentLines: string[]): ParsedDocumentation | null {
    // console.log("PineAnnotationParser.parse called with:", commentLines); // Debugging line

    const doc: ParsedDocumentation = {
      params: [],
      fields: [],
    };
    let foundAnnotation = false;

    for (const line of commentLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("//")) {
        continue;
      }

      const content = trimmedLine.substring(2).trim();

      // @function <description>
      let match = content.match(/^@function\s+(.*)/);
      if (match) {
        doc.type = 'function';
        doc.mainDescription = match[1].trim();
        foundAnnotation = true;
        continue;
      }

      // @type <name> - <description> or @type <description>
      match = content.match(/^@type\s+(.*)/);
      if (match) {
        doc.type = 'type';
        doc.mainDescription = match[1].trim();
        foundAnnotation = true;
        continue;
      }

      // @enum <name> - <description> or @enum <description>
      match = content.match(/^@enum\s+(.*)/);
      if (match) {
        doc.type = 'enum';
        doc.mainDescription = match[1].trim();
        foundAnnotation = true;
        continue;
      }

      // @param <paramName> (<paramType>) <paramDescription>
      // @param <paramName> <paramDescription>
      match = content.match(/^@param\s+([\w_]+)\s*(?:\(([^)]+)\))?\s*(.*)/);
      if (match) {
        if (!doc.params) {
          doc.params = [];
        }
        doc.params.push({
          name: match[1].trim(),
          type: match[2] ? match[2].trim() : undefined,
          description: match[3].trim(),
        });
        foundAnnotation = true;
        continue;
      }

      // @field <fieldName> (<fieldType>) <fieldDescription>
      // @field <fieldName> <fieldDescription>
      match = content.match(/^@field\s+([\w_]+)\s*(?:\(([^)]+)\))?\s*(.*)/);
      if (match) {
        if (!doc.fields) {
          doc.fields = [];
        }
        doc.fields.push({
          name: match[1].trim(),
          type: match[2] ? match[2].trim() : undefined,
          description: match[3].trim(),
        });
        foundAnnotation = true;
        continue;
      }

      // @returns (<returnType>) <returnDescription>
      // @returns <returnDescription>
      match = content.match(/^@returns\s*(?:\(([^)]+)\))?\s*(.*)/);
      if (match) {
        doc.returns = {
          type: match[1] ? match[1].trim() : undefined,
          description: match[2].trim(),
        };
        foundAnnotation = true;
        continue;
      }
    }

    if (!foundAnnotation) {
      return null;
    }

    // Clean up empty arrays if no items were added
    if (doc.params && doc.params.length === 0) {
      delete doc.params;
    }
    if (doc.fields && doc.fields.length === 0) {
      delete doc.fields;
    }


    return doc;
  }
}
