import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JourneyLab } from "./JourneyLab";

export const metadata: Metadata = {
  title: "Camera journey preview",
  robots: { index: false, follow: false },
};

export default function JourneyPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <JourneyLab />;
}
