export const journeyCopy = {
  brand: "PrimeArcTech",
  h1: "We build AI systems that complete real work.",
  lede: "We design and build AI workflows, products, and the engineering needed to run them reliably.",
  primaryCta: { label: "Get free AI audit", href: "/build-brief" },
  secondaryCta: { label: "Explore the work", href: "#proof" },
  chapters: {
    input: {
      id: "input",
      anchor: "hero",
      kicker: "Input",
      labels: ["Requests", "Knowledge", "Tools"],
    },
    assembly: {
      id: "assembly",
      anchor: "engagements",
      kicker: "Engagements",
      title: "Three service areas.",
      sentence: "Workflow systems, AI products, and production engineering.",
      services: [
        {
          title: "Workflow systems",
          deliverables: ["Workflow map", "Tool actions", "Exception handling"],
        },
        {
          title: "AI products",
          deliverables: ["Useful product loop", "User interface", "Model evaluation"],
        },
        {
          title: "Production engineering",
          deliverables: ["Tests", "Permissions", "Monitoring", "Human fallback"],
        },
      ],
    },
    operation: {
      id: "operation",
      anchor: "how",
      kicker: "Operation",
      title: "How a system becomes operable.",
      sentence: "Understand the workflow. Build the smallest useful loop. Test failures. Hand over operating evidence.",
      steps: [
        "Understand the workflow",
        "Build the smallest useful loop",
        "Test failures",
        "Hand over operating evidence",
      ],
    },
  },
} as const;

export const journeyPosters = {
  input: {
    desktop: "/primearc/journey/input-desktop.webp",
    mobile: "/primearc/journey/input-mobile.webp",
  },
  assembly: {
    desktop: "/primearc/journey/assembly-desktop.webp",
    mobile: "/primearc/journey/assembly-mobile.webp",
  },
  operation: {
    desktop: "/primearc/journey/operation-desktop.webp",
    mobile: "/primearc/journey/operation-mobile.webp",
  },
} as const;
