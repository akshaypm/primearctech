import type { Metadata } from "next";
import { NetworkExperience } from "./NetworkExperience";

export const metadata: Metadata = {
  title: "The Network",
  description: "Prototype. A continuous clay world, from the ground to the horizon.",
  robots: { index: false, follow: false },
};

export default function NetworkRoute() {
  return <NetworkExperience />;
}
