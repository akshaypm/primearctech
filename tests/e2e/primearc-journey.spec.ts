import { expect, test } from "@playwright/test";

test("the opening states the parent promise and the audit route", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We build AI systems that complete real work.");
  await expect(page.getByRole("link", { name: "Get free AI audit" })).toHaveAttribute("href", "/build-brief");
  await expect(page.locator("#hero")).toBeVisible();
  await expect(page.locator("#engagements")).toBeVisible();
  await expect(page.locator("#how")).toBeVisible();
  await expect(page.locator("#proof")).toBeVisible();
});
