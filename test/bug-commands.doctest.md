# Bug Commands

Tests for the bug reporting context collection and submission.

```ts setup
import { setStorage } from "../src/server/storage-instance.js";
import { collectBugContext, submitBugReport } from "../src/server/bug-commands.js";
import type { BugPreview } from "../src/server/bug-commands.js";
import type { BugReport } from "../src/server/storage.js";
import { testWorld } from "./helpers.js";

// In-memory storage for testing
let savedBugs: BugReport[] = [];
let eventLog: Array<{ command: string; events: any[]; timestamp: string }> = [];

setStorage({
  loadEvents: async () => eventLog,
  appendEvent: async (_s: any, entry: any) => { eventLog.push(entry); },
  clearEvents: async () => { eventLog = []; },
  popEvent: async () => null,
  saveBugReport: async (report: BugReport) => { savedBugs.push(report); },
  listBugReports: async () => savedBugs,
  getBugReport: async (id: string) => savedBugs.find((b) => b.id === id) || null,
  updateBugReport: async () => {},
  // Stubs for unused methods
  loadAiEntities: async () => [],
  saveAiEntity: async () => {},
  getAiEntityIds: async () => new Set(),
  removeAiEntity: async () => false,
  loadAiHandlers: async () => [],
  saveHandler: async () => {},
  listHandlers: async () => [],
  removeHandler: async () => false,
  loadConversationEntries: async () => [],
  saveWordEntry: async () => {},
  findUserByGoogleId: async () => null,
  findUserById: async () => null,
  findUserByName: async () => null,
  hasAnyUsers: async () => false,
  createUser: async () => {},
  updateLastLogin: async () => {},
  recordAiUsage: async () => {},
  countAiUsage: async () => 0,
} as any);
```

## Collecting bug context

The context includes the player's current room and recent commands.

```
savedBugs = [];
eventLog = [
  { command: "look", events: [], timestamp: "2026-04-03T10:00:00Z" },
  { command: "take nuts", events: [{ type: "set-property", entityId: "item:nuts", property: "location", value: "player:1", description: "Took nuts" }], timestamp: "2026-04-03T10:01:00Z" },
];

const game = testWorld();
const session = { gameId: "test", userId: "user:1" };
const preview = await collectBugContext(game.runner, { session, userName: "TestUser", description: "nuts are broken" });

preview.description
=> nuts are broken
```

```continue
preview.userName
=> TestUser
```

```continue
preview.gameId
=> test
```

```continue
// Room should be detected from the player entity
preview.roomName !== null
=> true
```

```continue
// Should include recent commands
preview.recentCommands.length
=> 2
```

```continue
preview.recentCommands[0].command
=> look
```

## Submitting a bug report

```
savedBugs = [];
const submitted = await submitBugReport({
  description: "test bug",
  gameId: "test",
  userId: "user:1",
  userName: "Tester",
  roomId: "room:1",
  roomName: "Test Room",
  recentCommands: [],
  entityChanges: [],
});

// ID should have b- prefix
submitted.id.startsWith("b-")
=> true
```

```continue
submitted.status
=> new
```

```continue
submitted.description
=> test bug
```

```continue
// Should be saved to storage
savedBugs.length
=> 1
```

```continue
savedBugs[0].id === submitted.id
=> true
```

## Entity change detection

When entities have been modified from their initial state, the changes are detected.

```
const game2 = testWorld();
game2.runner.store.snapshot();

// Modify an entity
const players = game2.runner.store.findByTag("player");
const player = players[0];
game2.runner.store.setProperty(player.id, { name: "name", value: "Modified Player" });

eventLog = [];
const preview2 = await collectBugContext(game2.runner, {
  session: { gameId: "test", userId: "user:2" },
  userName: null,
  description: "something changed",
});

// Should detect the name change
preview2.entityChanges.length > 0
=> true
```

```continue
const playerChange = preview2.entityChanges.find((ec: any) => ec.id === player.id);
playerChange !== undefined
=> true
```

```continue
const nameChange = playerChange.changes.find((c: any) => c.field === "name");
nameChange.to
=> Modified Player
```
