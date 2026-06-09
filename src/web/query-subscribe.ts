/**
 * Subscribe to a one-shot query promise from a React effect. Returns a
 * cleanup function that cancels delivery, so a response arriving after the
 * effect re-runs (e.g. the game or selection changed) can't overwrite newer
 * state. Failures are logged under `label` rather than left as unhandled
 * rejections.
 *
 * Usage: `useEffect(() => subscribeQuery(trpc.x.query(...), {...}), [deps])`
 */
export function subscribeQuery<T>(
  promise: Promise<T>,
  { label, onResult }: { label: string; onResult: (result: T) => void },
): () => void {
  let cancelled = false;
  promise.then(
    (result) => {
      if (!cancelled) onResult(result);
    },
    (err: unknown) => {
      console.error(`[${label}] query failed:`, err);
    },
  );
  return () => {
    cancelled = true;
  };
}
