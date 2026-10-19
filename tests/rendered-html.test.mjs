import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { join, resolve } from "node:path";

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectJavaScript(path);
      return entry.name.endsWith(".js") ? readFile(path, "utf8") : "";
    }),
  );
  return chunks.join("\n");
}

test("production bundle contains the PrimeArcTech and FieldRelay conversion pages", async () => {
  const built = await collectJavaScript(resolve("dist", "server"));

  assert.match(built, /Every missed call is already choosing a contractor/);
  assert.match(built, /14-Day Missed-Call Recovery System/);
  assert.match(built, /Get my audit/);
  assert.match(built, /52%/);
  assert.doesNotMatch(built, /SkeletonPreview|codex-preview/);
  assert.match(built, /AI features, from demo to production/);
  assert.match(built, /Free AI Workflow Audit/);
  assert.doesNotMatch(built, /AI System Blueprint Sprint|\$1,500/);
  assert.match(built, /FieldRelay by PrimeArcTech/);
  assert.match(built, /Private pitch sandbox/);
});

test("production output includes every purpose-built section image", async () => {
  const images = [
    "01-hero.webp",
    "02-evidence.webp",
    "03-calculator.webp",
    "04-journey.webp",
    "05-capabilities.webp",
    "06-handoff.webp",
    "07-offer.webp",
    "08-audit.webp",
  ];

  for (const image of images) {
    const details = await stat(resolve("dist", "client", "fieldrelay", image));
    assert.ok(details.size > 20_000, `${image} should be a non-trivial production asset`);
  }

  const socialPreview = await stat(resolve("dist", "client", "og.png"));
  assert.ok(socialPreview.size > 100_000, "social preview should be a purpose-built visual asset");

  for (const image of ["01-hero.webp", "02-problem.webp", "03-product.webp", "04-flow.webp", "05-operations.webp", "06-trust.webp", "07-close.webp"]) {
    const details = await stat(resolve("dist", "client", "primearc", image));
    assert.ok(details.size > 20_000, `${image} should be a non-trivial PrimeArcTech section asset`);
  }

  const primeArcSocial = await stat(resolve("dist", "client", "primearc-social.png"));
  assert.ok(primeArcSocial.size > 500_000, "PrimeArcTech social card should be a bespoke visual asset");
});
