---
name: project-discovery
description: Read this repo before a homepage change. Use when starting work on PrimeArcTech pages, nav, hero, or section scenes so the change follows existing components, tokens, and the approved design.
---

# Project discovery

## When to invoke

Before editing the homepage, nav, hero, or a section scene. Also when the task names an approved reference and the current page may already implement part of it.

## Inputs

- The task, including which sections may change.
- Approved references (screenshots, `DESIGN.md`).
- The current branch. Do not switch branches or edit unrelated worktrees.

## Tools

- `package.json` scripts and `engines.node`.
- `DESIGN.md`, `app/PrimeArcPage.tsx`, `app/home/home.css`, `app/home/arc-scene.ts`, `app/home/ArcCanvas.tsx`.
- `playwright.config.ts` (`baseURL` `http://127.0.0.1:4173`, desktop-chromium and mobile-chromium).
- `app/home/v3/DebugHud.tsx` and `debugEnabled()` (`?debug=1`).
- `tests/rendered-html.test.mjs` for strings the production bundle must keep.

## Preconditions

- Working tree is the requested branch.
- Node is `>=22.13.0`.
- Scope is explicit. Sections outside the task stay untouched.

## Steps

1. Read `AGENTS.md`, `DESIGN.md`, and the components that render the named sections.
2. Note tokens in `app/home/home.css` (`--ink`, `--bone`, `--g1`, `--sig`, `--pad`) and the loaded faces (General Sans, IBM Plex Mono).
3. Note how the hero Arc mounts (`ArcCanvas`, `mountArcScene`) and how `?debug=1` reports `hero` mode.
4. Note verification commands: `npm test`, `npm run build`, `npx vinext start --host 127.0.0.1 --port 4173`.
5. List the visible mismatches to fix and the files allowed to change.
6. Stop if the reference or the owning component cannot be found. Do not invent a layout.

## Acceptance criteria

- The report names the files that own the change and the commands that will prove it.
- Out-of-scope sections are listed and left alone.

## Failure handling

- If a required reference file is missing, use the images attached to the task and say so.
- If discovery conflicts with `DESIGN.md`, the approved screenshot for this task wins for the named section. Record the conflict.

## Outputs

- A short discovery note: owners, tokens, mismatches, files in scope, verification commands.

## Approval

- Do not deploy. Do not merge. Ask before changing sections, routes, or copy that the task did not name.
