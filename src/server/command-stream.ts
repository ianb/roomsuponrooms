import type { ServerResponse } from "node:http";
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
  roles: string[];
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
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(controller) {
      function send(event: StreamEvent): void {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      const commandPromise = (async () => {
        try {
          const game = await getOrCreateGame(session);
          const result = await executeCommand(
            { gameId, userId: user.userId, text, debug, roles: user.roles },
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
          controller.close();
        }
      })();

      void commandPromise;
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Node.js variant that writes directly to a ServerResponse.
 * Fastify's reply.send() doesn't handle Web ReadableStreams properly.
 */
export async function handleCommandStreamNode(
  {
    body,
    user,
  }: { body: { gameId: string; text: string; debug?: boolean }; user: AuthenticatedUser },
  res: ServerResponse,
): Promise<void> {
  const { gameId, text, debug } = body;
  const session = { gameId, userId: user.userId };

  function send(event: StreamEvent): void {
    res.write(JSON.stringify(event) + "\n");
  }

  try {
    const game = await getOrCreateGame(session);
    const result = await executeCommand(
      { gameId, userId: user.userId, text, debug, roles: user.roles },
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
    res.end();
  }
}
