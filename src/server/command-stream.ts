import type { ServerResponse } from "node:http";
import { getOrCreateGame, reinitGame } from "./router.js";
import { executeCommand } from "./execute-command.js";
import type { CommandResult } from "./execute-command.js";
import { logErrorObj } from "./error-log.js";
import { withSessionLock } from "./session-lock.js";

interface AgentProgressPayload {
  turn: number;
  toolCalls: Array<{ name: string; summary: string }>;
}

interface StreamEvent {
  phase: "ai" | "agent-progress" | "done" | "error";
  result?: CommandResult;
  error?: string;
  progress?: AgentProgressPayload;
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

  // Once the client disconnects (cancel) or an enqueue fails, the controller
  // is unusable — further sends and the final close() would throw, turning a
  // routine disconnect into an unhandled rejection that kills the Worker.
  let closed = false;

  const readable = new ReadableStream({
    start(controller) {
      function send(event: StreamEvent): void {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch (e) {
          closed = true;
          const message = e instanceof Error ? e.message : String(e);
          console.error(`[command-stream] enqueue failed (client disconnected?): ${message}`);
        }
      }

      void (async () => {
        try {
          const result = await withSessionLock(session, async () => {
            const game = await getOrCreateGame(session);
            return executeCommand(
              { gameId, userId: user.userId, text, debug, roles: user.roles },
              {
                game,
                reinitGame: (s) => reinitGame(s),
                onAiStart() {
                  send({ phase: "ai" });
                },
                onAgentProgress(progress) {
                  send({ phase: "agent-progress", progress });
                },
              },
            );
          });
          send({ phase: "done", result });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          await logErrorObj("command-stream", { error: err, userId: user.userId, gameId });
          send({ phase: "error", error: message });
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              console.error(`[command-stream] close failed: ${message}`);
            }
          }
        }
      })();
    },
    cancel() {
      closed = true;
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
    if (res.writableEnded) return;
    res.write(JSON.stringify(event) + "\n");
  }

  try {
    const result = await withSessionLock(session, async () => {
      const game = await getOrCreateGame(session);
      return executeCommand(
        { gameId, userId: user.userId, text, debug, roles: user.roles },
        {
          game,
          reinitGame: (s) => reinitGame(s),
          onAiStart() {
            send({ phase: "ai" });
          },
          onAgentProgress(progress) {
            send({ phase: "agent-progress", progress });
          },
        },
      );
    });
    send({ phase: "done", result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await logErrorObj("command-stream", { error: err, userId: user.userId, gameId: body.gameId });
    send({ phase: "error", error: message });
  } finally {
    res.end();
  }
}
