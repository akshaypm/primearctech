"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full document navigation avoids the production vinext prefetch failure. */

import Image from "next/image";
import { BUSINESS_CONTACT } from "@/lib/contact";
import { ArrowRight, Check, ShieldCheck } from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { SiteBackground } from "./three/SiteBackground";

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 26 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: reduce ? 0 : 0.72, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function StudioNav() {
  return (
    <nav className="studio-nav studio-shell" aria-label="Primary navigation">
      <a href="/" className="studio-wordmark" aria-label="PrimeArcTech home">
        <strong>PrimeArc</strong><span>Tech</span>
      </a>
      <div className="studio-nav-links">
        <a href="#studio">Studio</a>
        <a href="/fieldrelay" target="_blank" rel="noreferrer">Product</a>
        <a href="#method">Method</a>
        <a href="/about">About</a>
      </div>
      <a href="/build-brief" className="studio-nav-cta">Get free AI audit <ArrowRight aria-hidden="true" /></a>
    </nav>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  return (
    <header className="studio-hero studio-hero-3d" ref={ref}>
      <div className="studio-hero-scrim" aria-hidden="true" />
      <StudioNav />
      <motion.div
        className="studio-shell studio-hero-copy"
        style={reduce ? undefined : { y: copyY, opacity: copyOpacity }}
      >
        <motion.p
          className="studio-eyebrow studio-hero-status"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="studio-status-dot" aria-hidden="true" />
          Founder-led applied AI studio
        </motion.p>
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          We build AI systems that complete real work.
        </motion.h1>
        <div className="studio-hero-bottom">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            PrimeArcTech turns costly workflows into production systems, then proves the craft through products like FieldRelay.
          </motion.p>
          <motion.div
            className="studio-actions"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <a href="/build-brief" className="studio-button">Get free AI audit <ArrowRight aria-hidden="true" /></a>
            <a href="/fieldrelay" target="_blank" rel="noreferrer" className="studio-link">See FieldRelay</a>
          </motion.div>
        </div>
      </motion.div>
      <div className="studio-hero-cue" aria-hidden="true">
        <span>Live system map</span>
        <i />
      </div>
    </header>
  );
}

const situations = [
  {
    id: "workflow",
    button: "A workflow consumes too much human time",
    title: "Build an AI workflow system.",
    body: "Map the decision, tools, exceptions, and human owner before writing production code.",
    scope: "Workflow map, smallest useful loop, operating boundaries",
  },
  {
    id: "product",
    button: "You have an AI product idea, not a build plan",
    title: "Shape and prove the core product loop.",
    body: "Test model behavior and user value before the roadmap becomes expensive.",
    scope: "Product thesis, prototype direction, evaluation plan",
  },
  {
    id: "production",
    button: "Your prototype works only in the demo",
    title: "Harden it for real operation.",
    body: "Add policies, evaluations, failure paths, monitoring, and human handoff.",
    scope: "Production architecture, risk controls, launch decision",
  },
] as const;

function SituationSelector() {
  const [selected, setSelected] = useState<(typeof situations)[number]["id"]>("workflow");
  const active = situations.find((item) => item.id === selected) ?? situations[0];
  const reduce = useReducedMotion();

  return (
    <section className="studio-router" id="studio">
      <div className="studio-shell studio-router-shell">
        <Reveal className="studio-router-heading">
          <h2>Choose the problem you actually have.</h2>
          <p>One consequential system, scoped tightly enough to prove.</p>
        </Reveal>
        <div className="studio-router-grid">
          <div className="studio-router-options" role="list" aria-label="Reasons to work with PrimeArcTech">
            {situations.map((item) => (
              <button
                key={item.id}
                type="button"
                className={selected === item.id ? "is-active" : ""}
                onClick={() => setSelected(item.id)}
                aria-pressed={selected === item.id}
              >
                <span>{item.button}</span>
                <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="studio-router-answer">
            <Image src="/primearc-studio/02-studio-lab.webp" alt="Technical studio materials and a physical system prototype" fill sizes="(max-width: 767px) 100vw, 48vw" />
            <div className="studio-router-scrim" aria-hidden="true" />
            <motion.div
              key={active.id}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.35 }}
            >
              <span>Recommended direction</span>
              <h3>{active.title}</h3>
              <p>{active.body}</p>
              <dl><dt>First scope</dt><dd>{active.scope}</dd></dl>
              <a href="/build-brief">Get free AI audit <ArrowRight aria-hidden="true" /></a>
            </motion.div>
          </div>
        </div>
        <p className="studio-router-boundary">Not a fit: generic content production, staff augmentation, or automation without an accountable owner.</p>
      </div>
    </section>
  );
}

function ProductProof() {
  return (
    <section className="studio-proof-product" id="product">
      <div className="studio-shell">
        <Reveal className="studio-proof-product-heading">
          <p className="studio-label">Owned product</p>
          <h2>Our proof talks back.</h2>
          <p>FieldRelay is a working voice product, not a portfolio mockup.</p>
        </Reveal>
        <div className="studio-proof-product-stage">
          <div className="studio-proof-product-media">
            <Image
              src="/primearc-studio/03-fieldrelay.webp"
              alt="FieldRelay voice interface with a live transcript and dispatcher receipt"
              fill
              sizes="(max-width: 767px) 100vw, 72vw"
            />
          </div>
          <Reveal className="studio-proof-product-console" delay={0.08}>
            <div><strong>FieldRelay</strong><span>by PrimeArcTech</span></div>
            <p>Challenge the agent. Interrupt it. Push for a price. Watch the policy decisions and receipt.</p>
            <ul>
              <li><Check aria-hidden="true" /> Real browser voice call</li>
              <li><Check aria-hidden="true" /> Visible transcript</li>
              <li><Check aria-hidden="true" /> Provisional sandbox receipt</li>
            </ul>
            <a href="/fieldrelay/demo" target="_blank" rel="noreferrer" className="studio-button">Try FieldRelay live <ArrowRight aria-hidden="true" /></a>
            <a href="/fieldrelay" target="_blank" rel="noreferrer" className="studio-link">Explore the product</a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const proofArtifacts = [
  ["Architecture map", "Models, tools, data, people, failure paths"],
  ["Boundary policy", "Allowed actions, refusals, human handoff"],
  ["Adversarial test", "Edge cases, prompt attacks, unsafe requests"],
  ["Operator receipt", "What happened and what a person does next"],
] as const;

function ProofStandard() {
  return (
    <section className="studio-proof-standard">
      <div className="studio-shell studio-proof-standard-grid">
        <div className="studio-proof-standard-media">
          <Image src="/primearc-studio/05-evidence.webp" alt="Architecture, boundary, testing, and failure documents arranged as system evidence" fill sizes="(max-width: 767px) 100vw, 52vw" />
        </div>
        <Reveal className="studio-proof-standard-copy">
          <h2>What makes the system trustworthy?</h2>
          <div className="studio-artifact-grid">
            {proofArtifacts.map(([title, body]) => (
              <div key={title}><ShieldCheck aria-hidden="true" /><strong>{title}</strong><span>{body}</span></div>
            ))}
          </div>
          <a href="/fieldrelay-architecture-brief.pdf" target="_blank" rel="noreferrer" className="studio-link">View an architecture brief <ArrowRight aria-hidden="true" /></a>
        </Reveal>
      </div>
    </section>
  );
}

const auditOutputs = [
  "Best opportunity worth automating",
  "Smallest useful system scope",
  "Key risks and human controls",
  "Build, buy, narrow, or stop recommendation",
] as const;

function AuditOffer() {
  return (
    <section className="studio-offer" id="engagement">
      <div className="studio-shell studio-offer-grid">
        <Reveal className="studio-offer-copy">
          <p className="studio-label">Free AI Workflow Audit</p>
          <h2>Find where AI can do useful work.</h2>
          <p>Show us one repeated, expensive, or error-prone workflow. We return the strongest opportunity and next sensible move.</p>
          <div className="studio-audit-note"><strong>Free</strong><span>Direct review<br />No sales sequence</span></div>
          <a href="/build-brief" className="studio-button">Get free AI audit <ArrowRight aria-hidden="true" /></a>
        </Reveal>
        <div className="studio-offer-sheet">
          <Image src="/primearc-studio/08-brief.webp" alt="A mineral-white technical workflow audit sheet on a dark work surface" fill sizes="(max-width: 767px) 100vw, 55vw" />
          <div className="studio-offer-sheet-copy">
            <h3>Your audit covers</h3>
            <ul>{auditOutputs.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}</ul>
            <p>No complete architecture. No revenue promise. No obligation to build. If an existing tool solves it, we say so.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const delivery = [
  ["Frame", "Choose one valuable loop"],
  ["Prototype", "Prove the core behavior"],
  ["Test", "Attack failures and boundaries"],
  ["Ship", "Deploy with clear ownership"],
  ["Monitor", "Review behavior and improve"],
] as const;

function DeliveryRail() {
  return (
    <section className="studio-delivery" id="method">
      <div className="studio-delivery-media"><Image src="/primearc-studio/06-process.webp" alt="A folded technical dossier showing a system moving from question to operating decision" fill sizes="100vw" /></div>
      <div className="studio-delivery-scrim" aria-hidden="true" />
      <div className="studio-shell studio-delivery-shell">
        <Reveal className="studio-delivery-heading">
          <h2>From workflow to operating system.</h2>
          <p>Direct delivery, visible artifacts, human controls, and one accountable builder.</p>
        </Reveal>
        <div className="studio-delivery-rail">
          {delivery.map(([title, body], index) => (
            <Reveal key={title} className="studio-delivery-stop" delay={index * 0.06}>
              <span>{index + 1}</span><strong>{title}</strong><p>{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="studio-close">
      <div className="studio-shell studio-close-shell">
        <Reveal>
          <h2>Bring one expensive workflow.</h2>
          <p>Get a direct fit decision, likely first scope, key risks, and the next sensible move.</p>
          <a href="/build-brief" className="studio-button">Get free AI audit <ArrowRight aria-hidden="true" /></a>
          <small>Free fit assessment. No automated sales sequence.</small>
        </Reveal>
      </div>
      <footer className="studio-footer studio-shell">
        <a href="/" className="studio-wordmark"><strong>PrimeArc</strong><span>Tech</span></a>
        <div><a href="#studio">Studio</a><a href="/fieldrelay" target="_blank" rel="noreferrer">FieldRelay</a><a href={`mailto:${BUSINESS_CONTACT.email}`}>Email</a><a href={BUSINESS_CONTACT.whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a><a href="/security">Security</a><a href="/about">About</a><a href="/privacy">Privacy</a></div>
        <p><a href={`tel:${BUSINESS_CONTACT.phoneHref}`}>{BUSINESS_CONTACT.phoneDisplay}</a><br />{BUSINESS_CONTACT.location}<br />© {new Date().getFullYear()} PrimeArcTech.</p>
      </footer>
    </section>
  );
}

export function PrimeArcPage() {
  return (
    <main className="studio-page studio-immersive">
      <SiteBackground intensity={1.05} />
      <div className="studio-immersive-content">
        <Hero />
        <SituationSelector />
        <ProductProof />
        <ProofStandard />
        <AuditOffer />
        <DeliveryRail />
        <Closing />
      </div>
    </main>
  );
}
