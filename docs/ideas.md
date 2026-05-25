# Ideas

Running list of things to consider, not commitments.

## Try design-shotgun (from gstack)

Garry Tan's gstack has a `/design-shotgun` skill that generates N visually distinct design mockups (via an image-gen API), opens them side-by-side in a browser comparison board, and lets you rate/comment/remix/pick. Could be fun to try for roomsuponrooms — visual exploration for the game's UI / map rendering / scenery cards / whatever needs a fresh visual take.

Notes on the underlying mechanics: [`~/src/callback/gstack-review/notes/design-shotgun.md`](../../callback/gstack-review/notes/design-shotgun.md).

Two ideas worth absorbing regardless of whether the skill is adopted directly:

- **Concept-before-generation** — generate N text descriptions of design directions first, confirm with the user, THEN spend image-gen credits. Avoids the "regenerate, regenerate" loop.
- **Anti-convergence swap-test** — *"if you could swap the headline text between two variants without noticing, they're too similar."* Operational test for whether N options are actually different vs. minor permutations.

The gstack skill itself depends on a `$D` design binary and a `$B` browse daemon — heavy infrastructure. A lighter local equivalent could use Claude's image generation directly + a simple HTML comparison page opened with `open`.
