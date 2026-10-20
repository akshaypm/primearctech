import { describe, expect, it } from "vitest";
import { journeyCopy } from "@/app/home/journey/content";

describe("journeyCopy", () => {
  it("uses the approved parent promise and the audit CTA", () => {
    expect(journeyCopy.h1).toBe("We build AI systems that complete real work.");
    expect(journeyCopy.lede).toBe(
      "We design and build AI workflows, products, and the engineering needed to run them reliably.",
    );
    expect(journeyCopy.primaryCta).toEqual({ label: "Get free AI audit", href: "/build-brief" });
    expect(journeyCopy.secondaryCta).toEqual({ label: "Explore the work", href: "#proof" });
  });

  it("names the three services and the operating method without a duration promise", () => {
    expect(journeyCopy.chapters.assembly.services.map((service) => service.title)).toEqual([
      "Workflow systems",
      "AI products",
      "Production engineering",
    ]);
    expect(journeyCopy.chapters.assembly.services[0].deliverables).toEqual([
      "Workflow map",
      "Tool actions",
      "Exception handling",
    ]);
    expect(journeyCopy.chapters.assembly.services[1].deliverables).toEqual([
      "Useful product loop",
      "User interface",
      "Model evaluation",
    ]);
    expect(journeyCopy.chapters.assembly.services[2].deliverables).toEqual([
      "Tests",
      "Permissions",
      "Monitoring",
      "Human fallback",
    ]);
    expect(journeyCopy.chapters.operation.steps).toEqual([
      "Understand the workflow",
      "Build the smallest useful loop",
      "Test failures",
      "Hand over operating evidence",
    ]);
    expect(journeyCopy.chapters.input.anchor).toBe("hero");
    expect(journeyCopy.chapters.assembly.anchor).toBe("engagements");
    expect(journeyCopy.chapters.operation.anchor).toBe("how");
  });

  it("rejects public placeholders, prices, and invented proof", () => {
    const blob = JSON.stringify(journeyCopy);
    expect(blob).not.toMatch(/placeholder|\$10K|\$1,500|illustrative client|\bweeks\b|\bNDA\b|scarcity/i);
    expect(blob).not.toMatch(/Book a call with an engineer|Book a 30-minute call/);
  });
});
