# Website Engineering Contract

## Source of truth

- Approved design and DESIGN.md define the intended appearance. Preserve working functionality. Never replace approved assets with generic placeholders.

## Implementation

- Inspect existing components and conventions first. Focused, maintainable changes. Prefer existing dependencies and tokens. Don't redesign when the task is implementation. No unrelated refactors.

## Required verification (after any user-facing change)

1. Run build and tests. 2. Start the production build. 3. Open the page in a real browser. 4. Screenshots at 1440px and 390px. 5. Compare with the reference. 6. Fix material mismatches. 7. Check interactions, accessibility basics, console errors, responsive overflow.

## Done means

Build and tests pass, material discrepancies resolved, interactions work, screenshots and changed files supplied, limitations documented. Never claim success without execution evidence. Never deploy to production without approval. After three failed correction cycles on one issue, stop and write a root-cause note.

## How to run

Node `>=22.13.0` (`engines` in `package.json`). This environment is Node 22.

```bash
npm run dev
npm run build
npx vinext start --host 127.0.0.1 --port 4173
npm test
npm run test:e2e
npm run lint
node scripts/visual-audit.mjs
```

`npm test` runs unit tests, then `npm run build`, then `node --test tests/rendered-html.test.mjs`. `npm run test:e2e` builds and runs Playwright against `http://127.0.0.1:4173` (`playwright.config.ts`). `node scripts/visual-audit.mjs` expects that same production server and checks 390, 768, 1024, 1440, and 1920. Append `?debug=1` to show the WebGL debug overlay.

## Token budget and skill packs

The contract above and the visual-qa skill take precedence over every pack. No pack lowers the verification bar or replaces this file.

- **pstack** (`.cursor/skills/`, models in `.cursor/rules/pstack-models.mdc`): smallest budget, every role `inherit-parent`, single-entry panels, so it adds no model spend beyond the parent chat. Use `/poteto-mode` only for nontrivial multi-step changes. Answer questions and make small edits directly.
- **Ponytail** (`.cursor/skills/ponytail/`): plumbing only (build config, tests, scripts, data/content wiring, utilities). Never use it to simplify or minimise visual craft code: Three.js scenes, shaders, GSAP/ScrollTrigger motion, post-processing, micro-interactions, responsive art direction. Here that is `app/home/**` and the nav, hero and section markup in `app/PrimeArcPage.tsx`. On this site, visual fidelity outranks code size.
- **vercel-react-best-practices** (`.cursor/skills/react-best-practices/`): React/Next.js performance review only — waterfalls, bundles, hydration, re-renders, data fetching. Use it on performance audits and when changing those paths. Its compiled `AGENTS.md` is a rules dump, not this contract. Skip Fluid Compute and other Vercel-hosting advice.
- **web-design-guidelines** (`.cursor/skills/web-design-guidelines/`): interface-guidelines audit only (a11y, focus, forms, motion, images). Use it when asked to audit UX or accessibility. Do not restyle an approved mock to match generic guidelines.
- Sources, versions and local changes: `.cursor/vendor/README.md`.
