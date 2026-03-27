import { getOrCreateGame, reinitGame } from "./router.js";
import { executeCommand } from "./execute-command.js";
import type { CommandResult } from "./execute-command.js";

interface StreamEvent {
  phase: "ai" | "done" | "error";
  result?: CommandResult;
  error?: string;
}

export interface AuthenticatedUser {
  userId: string;
  userName: string;
}

/**
 * Handle a command request with streaming status updates.
 * Sends NDJSON: {"phase":"ai"} when AI starts, {"phase":"done","result":{...}} when complete.
 */
export async function handleCommandStream(
  request: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  const body = (await request.json()) as { gameId: string; text: string; debug?: boolean };
  const { gameId, text, debug } = body;
  const session = { gameId, userId: user.userId };

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function send(event: StreamEvent): void {
    writer.write(encoder.encode(JSON.stringify(event) + "\n"));
  }

  const commandPromise = (async () => {
    try {
      const game = await getOrCreateGame(session);
      const result = await executeCommand(
        { gameId, userId: user.userId, text, debug },
        {
          game,
          reinitGame: (s) => reinitGame(s),
          onAiStart() {
            send({ phase: "ai" });
          },
        },
      );
      send({ phase: "done", result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[command-stream] Error:", err);
      send({ phase: "error", error: message });
    } finally {
      writer.close();
    }
  })();

  // Don't await — let the stream flow
  void commandPromise;

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
