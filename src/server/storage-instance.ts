import type { RuntimeStorage } from "./storage.js";

let storage: RuntimeStorage | null = null;

class StorageNotConfiguredError extends Error {
  constructor() {
    super("RuntimeStorage not configured — call setStorage() before accessing storage");
    this.name = "StorageNotConfiguredError";
  }
}

/** Get the current runtime storage instance */
export function getStorage(): RuntimeStorage {
  if (!storage) {
    throw new StorageNotConfiguredError();
  }
  return storage;
}

/** Set the runtime storage instance (call from entry point) */
export function setStorage(s: RuntimeStorage): void {
  storage = s;
}
