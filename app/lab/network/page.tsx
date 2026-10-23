import type { Metadata } from "next";
import { NetworkExperience } from "./NetworkExperience";

export const metadata: Metadata = {
  title: "The Network",
  description: "We build AI systems that complete real work.",
  robots: { index: false, follow: false },
};

export default function NetworkRoute() {
  return <NetworkExperience />;
}
