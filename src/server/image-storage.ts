import { resolve, dirname } from "node:path";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import type { R2Bucket } from "./r2-types.js";

export interface PutImageOptions {
  key: string;
  data: Uint8Array;
  mimeType: string;
}

export interface ImageStorage {
  putImage(opts: PutImageOptions): Promise<void>;
  getImage(key: string): Promise<{ data: ReadableStream | Uint8Array; mimeType: string } | null>;
  deleteImage(key: string): Promise<void>;
}

/** R2-backed image storage for Cloudflare Workers */
export class R2ImageStorage implements ImageStorage {
  private bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async putImage(opts: PutImageOptions): Promise<void> {
    await this.bucket.put(opts.key, opts.data, {
      httpMetadata: { contentType: opts.mimeType },
    });
  }

  async getImage(
    key: string,
  ): Promise<{ data: ReadableStream | Uint8Array; mimeType: string } | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    const meta = obj.httpMetadata;
    return {
      data: obj.body,
      mimeType: (meta && meta.contentType) || "image/png",
    };
  }

  async deleteImage(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

/** File-backed image storage for local Node dev */
export class FileImageStorage implements ImageStorage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private filePath(key: string): string {
    return resolve(this.baseDir, key);
  }

  async putImage(opts: PutImageOptions): Promise<void> {
    const path = this.filePath(opts.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, opts.data);
  }

  async getImage(
    key: string,
  ): Promise<{ data: ReadableStream | Uint8Array; mimeType: string } | null> {
    try {
      const data = await readFile(this.filePath(key));
      const mimeType = key.endsWith(".png") ? "image/png" : "image/jpeg";
      return { data: new Uint8Array(data), mimeType };
    } catch (_e) {
      return null;
    }
  }

  async deleteImage(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch (_e) {
      // ignore if not found
    }
  }
}
