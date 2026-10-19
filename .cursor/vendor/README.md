# Vendored skill packs

Both packs are MIT licensed. Their licenses are kept beside this file. Usage rules and limits for this repo live in `AGENTS.md` under "Token budget and skill packs".

## pstack 0.15.28

- Source: https://github.com/cursor/plugins, folder `pstack/`, commit `d457567332aa6989e753ea289f30ea2bfbc80bc0`.
- `pstack/skills/*` copied verbatim into `.cursor/skills/` (56 skills, workspace install).
- `pstack/agents/poteto-agent.md` and `pstack/agents/comment-sicko.md` copied verbatim into `.cursor/agents/`. The `no-comments` skill spawns `comment-sicko`.
- `pstack/.gitignore` copied verbatim to `.cursor/skills/.gitignore`. `poteto-mode/scripts/bootstrap.ts` installs its tools into `poteto-mode/scripts/node_modules`, and the repo root `.gitignore` only covers `/node_modules`.
- Not vendored: `docs/`, `assets/`, the README and the plugin manifests.
- `/setup-pstack` is interactive and writes `~/.cursor/rules/pstack-models.mdc`. Its output for this repo is written by hand as `.cursor/rules/pstack-models.mdc`: budget `small (medium)`, every role `inherit-parent`, and every panel list a single entry.
- `LICENSE`: `pstack/LICENSE`.

## Ponytail 5.3.2

- Source: npm `@dietrichgebert/ponytail@5.3.2` (gitHead `16352ac229eb08a9598dcae48fe9f2b342567d86`). Its `skills/ponytail/` is byte-identical to https://github.com/DietrichGebert/ponytail at `09c434ab73ca43761c5d8b0c5d341926c2fba710`.
- `skills/ponytail/SKILL.md` copied into `.cursor/skills/ponytail/SKILL.md`, with two local changes: a scope limit block at the top, and a description narrowed to plumbing so skill selection respects that limit. The rest of the skill is verbatim.
- Not vendored: the companion skills (`ponytail-review`, `-audit`, `-debt`, `-gain`, `-help`), the hooks, and the always-applied `.cursor/rules/ponytail.mdc`, which would apply Ponytail to every task and override the scope limit.
- `LICENSE`: the package `LICENSE`.
