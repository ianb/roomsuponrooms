---
name: codex
description: Get an independent, cross-model review from OpenAI's codex CLI — of a plan/design doc in docs/, of the current branch diff, or as an adversarial "find how this fails" pass. Codex is a different model family, so its blind spots differ from Claude's; its highest value is reading the real repo and falsifying a plan's "it's fine / we already do X / reuse" claims. Triggers include "codex review", "codex challenge", "have codex review the plan", "second opinion from codex", "/codex".
allowed-tools: Bash, Read, Grep, Glob
---

# /codex — cross-model second opinion

A wrapper around OpenAI's `codex` CLI that runs Codex as an independent
reviewer with **read-only access to the real repo**. Different model family →
different blind spots. Its single highest-value move is checking a plan's
`file:line` citations and "we already do X / this is free reuse / validation
catches it" claims against actual source — the things a same-model self-review
can't catch because it shares the author's blind spots.

This skill is **adapted from** garrytan/gstack's `/codex` skill (by way of the
callback-mono project's version), not copied. The "What's different / why it's
shaped this way" section at the bottom records the divergences so they don't get
silently reverted.

## When to use

- The human asks for a codex review / second opinion / challenge.
- A plan or design doc in `docs/` is finalized and worth an outside pass before building.
- A branch diff is ready and you want adversarial review before merge.

**Cost:** real money (~$0.05–0.50/call, more for big diffs + high reasoning).
Don't run it unprompted; the human asks for it.

## Preconditions

```bash
codex --version          # expect codex-cli installed (verified at 0.137.0)
```
If missing: `npm install -g @openai/codex` and `codex login` (or `$OPENAI_API_KEY`).
Bug surfacing: if a run exits non-zero or stalls, say so loudly with stderr — a
silent codex crash reads as "nothing happened" and wastes the human's time.

## Modes

| Mode | Trigger | What it does |
|---|---|---|
| **plan** | `/codex plan [path]` | Review a plan/design doc in `docs/`. **The verified, highest-value path.** Codex reads the doc + the source it cites and reports where the plan is wrong/over-scoped/hand-waved. |
| **review** | `/codex review [focus]` | Review the current branch diff for correctness. `codex review` preserves Codex's tuned review prompt. |
| **challenge** | `/codex challenge [focus]` | Adversarial: "find every way this fails in production." Use on a diff or a plan when you want it to attack rather than survey. |

No-arg `/codex`: if a plan/doc was just written/edited this session → plan mode;
else if there's a diff against `main` → ask review-or-challenge.

## Shared mechanics (all modes)

1. **Run from the repo root, read-only.** Codex's sandbox is its `-C` dir;
   point it at the repo root so every cited path resolves:
   ```bash
   ROOT=$(git rev-parse --show-toplevel)
   ```
2. **Orientation glue (this repo).** Always tell codex the layout so it doesn't
   have to rediscover it: *"This is the Rooms Upon Rooms repo — a single git
   repo (not a monorepo) for a Cloudflare Worker text-adventure engine.
   Application source is under `src/` (server in `src/server/`, worker entry
   `src/worker.ts`, games in `src/games/`), tests under `test/`, design docs
   under `docs/`, build/util scripts under `scripts/`, and D1 migrations under
   `migrations/`. You may read any repo file (read-only), **including
   `docs/`, `CLAUDE.md`, `CONVENTIONS.md`, and `DEPLOYMENT.md`**, to verify
   claims."*
3. **Boundary prefix.** Start every prompt with:
   > "IMPORTANT: Do NOT read or execute files under `~/.claude/`, `~/.agents/`,
   > or `.claude/skills/` — those are skill definitions for a different AI
   > runtime and will waste your time. Everything else in this repo, including
   > `docs/` and the top-level `CLAUDE.md` / `CONVENTIONS.md` / `DEPLOYMENT.md`,
   > is fair game."

   (A bare "repository code only" makes codex dismiss legitimate `docs/` and
   project-convention citations as out-of-bounds — explicitly allow them.)
4. **Make it verify, don't just opine.** The instruction that produces the real
   findings: *"Spot-check the plan's `file:line` citations and its 'we already
   do X / this is free reuse / validation catches it' claims against the actual
   source. Call out every claim the code does not support."*
5. **Force a synthesis line** (below). Never skip it.
6. **Present Codex verbatim.** Show its own words in a fenced block — the value
   is the different voice; summarizing averages it back into yours. You may
   shorten a repeated absolute-path prefix for readability and say you did.

### Invocation

