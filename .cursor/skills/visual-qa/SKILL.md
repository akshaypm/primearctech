---
name: visual-qa
description: Prove a PrimeArcTech UI change against the approved frames. Use after design-to-code to capture 1440 and 390 production screenshots, compare them, score hero motion, and record console errors.
---

# Visual QA

## When to invoke

After a user-facing homepage change, before calling the work done. Also when the task asks for before/after evidence.

## Inputs

- Production build of the branch.
- Approved references at desktop and mobile.
- Routes and viewports. Homepage checks use `/` at 1440×900 and 390×844.

## Tools

- `npm test` and `npm run build`.
- Production server: `npx vinext start --host 127.0.0.1 --port 4173`.
- Playwright (`playwright.config.ts`) or a Playwright script. Chromium needs SwiftShader in this environment: `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- `?debug=1` shows `.pa-debug` (hero mode, fps, renderer). Use it to confirm the Arc is `live`, not `still`. Do not leave the overlay in approval screenshots.
- `node scripts/visual-audit.mjs` for overflow across 390, 768, 1024, 1440, and 1920 when the task is site-wide.
- Frame-diff: grab two or more PNG frames, then mean absolute RGB difference. A live Arc at idle should score above a static still.

## Preconditions

- `dist/` is from the commit being judged.
- Nothing else is bound in a way that serves a stale `dist` on port 4173. Restart the server after every build.
- References are the approved frames, not an earlier capture of this branch.

## Steps

1. Run `npm test`. Save the output.
2. Start `npx vinext start --host 127.0.0.1 --port 4173`.
3. Open `/` in Chromium at 1440×900 and 390×844. Record console and page errors.
4. Screenshot the hero. For a before/after task, keep both.
5. Build side-by-side images against the reference.
6. With `?debug=1`, confirm `hero live`. Then record about 10 seconds of idle or scroll with the Arc in frame. Score motion: mean absolute per-pixel RGB delta between consecutive frames, averaged over the clip. Report that number.
7. Check hover and focus on the nav and hero CTA, and that 390 does not overflow horizontally.
8. Fix material mismatches and repeat from step 1. Stop after three failed cycles on one issue and write the root cause.

## Acceptance criteria

- Build and tests pass.
- 1440 and 390 shots exist from the production server.
- Side-by-side comparison has no unresolved material mismatch in the scoped section, or the remainder is listed.
- Motion score shows the Arc is moving when the mode is live.
- Console error list is included, or the list is empty.
- Changed files and limitations are written down.

## Failure handling

- If the hero stays on the still image, read `.pa-debug`. `webgl-unavailable` or `webgl-context-failed` means the capture browser has no WebGL. Relaunch Chromium with SwiftShader before judging motion.
- If the motion score is about 0 while debug says `live`, the camera is static and idle yaw is not applied. Fix that in `arc-scene.ts` and reshoot.
- If screenshots disagree with the server you built, the process on 4173 is stale. Restart it.

## Outputs

- Screenshots, side-by-sides, motion clip, motion score, test log, console list, changed-file list, remaining discrepancies.

## Approval

- Do not deploy. Do not merge. Evidence is not a request to ship.
