/**
 * Minimal Cloudflare R2 binding types.
 * Matches the R2Bucket interface from @cloudflare/workers-types.
 */
export interface R2Bucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string,
    options?: R2PutOptions,
  ): Promise<R2Object>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
}

export interface R2HTTPMetadata {
  contentType?: string;
}

export interface R2Object {
  key: string;
  httpMetadata?: R2HTTPMetadata;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
}
