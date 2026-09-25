import type { Metadata } from "next";
import Image from "next/image";
import { BuildBriefForm } from "../BuildBriefForm";
import { SiteBackground } from "../three/SiteBackground";
/* eslint-disable @next/next/no-html-link-for-pages -- full document navigation avoids the production vinext prefetch failure. */

export const metadata: Metadata = {
  title: "Free AI Workflow Audit",
  description: "Share one valuable workflow and receive a direct PrimeArcTech opportunity, scope, risk, and next-move review.",
  alternates: { canonical: "/build-brief" },
};

const outcomes = [
  ["Fit decision", "Whether PrimeArcTech is the right builder for this problem."],
  ["First scope", "Smallest useful system worth proving before a larger commitment."],
  ["Risk map", "Critical data, policy, ownership, and failure questions to resolve."],
  ["Next move", "Proceed, narrow the problem, use an existing tool, or stop."],
] as const;

export default function BuildBriefPage() {
  return (
    <main className="studio-page brief-funnel-page studio-immersive">
      <SiteBackground intensity={0.9} />
      <header className="brief-funnel-hero">
        <Image src="/primearc-studio/08-brief.webp" alt="Blank technical workflow audit sheet on a dark work surface" fill priority sizes="100vw" />
        <div className="brief-funnel-scrim" aria-hidden="true" />
        <nav className="brief-funnel-nav studio-shell" aria-label="AI workflow audit navigation">
          <a href="/" className="studio-wordmark" aria-label="PrimeArcTech home"><strong>PrimeArc</strong><span>Tech</span></a>
          <a href="/">Back to studio</a>
        </nav>
        <div className="studio-shell brief-funnel-grid">
          <section className="brief-funnel-copy">
            <p className="studio-label">Free AI Workflow Audit</p>
            <h1>Show us one workflow worth fixing.</h1>
            <p>Receive the strongest AI opportunity, smallest useful scope, key risks, and next sensible move.</p>
          </section>
          <section className="studio-brief-panel brief-funnel-form" aria-label="AI workflow audit request form">
            <div className="brief-form-intro">
              <strong>Request your free audit</strong>
              <span>About three minutes. No technical specification needed.</span>
            </div>
            <BuildBriefForm source="build-brief-page" successRedirect="/build-brief/received" />
            <p className="brief-form-legal"><a href="/privacy">Privacy</a><a href="/security">Security</a></p>
          </section>
          <dl className="brief-outcomes">
            {outcomes.map(([title, description]) => <div key={title}><dt>{title}</dt><dd>{description}</dd></div>)}
          </dl>
        </div>
      </header>
      <section className="brief-funnel-explain">
        <div className="studio-shell brief-funnel-explain-grid">
          <div><p className="studio-label">What this is</p><h2>A direct opportunity review.</h2><p>Enough analysis to identify the best AI use case, likely scope, risks, and next move.</p></div>
          <div><p className="studio-label">What this is not</p><h2>Free consulting theatre.</h2><p>No complete architecture, automated proposal, revenue promise, or commitment to build.</p></div>
        </div>
      </section>
    </main>
  );
}
