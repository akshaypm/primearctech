---
name: design-to-code
description: Implement an approved PrimeArcTech frame in the existing homepage. Use after project-discovery when nav, hero, or a named section must match a reference without a redesign.
---

# Design to code

## When to invoke

After project-discovery, when an approved screenshot must be implemented in the current homepage components.

## Inputs

- Discovery note (files in scope, tokens, mismatches).
- Approved frames at 1440 and 390.
- Existing components only. Do not add a second hero or a new design system.

## Tools

- `app/PrimeArcPage.tsx` and `app/home/home.css` for type, nav, and chrome.
- `app/home/arc-scene.ts` for Arc camera, idle motion, and mobile versus desktop framing.
- CSS variables already on `.pa`. Playwright is for later visual-qa, not for inventing layout.

## Preconditions

- Discovery is done.
- A production `before` screenshot exists, or the current code is about to be captured before edits.
- Edits stay inside the named section and the header that belongs to it.

## Steps

1. Match type scale, weight, tracking, and line breaks to the reference. Desktop hero headline breaks after "features,". Mobile hero headline breaks as "AI features," / "from demo" / "to production."
2. Match nav geometry: wordmark left, primary links centered, "Book a call" right. At 390 the bar is wordmark and "Book a call" only, as in the approved mobile frame.
3. Give nav links and both hero CTAs a hover state and a `:focus-visible` ring using `--sig`.
4. Frame the Arc so it fills the right side at 1440 (right edge cropped, left foot clear of the headline) and the top band at 390 (sides cropped, headline below the mesh).
5. Keep one orange fin band. Do not restyle other sections.
6. Preserve bundle strings covered by `tests/rendered-html.test.mjs`.

## Acceptance criteria

- At 1440 and 390, type, breaks, spacing, nav, Arc crop, and text-versus-mesh separation match the reference closely enough that a side-by-side does not show a material miss.
- Hover and keyboard focus are visible on the nav and the hero CTAs.
- Other sections are unchanged.

## Failure handling

- If a camera tweak fixes framing but clips the mesh or covers type, revert that tweak and try one smaller change.
- After three failed cycles on the same issue, stop and write the root cause. Do not keep nudging.

## Outputs

- The scoped code change.
- A list of files touched.

## Approval

- No new dependencies. No copy changes beyond line breaks already in the approved frame. No deploy.
