/**
 * Minimal ambient types for the `cloudflare:workers` runtime module.
 * The project hand-rolls Cloudflare types rather than depending on
 * @cloudflare/workers-types (see r2-types.ts, storage-d1 D1Database).
 *
 * Only what the Worker Loader sandbox uses is declared here.
 */
declare module "cloudflare:workers" {
  /**
   * Base class for RPC-callable Worker entrypoints. Created in the parent via
   * `ctx.exports.<Name>({ props })`; `props` is then readable as `this.ctx.props`.
   */
  export abstract class WorkerEntrypoint<Env = unknown, Props = unknown> {
    protected readonly ctx: {
      readonly props: Props;
      waitUntil(promise: Promise<unknown>): void;
    };
    protected readonly env: Env;
    constructor(ctx: unknown, env: Env);
  }
}
