import type { Metadata } from "next";
import { PrimeArcPage } from "./PrimeArcPage";

export const metadata: Metadata = {
  title: "AI features, from demo to production",
  description:
    "PrimeArcTech is a senior-engineer AI studio. We take AI features from demo to production for B2B software companies in the US and UK.",
  alternates: { canonical: "/" },
};

export default function Home() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PrimeArcTech",
    url: "https://primearc.tech",
    description: "Senior-engineer AI studio taking AI features from demo to production for B2B software companies.",
    knowsAbout: ["Artificial intelligence", "AI product development", "Operational AI systems"],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} /><PrimeArcPage /></>;
}
