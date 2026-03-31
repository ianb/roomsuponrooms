interface CommandResult {
  output: string;
  debug?: unknown;
  conversationMode?: unknown;
  aiOutput?: string;
  eventDescriptions?: string[];
}

interface StreamEvent {
  phase: "ai" | "done" | "error";
  result?: CommandResult;
  error?: string;
}

interface StreamCommandOptions {
  gameId: string;
  text: string;
  debug: boolean;
  onPhase: (phase: string) => void;
}

class CommandHttpError extends Error {
  override name = "CommandHttpError";
  constructor(public readonly status: number) {
    super(`Command request failed with HTTP ${status}`);
  }
}

class CommandStreamEndedError extends Error {
  override name = "CommandStreamEndedError";
  constructor() {
    super("Stream ended without a result");
  }
}

class CommandServerError extends Error {
  override name = "CommandServerError";
  constructor(public readonly serverMessage: string) {
    super(serverMessage);
  }
}

/**
 * Send a command via the streaming /api/command endpoint.
 * Calls onPhase("ai") when the server signals AI is being invoked.
 * Returns the final result.
 */
export async function streamCommand(options: StreamCommandOptions): Promise<CommandResult> {
  const { gameId, text, debug, onPhase } = options;

  const response = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId, text, debug }),
  });

  if (!response.ok) {
    throw new CommandHttpError(response.status);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: CommandResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as StreamEvent;

      if (event.phase === "ai") {
        onPhase("ai");
      } else if (event.phase === "done" && event.result) {
        finalResult = event.result;
      } else if (event.phase === "error") {
        throw new CommandServerError(event.error || "Unknown error");
      }
    }
  }

  if (!finalResult) {
    throw new CommandStreamEndedError();
  }

  return finalResult;
}
