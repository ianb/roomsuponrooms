import { getImageStorage } from "./image-storage-instance.js";

/**
 * Handle image requests: /api/images/{gameId}/{imageType}.png
 * Returns the image from storage with appropriate headers.
 */
export async function handleImageRequest(url: URL): Promise<Response> {
  const match = url.pathname.match(/^\/api\/images\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  const gameId = match[1];
  const filename = match[2];
  const r2Key = `${gameId}/images/${filename}`;

  const storage = getImageStorage();
  const result = await storage.getImage(r2Key);
  if (!result) {
    return new Response("Image not found", { status: 404 });
  }

  return new Response(result.data as BodyInit, {
    headers: {
      "Content-Type": result.mimeType,
      "Cache-Control": "no-store",
    },
  });
}
