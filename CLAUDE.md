@CONVENTIONS.md
@DEPLOYMENT.md

## Browser verification (agent-browser)

`agent-browser` is the browser-automation tool for verifying frontend/UI work
by actually rendering and driving the app — not just running tests. Reach for
it when a change touches the client (sidebar panels, mobile layout, the game
view), for exploratory QA, or to dogfood a game world end to end.

It's installed as a Claude Code skill (`.agents/skills/agent-browser/`). On a
fresh machine: `npm i -g agent-browser && agent-browser install`.

**Always load the live workflow first** — it stays synced to the installed
version: `agent-browser skills get core` (add `--full` for the full command
reference). The core loop is `open <url>` → `snapshot -i` (interactive elements
with `@eN` refs) → act on refs (`click`/`fill`/`press`) → re-`snapshot` after
any page change → `screenshot` → `close`. Refs go stale on every page change.

### Driving this app

- **Local dev**: `npm run dev`, then the UI is at `http://localhost:3000`
  (Vite; it proxies `/auth`, `/trpc`, `/api` to Fastify on 3001).
- **Production**: `https://roomsuponrooms.com` (a real running instance — fine
  for read-only smoke tests; never run dev-login against it).

The app requires login. In **local dev only** (no `GOOGLE_CLIENT_ID` set),
there's a one-URL dev login for automation — opening it sets the session cookie
and lands on the home page already signed in:

```bash
agent-browser open "http://localhost:3000/auth/dev-login?name=Tester"
```

The named user is created on first use with all roles (including admin). This
route is gated to dev and does not exist in production.
