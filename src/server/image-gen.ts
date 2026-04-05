import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GenerateImageParams {
  prompt: string;
  stylePrompt: string;
  aspectRatio: string;
}

export interface GeneratedImage {
  data: Uint8Array;
  mimeType: string;
}

class ImageGenConfigError extends Error {
  constructor() {
    super("GOOGLE_GENERATIVE_AI_API_KEY not set");
    this.name = "ImageGenConfigError";
  }
}

class ImageGenNoPartsError extends Error {
  constructor() {
    super("Image generation failed: no parts in response");
    this.name = "ImageGenNoPartsError";
  }
}

class ImageGenNoImageError extends Error {
  constructor() {
    super("Image generation failed: no image data in response");
    this.name = "ImageGenNoImageError";
  }
}

const IMAGE_GEN_TIMEOUT_MS = 60_000;

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!apiKey) {
    throw new ImageGenConfigError();
  }
  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

export async function generateImage(params: GenerateImageParams): Promise<GeneratedImage> {
  const client = getClient();
  // responseModalities and imageConfig are supported by the API but not yet in the SDK types
  const generationConfig = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: params.aspectRatio },
  } as Record<string, unknown>;
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: generationConfig as any,
  });

  const fullPrompt = [params.stylePrompt, params.prompt].join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    });

    const response = result.response;
    const candidates = response.candidates;
    const firstCandidate = candidates && candidates[0];
    const parts = firstCandidate && firstCandidate.content && firstCandidate.content.parts;
    if (!parts) {
      throw new ImageGenNoPartsError();
    }

    for (const part of parts) {
      if (part.inlineData) {
        const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.codePointAt(0) || 0);
        return {
          data: bytes,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }

    throw new ImageGenNoImageError();
  } finally {
    clearTimeout(timeout);
  }
}
