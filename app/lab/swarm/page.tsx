import type { Metadata } from "next";
import { SwarmExperience } from "./SwarmExperience";

export const metadata: Metadata = {
  title: "The Swarm",
  description: "Prototype. PrimeArc's agents as one creature of dark steel shards.",
  robots: { index: false, follow: false },
};

export default function SwarmRoute() {
  return <SwarmExperience />;
}