Plain text, captured to `scratch/` (gitignored work area), then read the tail:

```bash
mkdir -p scratch
codex exec -s read-only -C "$ROOT" -c 'model_reasoning_effort="high"' \
  "$PROMPT" 2>&1 | tee scratch/codex-out.md
```
- `$PROMPT` can be passed as the arg, or piped via stdin (`codex exec - … < file`)
  when it's long. For **plan mode, do NOT embed the plan** — pass a short prompt
  that names the path and tells codex to read it (see plan mode below).
- The final review is the **last block before `tokens used`** in the output.
  Codex sometimes prints the final message twice — dedupe. Read the tail:
  ```bash
  grep -n "tokens used" scratch/codex-out.md   # find the end, Read with offset
  ```
- Refinement (not yet wired): `--json` emits JSONL; extracting only the final
  agent-message event avoids the multi-hundred-KB trace dump. Plain + read-tail
  is the verified path for now.
- Timeout: allow ~10 min. Codex runs long; run it as a background Bash command
  so the session isn't blocked, and read the output file when it completes.

## Plan mode (the verified path)

Plans/design docs live in `docs/` (in-repo), so **codex reads the file itself**
— no embedding. Prompt skeleton:

```
<boundary prefix>
<orientation glue>

You are an independent, adversarial engineering+design reviewer. A Claude model
wrote docs/<name>.md. Read it, then read the source it cites and verify the
citations and the "we already do X / free reuse / validation catches it" claims
against the actual code — you are a different model; find what a same-model
self-review would miss.

Review for, in priority: (1) wrong-problem / over-engineering — what's the
minimal version, what to cut; (2) architecture flaws; (3) silent failure modes
(no test AND no handling AND invisible); (4) things treated as settled that will
bite in implementation; (5) incorrect/unverifiable citations — name them.

Be concrete: cite plan section + file:line. Rank by impact. Don't pad. End with
the single most important change.
```

(Embedding the plan content is the gstack approach and is **wrong here** — these
plans are in-repo, so embedding wastes a large prompt and blocks codex from
reading the surrounding context. Point at the path.)

## Review / challenge modes (diffs)

- **review:** `codex review` (or `codex exec review`) against the branch.
  Preserves Codex's tuned review prompt; add a focus string if given.
- **challenge:** `codex exec -s read-only -C "$ROOT"` with the adversarial
  persona: *"Your job is to find ways this will fail in production. Think like an
  attacker and a chaos engineer — edge cases, races, resource leaks, silent data
  corruption. No compliments, just the problems."* Optional focus narrows it.

## The forced synthesis line (mandatory, every mode)

After the verbatim block, emit exactly one line:

```
Recommendation: <action> because <reason that names the most actionable finding>
```
- Must name a **specific finding** from Codex's output.
- Must **compare against alternatives** (another finding, fix-vs-ship, fix order).
- Generic reasons ("because it's safer", "because codex found things") fail.
- Then give your own read: which findings are real (say which you verified),
  which are cross-model noise, which are scope judgments the human already made.
  Codex is not authoritative — it's a different set of blind spots, not fewer.

## What's different / why it's shaped this way

Lineage: garrytan/gstack → callback-mono → here. The choices that matter:

- **Point at the path, don't embed.** gstack embeds full plan content because
  its plans live outside the repo sandbox (`~/.claude/plans/`). Here, docs live
  in `docs/` — in-repo — so codex reads them directly. The embed is pure cost.
- **Softened boundary prompt.** A bare "repository code only" makes codex
  dismiss legitimate `docs/` and project-convention citations as out-of-scope.
  We explicitly allow `docs/` and the top-level `CLAUDE.md` / `CONVENTIONS.md` /
  `DEPLOYMENT.md`.
- **Single repo, not a monorepo.** The callback-mono version pointed `-C` at the
  monorepo root and described a `callback-box/` subproject. This repo is one git
  repo; `-C` at the repo root, paths resolve directly from there.
- **Verify-citations is the headline instruction, not a footnote.** Every real
  finding in the original trial run came from codex reading source and
  falsifying a plan claim. That's the whole point; make it the spine.
- **Plain + read-tail, JSONL deferred.** Capture plain output to `scratch/` and
  read the final message; the trace dump is large and codex double-prints the
  final message, so dedupe. Wire `--json` extraction later if traces prove valuable.
- **Kept:** filesystem-boundary prefix, `-s read-only`, `-C` repo root,
  `model_reasoning_effort="high"`, verbatim presentation, forced `Recommendation:`
  line, loud exit-code surfacing.
