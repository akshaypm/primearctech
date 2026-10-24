import type { Metadata } from "next";
import { NetworkExperience } from "./NetworkExperience";

export const metadata: Metadata = {
  title: "The Network",
  description: "We build AI systems that complete real work.",
  robots: { index: false, follow: false },
};

export default function NetworkRoute() {
  return (
    <>
      <link rel="preload" as="image" href="/network/poster/hero-1920.avif" type="image/avif" media="(min-width: 761px)" />
      <link rel="preload" as="image" href="/network/poster/hero-828.avif" type="image/avif" media="(max-width: 760px)" />
      <script dangerouslySetInnerHTML={{ __html: "window.__boot=window.__boot||{firstPaint:performance.now()}" }} />
      <NetworkExperience />
    </>
  );
}
