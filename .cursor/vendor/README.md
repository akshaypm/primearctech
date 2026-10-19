# Vendored skill packs

These packs are MIT licensed. Their licenses are kept beside this file. Usage rules and limits for this repo live in `AGENTS.md` under "Token budget and skill packs". The repo-root `AGENTS.md` and the visual-qa skill take precedence over every pack.

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

## vercel-labs/agent-skills (`063bee94c3f4df8453406c830b0a7df0f2860278`)

- Source: https://github.com/vercel-labs/agent-skills, commit `063bee94c3f4df8453406c830b0a7df0f2860278`.
- `skills/react-best-practices` copied into `.cursor/skills/react-best-practices/`, with one local change: a precedence block at the top of `SKILL.md`. The rest is verbatim, including the compiled rules dump at `react-best-practices/AGENTS.md` (that file is not the repo-root contract).
- `skills/web-design-guidelines` copied into `.cursor/skills/web-design-guidelines/`, with the same kind of precedence block on `SKILL.md`. The rest is verbatim. The skill fetches live rules from https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md at review time.
- Not vendored: `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize`, `react-native-skills`, `react-view-transitions`, `composition-patterns`, `writing-guidelines`, and the rest of the repo. Those are deploy-, hosting-, or out-of-scope.
- Skip any Fluid Compute / Vercel-hosting notes that remain inside the copied React rules.
- `LICENSE`: `vercel-agent-skills/LICENSE` (source README declares MIT; the upstream repo has no LICENSE file).
