export class AiGenerationIncompleteError extends Error {
  override name = "AiGenerationIncompleteError";
  constructor() {
    super("AI generation returned incomplete data (missing name or description)");
  }
}
