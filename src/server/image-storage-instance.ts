import type { ImageStorage } from "./image-storage.js";

let imageStorage: ImageStorage | null = null;

class ImageStorageNotConfiguredError extends Error {
  constructor() {
    super("ImageStorage not configured — call setImageStorage() before accessing image storage");
    this.name = "ImageStorageNotConfiguredError";
  }
}

/** Get the current image storage instance */
export function getImageStorage(): ImageStorage {
  if (!imageStorage) {
    throw new ImageStorageNotConfiguredError();
  }
  return imageStorage;
}

/** Set the image storage instance (call from entry point) */
export function setImageStorage(s: ImageStorage): void {
  imageStorage = s;
}
