/**
 * CLI for querying and updating bug reports via the tRPC API.
 *
 * Usage:
 *   npm run bugs                    # list all open bugs
 *   npm run bugs -- list            # list all bugs
 *   npm run bugs -- list new        # list bugs with status "new"
 *   npm run bugs -- show b-xK9mQ3   # show full bug details
 *   npm run bugs -- update b-xK9mQ3 seen       # set status
 *   npm run bugs -- update b-xK9mQ3 fixed abc123  # set status + commit
 */

// BUG_API_URL defaults to production; override in .env for local dev
// eslint-disable-next-line default/no-hardcoded-urls
const BASE_URL = process.env["BUG_API_URL"] || "https://roomsuponrooms.com";
const API_KEY = process.env["API_KEY"];

if (!API_KEY) {
  console.error("Error: API_KEY not set in environment. Add it to .env");
  process.exit(1);
}

class ApiError extends Error {
  override name = "ApiError";
  constructor(public readonly status: number, public readonly body: string) {
    super("API request failed");
  }
}

interface BugReport {
  id: string;
  gameId: string;
  userId: string;
  userName: string | null;
  description: string;
  roomId: string | null;
  roomName: string | null;
  recentCommands: Array<{ command: string; events: unknown[]; timestamp: string }>;
  entityChanges: Array<{
    id: string;
    name: string;
    changes: Array<{ field: string; from: unknown; to: unknown }>;
  }>;
  status: string;
  fixCommit: string | null;
  duplicateOf: string | null;
  createdAt: string;
  updatedAt: string | null;
}

async function trpcQuery(path: string, input?: unknown): Promise<unknown> {
  let url = `${BASE_URL}/trpc/${path}`;
  if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text);
  }
  const data = (await response.json()) as { result: { data: unknown } };
  return data.result.data;
}

async function trpcMutation(path: string, input: unknown): Promise<unknown> {
  const url = `${BASE_URL}/trpc/${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text);
  }
  const data = (await response.json()) as { result: { data: unknown } };
  return data.result.data;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

async function listBugs(status?: string): Promise<void> {
  const opts: Record<string, string> = {};
  if (status) opts.status = status;
  const bugs = (await trpcQuery("bugs", Object.keys(opts).length > 0 ? opts : undefined)) as BugReport[];
  if (bugs.length === 0) {
    console.log("No bugs found.");
    return;
  }
  console.log(`${"ID".padEnd(14)} ${"Status".padEnd(10)} ${"Game".padEnd(16)} ${"Date".padEnd(20)} Description`);
  console.log("-".repeat(90));
  for (const bug of bugs) {
    const date = formatDate(bug.createdAt);
    console.log(
      `${bug.id.padEnd(14)} ${bug.status.padEnd(10)} ${bug.gameId.padEnd(16)} ${date.padEnd(20)} ${truncate(bug.description, 40)}`,
    );
  }
}

async function showBug(id: string): Promise<void> {
  const bug = (await trpcQuery("bug", { id })) as BugReport | null;
  if (!bug) {
    console.error(`Bug ${id} not found.`);
    process.exit(1);
  }
  console.log(`Bug: ${bug.id}`);
  console.log(`Status: ${bug.status}`);
  console.log(`Game: ${bug.gameId}`);
  console.log(`User: ${bug.userName || bug.userId}`);
  console.log(`Room: ${bug.roomName || "(none)"}`);
  console.log(`Created: ${formatDate(bug.createdAt)}`);
  if (bug.updatedAt) console.log(`Updated: ${formatDate(bug.updatedAt)}`);
  if (bug.fixCommit) console.log(`Fix commit: ${bug.fixCommit}`);
  if (bug.duplicateOf) console.log(`Duplicate of: ${bug.duplicateOf}`);
  console.log(`\nDescription: ${bug.description}`);

  if (bug.recentCommands.length > 0) {
    console.log("\nRecent commands:");
    for (const cmd of bug.recentCommands) {
      console.log(`  > ${cmd.command}`);
    }
  }

  if (bug.entityChanges.length > 0) {
    console.log("\nEntity changes:");
    for (const ec of bug.entityChanges) {
      console.log(`  ${ec.name} (${ec.id}):`);
      for (const c of ec.changes) {
        console.log(`    ${c.field}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
      }
    }
  }
}

async function updateBug(id: string, status: string, fixCommit?: string): Promise<void> {
  const validStatuses = ["new", "seen", "fixed", "invalid", "duplicate"];
  if (!validStatuses.includes(status)) {
    console.error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
    process.exit(1);
  }
  const input: Record<string, string> = { id, status };
  if (fixCommit) input.fixCommit = fixCommit;
  await trpcMutation("updateBug", input);
  console.log(`Bug ${id} updated to ${status}${fixCommit ? ` (commit: ${fixCommit})` : ""}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "list";

  switch (command) {
    case "list":
      await listBugs(args[1]);
      break;
    case "show":
      if (!args[1]) {
        console.error("Usage: npm run bugs -- show <bug-id>");
        process.exit(1);
      }
      await showBug(args[1]);
      break;
    case "update":
      if (!args[1] || !args[2]) {
        console.error("Usage: npm run bugs -- update <bug-id> <status> [fix-commit]");
        process.exit(1);
      }
      await updateBug(args[1], args[2], args[3]);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Commands: list [status], show <id>, update <id> <status> [commit]");
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  if (err instanceof ApiError) {
    console.error(`API error (HTTP ${err.status}): ${err.body}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
