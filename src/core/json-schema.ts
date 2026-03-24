/**
 * Minimal subset of JSON Schema Draft 7 used for property definitions.
 * Kept intentionally small — extend as needed.
 */
export interface JSONSchema7 {
  type?: JSONSchema7Type | JSONSchema7Type[];
  description?: string;
  format?: string;
  enum?: readonly unknown[];

  // numbers
  minimum?: number;
  maximum?: number;

  // strings
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // arrays
  items?: JSONSchema7;
  minItems?: number;
  maxItems?: number;

  // objects
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;

  // composition
  oneOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  allOf?: JSONSchema7[];

  // metadata
  default?: unknown;
  title?: string;
}

export type JSONSchema7Type =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";
