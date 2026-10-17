"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full document navigation avoids the production vinext prefetch failure. */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import { ArcCanvas } from "./home/ArcCanvas";
import { BUSINESS_CONTACT } from "@/lib/contact";
import { DEMO_SCENARIOS } from "@/lib/demo/scenarios";
import type { DemoScenario } from "@/lib/demo/types";
import "./home/home.css";

const services = [
  ["A — Workflow", "Build an AI workflow system"],
  ["B — Product", "Shape and prove the core product loop"],
  ["C — Production", "Harden it for real operation"],
  ["Studio", "Founder-led, Bangalore"],
] as const;

const situations = [
  {
    id: "workflow",
    index: "A",
    label: "A workflow consumes too much human time",
    title: "Build an AI workflow system.",
    body: "Map the decision, tools, exceptions, and human owner before writing production code.",
    scope: "Workflow map, smallest useful loop, operating boundaries",
  },
  {
    id: "product",
    index: "B",
    label: "You have an AI product idea, not a build plan",
    title: "Shape and prove the core product loop.",
    body: "Test model behavior and user value before the roadmap becomes expensive.",
    scope: "Product thesis, prototype direction, evaluation plan",
  },
  {
    id: "production",
    index: "C",
    label: "Your prototype works only in the demo",
    title: "Harden it for real operation.",
    body: "Add policies, evaluations, failure paths, monitoring, and human handoff.",
    scope: "Production architecture, risk controls, launch decision",
  },
] as const;

const architecture = [
  ["01", "Browser", "Microphone after an explicit click. Public demo recording is off."],
  ["02", "Voice provider", "Audio goes to the configured assistant. A failure is labelled, not presented as success."],
  ["03", "Policy", "An immutable policy decides the route. Prompt text does not replace it."],
  ["04", "Session", "Call id, transcript, decision, and a provisional receipt. Public sessions expire after two hours."],
  ["05", "Human", "A dispatcher confirms anything real. The demo cannot book, dispatch, transfer, or write a CRM."],
] as const;

const allowed = [
  "Capture a routine request inside the configured service area",
  "Hold a provisional arrival window for a dispatcher to confirm",
  "Stop intake and escalate when the caller describes danger",
];

const refused = [
  "Diagnosis or repair instruction",
  "A firm estimate, a service promise, or a confirmed appointment",
  "Routine intake after danger language",
  "A real booking, dispatch, transfer, or CRM write from the demo",
  "A prompt that tries to replace the system policy",
];

const method = [
  ["01", "Frame", "Choose one valuable loop"],
  ["02", "Prototype", "Prove the core behavior"],
  ["03", "Test", "Attack failures and boundaries"],
  ["04", "Ship", "Deploy with clear ownership"],
  ["05", "Monitor", "Review behavior and improve"],
] as const;

const auditOutputs = [
  "Best opportunity worth automating",
  "Smallest useful system scope",
  "Key risks and human controls",
  "Build, buy, narrow, or stop recommendation",
];

const team = [
  {
    name: "Akshay P M",
    role: "Senior IoT Platform Engineer",
    image: "/primearc-studio/people/akshay-head.jpg",
    alt: "Portrait of Akshay P M",
    preview: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/wAALCAAoACABAREA/8QAGQAAAwEBAQAAAAAAAAAAAAAAAwQFAgEA/8QALBAAAgIBAwIDBwUAAAAAAAAAAQIDEQAEEiETMSKB4QUUFTJRYbEjQVJx8P/aAAgBAQAAPwBZxufpKCd1AK3FHMSqRp3Bv5rAxmDWRQOjbTZAsVdn6/QZ6WW9UwhHLEUT3xcOY5U94jkJrwlWqvLGY4JdW8qadCykd/28znJvZ2oE0Ub6eNnVRbKauh+cDKDGzAqUkvm748sI8Jtd9MvI44rLfs9PdoIov5Wx/wB/WaeWRnBKp0786ydrNs8iOebXj70fXOH9Vi7Ua7KB3P3x3Qq7NtdidqCwT2J9Lws5FWO15F0rvvlgvqdP5QTXfDS6yGFQYl6rgjxEcDGoNZDpncOWJeNT4VsCh65n4topt3Tdzs5PgI/OTopY9PrXllUojrfe7z//2Q==",
  },
  {
    name: "Navaneet Deshpande",
    role: "Senior System Engineer | Cloud systems",
    image: "/primearc-studio/people/navaneet-deshpande.jpg",
    alt: "Portrait of Navaneet Deshpande",
    preview: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/wAALCAAoACABAREA/8QAGgABAAIDAQAAAAAAAAAAAAAABAMFAAIGAf/EACcQAAIBAwMEAgIDAAAAAAAAAAECAwAEEgURISIxQWETURRxMlKR/9oACAEBAAA/ANbTTlEqhlxOXg7mvdT0mLJfhY79iNvdSR6IiRx5M2TDkHxUpsbNIvimulVuRiw/iPfNLxSM5IB3PJol7c/ixrJiC7N0hjsP2T9VtYX0l2s6yqivHtvgdwQai1G2OKzIoyXhvQFIaUICzMiqo5y8VV3eqQXMRUHLHnqGwb0KzRNTs40lhlJSaV9y5XpP1zV9LGHyX+wNcnrE8hREWUuh5324P1Rba1+dHKybyr2jA2JHqjTMULIwIbzXSaXqTzWqrJNsYl2Ix5I8c0a/tTZxpE2PLZHE7jtQbW6jRMJB05ZE5EHtQRlPc8dRJ43q9stPnlvNoiAoOJ/fk/7X/9k=",
  },
  {
    name: "Shreyas Shivakumar",
    role: "Applied AI Engineer",
    image: "/primearc-studio/people/shreyas-shivakumar.jpg",
    alt: "Portrait of Shreyas Shivakumar",
    preview: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/wAALCAAoACABAREA/8QAFwABAQEBAAAAAAAAAAAAAAAAAwQFAv/EACcQAAIBAwQBAgcAAAAAAAAAAAECAwAEERIhMVFBBiITIzKBkcHR/9oACAEBAAA/ALwu9NGBVsI2pLpFNsXZgBH79+Nh57rPMbLyKG4u4rYgSBycajoQtpHZ6FVwyqyKynKsMgjyK6uH+JbSR8alK/mrXiR6wvUds8VussSg5Ok7ZwOf7SwrogixnQVAUnzikY+3mtKaXTA5zjbFRylrizjVwpUkBs+fH7qI3DT37RhdKJlQOuaVwyirZZFWJiwLAcgHmhubgp8qPSGUD27HH3rKacQ3GwzLJhjk/SAeh3WqQskYZRkEZr//2Q==",
  },
] as const;

const scenarios = Object.values(DEMO_SCENARIOS);

function TeamPortrait({ person, active }: { person: (typeof team)[number]; active: boolean }) {
  const [ready, setReady] = useState(false);
  return (
    <figure className="pa-person">
      <div className={ready ? "pa-portrait is-ready" : "pa-portrait"}>
        <div className="pa-portrait-lqip" style={{ backgroundImage: `url("${person.preview}")` }} aria-hidden="true" />
        {active ? (
          <div className="pa-portrait-plate">
            <Image
              src={person.image}
              alt={person.alt}
              fill
              sizes="(max-width: 820px) 42vw, 28vw"
              onLoad={() => setReady(true)}
            />
          </div>
        ) : null}
      </div>
      <figcaption>
        <h3>{person.name}</h3>
        <p>{person.role}</p>
      </figcaption>
    </figure>
  );
}

function TeamRow() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const arm = () => {
      for (const person of team) {
        const preload = new window.Image();
        preload.src = person.image;
      }
      setActive(true);
    };
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      arm();
      observer.disconnect();
    }, { rootMargin: "900px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pa-people" ref={ref}>
      {team.map((person) => <TeamPortrait key={person.name} person={person} active={active} />)}
    </div>
  );
}

function FinMotif({ count = 42, hot = 27 }: { count?: number; hot?: number }) {
  return (
    <div className="pa-motif" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={`fin-${count}-${index}`} className={index >= hot && index < hot + 3 ? "is-hot" : undefined} />
      ))}
    </div>
  );
}

function RuleTabs({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string;
  tabs: readonly { id: string; index: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((tab) => tab.id === active);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    onChange(tab.id);
    document.getElementById(`tab-${label}-${tab.id}`)?.focus();
  };

  return (
    <div className="pa-tabs" role="tablist" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`tab-${label}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${label}-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            <span className="pa-kicker">{tab.index}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function Panel({ id, labelledBy, active, children }: { id: string; labelledBy: string; active: boolean; children: ReactNode }) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className={active ? "pa-panel is-on" : "pa-panel"}
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
    >
      {children}
    </div>
  );
}

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

const speakers: Record<DemoScenario["transcript"][number]["speaker"], string> = {
  fieldrelay: "FieldRelay",
  caller: "Caller",
  system: "System",
};

function Receipt({ scenario }: { scenario: DemoScenario }) {
  const receipt = scenario.receipt;
  return (
    <aside className="pa-receipt" aria-label={`${scenario.title} receipt`}>
      <header>
        <span>FieldRelay</span>
        <span>Sandbox</span>
      </header>
      <h3>{receipt.outcome}</h3>
      <p className="pa-service">{receipt.service}</p>
      <dl>
        <dt>Caller</dt>
        <dd>{receipt.callerName}</dd>
        <dt>Location</dt>
        <dd>{receipt.location}</dd>
        <dt>Urgency</dt>
        <dd>{receipt.urgency}</dd>
        {receipt.appointment ? (
          <>
            <dt>Window</dt>
            <dd>{receipt.appointment}</dd>
          </>
        ) : null}
        {receipt.handoff ? (
          <>
            <dt>Handoff</dt>
            <dd>{receipt.handoff}</dd>
          </>
        ) : null}
        <dt>Safeguards</dt>
        <dd>
          <ul>
            {receipt.safeguards.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </dd>
      </dl>
    </aside>
  );
}

function EmailCopy() {
  const [copied, setCopied] = useState(false);
  const email = BUSINESS_CONTACT.email;
  return (
    <a
      className="pa-email"
      href={`mailto:${email}`}
      aria-live="polite"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        void navigator.clipboard.writeText(email).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          },
          () => {
            window.location.href = `mailto:${email}`;
          },
        );
      }}
    >
      {copied ? "COPIED" : email}
    </a>
  );
}

export function PrimeArcPage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [situation, setSituation] = useState<(typeof situations)[number]["id"]>("workflow");
  const [scenarioId, setScenarioId] = useState<DemoScenario["id"]>("routine");
  const activeSituation = situations.find((item) => item.id === situation) ?? situations[0];

  return (
    <div className="pa">
      <a className="pa-skip" href="#studio">Skip to content</a>
      <main>
        <div className="pa-hero-track" ref={trackRef}>
          <section className="pa-hero" aria-labelledby="hero-title">
            <ArcCanvas trackRef={trackRef} />
            <div className="pa-hero-scrim" aria-hidden="true" />
            <header className="pa-nav">
              <div className="pa-grid pa-nav-row">
                <a className="pa-mark" href="/">PrimeArcTech</a>
                <nav className="pa-nav-links" aria-label="Primary">
                  <a href="#studio">Studio</a>
                  <a href="#fieldrelay">FieldRelay</a>
                  <a href="#method">Method</a>
                  <a href="/about">About</a>
                </nav>
                <a className="pa-nav-cta" href="/build-brief">
                  <span className="pa-nav-cta-full">Get a free AI audit</span>
                  <span className="pa-nav-cta-short">Free audit</span>
                </a>
              </div>
            </header>
            <div className="pa-hero-copy">
              <p className="pa-eyebrow">Founder-led applied AI studio</p>
              <h1 id="hero-title">We build AI systems <br />that complete real work.</h1>
              <p className="pa-lede">PrimeArcTech turns costly workflows into production systems, then proves the craft through products like FieldRelay.</p>
              <div className="pa-actions">
                <a className="pa-btn" href="/build-brief">Get a free AI audit <span aria-hidden="true">→</span></a>
                <a className="pa-textlink" href="/fieldrelay/demo" target="_blank" rel="noreferrer">Try FieldRelay live</a>
              </div>
            </div>
            <p className="pa-cap">The Arc — real-time<br />Bangalore, IN</p>
            <noscript>
              {/* The still is the no-JS frame. next/image cannot render inside noscript. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pa-still" src="/arc/arc-still.webp" alt="" width={1600} height={1000} />
            </noscript>
          </section>
        </div>

        <div className="pa-doc" id="studio">
          <div className="pa-guides" aria-hidden="true">
            <div className="pa-grid">
              {Array.from({ length: 12 }, (_, index) => <span key={`guide-${index}`} />)}
            </div>
          </div>

          <ul className="pa-spec pa-grid" aria-label="Services">
            {services.map(([label, text]) => (
              <li key={label}>
                <span className="pa-kicker">{label}</span>
                <p>{text}</p>
              </li>
            ))}
          </ul>

          <section className="pa-router pa-grid" aria-labelledby="choose-title">
            <p className="pa-kicker">01 / Choose</p>
            <h2 id="choose-title">Choose the problem you actually have.</h2>
            <p className="pa-aside">One consequential system, scoped tightly enough to prove.</p>
            <RuleTabs
              label="choose"
              tabs={situations.map((item) => ({ id: item.id, index: item.index, label: item.label }))}
              active={situation}
              onChange={(id) => setSituation(id as (typeof situations)[number]["id"])}
            />
            <div className="pa-choice">
              <div className="pa-stack">
                {situations.map((item) => (
                  <Panel key={item.id} id={`panel-choose-${item.id}`} labelledBy={`tab-choose-${item.id}`} active={situation === item.id}>
                    <h3>{item.title}</h3>
                    <p className="pa-body">{item.body}</p>
                  </Panel>
                ))}
              </div>
              <aside className="pa-choice-side">
                <FinMotif count={24} hot={14} />
                <dl className="pa-scope">
                  <dt className="pa-kicker">First scope</dt>
                  <dd>{activeSituation.scope}</dd>
                </dl>
                <p className="pa-notfit">Not a fit: generic content production, staff augmentation, or automation without an accountable owner.</p>
              </aside>
            </div>
          </section>

          <section className="pa-relay" id="fieldrelay" aria-labelledby="relay-title">
            <div className="pa-grid">
              <div className="pa-relay-title">
                <FinMotif />
                <p className="pa-kicker">02 / FieldRelay</p>
                <h2 id="relay-title">Interrupt.<br />Price check.<br />Receipt.</h2>
              </div>
              <p className="pa-aside">FieldRelay is a working voice product, not a portfolio mockup. Challenge the agent. Interrupt it. Push for a price. Watch the policy decisions and the receipt.</p>
              <RuleTabs
                label="relay"
                tabs={scenarios.map((item) => ({ id: item.id, index: item.index, label: item.title }))}
                active={scenarioId}
                onChange={(id) => setScenarioId(id as DemoScenario["id"])}
              />
              <div className="pa-stack">
                {scenarios.map((item) => (
                  <Panel key={item.id} id={`panel-relay-${item.id}`} labelledBy={`tab-relay-${item.id}`} active={scenarioId === item.id}>
                    <p className="pa-case"><strong>{item.label}</strong>{item.prompt}</p>
                    <div className="pa-proof">
                      <div>
                        {item.transcript.map((line) => (
                          <div className={line.speaker === "system" ? "pa-line is-system" : "pa-line"} key={`${item.id}-${line.atSeconds}`}>
                            <time dateTime={`PT${line.atSeconds}S`}>{clock(line.atSeconds)}</time>
                            <b>{speakers[line.speaker]}</b>
                            <p>{line.text}</p>
                          </div>
                        ))}
                      </div>
                      <Receipt scenario={item} />
                    </div>
                  </Panel>
                ))}
              </div>
              <div className="pa-relay-actions">
                <a className="pa-btn" href="/fieldrelay/demo" target="_blank" rel="noreferrer">Try FieldRelay live <span aria-hidden="true">→</span></a>
                <a className="pa-textlink" href="/fieldrelay" target="_blank" rel="noreferrer">Explore the product</a>
              </div>
            </div>
          </section>

          <section className="pa-trust pa-grid" aria-labelledby="trust-title">
            <p className="pa-kicker">03 / Trust</p>
            <h2 id="trust-title">What makes the system trustworthy?</h2>
            <div className="pa-arch">
              <p className="pa-fig pa-kicker"><span>FIG. 02 — Architecture</span><span>FieldRelay demo</span></p>
              {architecture.map(([index, title, body]) => (
                <article key={index}>
                  <span className="pa-kicker">{index}</span>
                  <b>{title}</b>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <div className="pa-policy">
              <p className="pa-fig pa-kicker"><span>Boundary policy</span><span>Demo</span></p>
              <h3>Allowed</h3>
              <ul>
                {allowed.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className="is-refused">
                <h3>Refused</h3>
                <ul>
                  {refused.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <figure className="pa-filed">
                <figcaption className="pa-fig pa-kicker"><span>Operator receipt</span><span>Sandbox</span></figcaption>
                <Receipt scenario={DEMO_SCENARIOS.routine} />
              </figure>
            </div>
            <div className="pa-log-wrap">
              <p className="pa-fig pa-kicker"><span>FIG. 03 — Adversarial cases</span><span>Prompt to outcome</span></p>
              <table className="pa-log">
                <thead>
                  <tr>
                    <th scope="col">Prompt</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">What it checks</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((item) => (
                    <tr key={item.id}>
                      <td>{item.prompt}</td>
                      <td>{item.receipt.outcome}</td>
                      <td>{item.test}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pa-trust-links">
              <a className="pa-textlink" href="/fieldrelay-architecture-brief.pdf">View an architecture brief</a>
              <a className="pa-textlink" href="/security">Security and safeguards</a>
            </div>
          </section>

          <section className="pa-method pa-grid" id="method" aria-labelledby="method-title">
            <p className="pa-kicker">04 / Method</p>
            <h2 id="method-title">From workflow to operating system.</h2>
            <div className="pa-steps">
              {method.map(([index, title, body]) => (
                <article key={index}>
                  <span className="pa-kicker">{index}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="pa-team pa-grid" id="team" aria-labelledby="team-title">
            <p className="pa-kicker">05 / Team</p>
            <h2 id="team-title">Small studio. Accountable work.</h2>
            <p className="pa-team-lede">Three people in Bangalore. Direct delivery, from the first loop to the system in operation.</p>
            <TeamRow />
          </section>

          <section className="pa-close pa-grid" id="audit" aria-labelledby="audit-title">
            <FinMotif count={28} hot={16} />
            <p className="pa-kicker">06 / Free AI Workflow Audit</p>
            <h2 id="audit-title">See which loop is worth automating first.</h2>
            <p className="pa-close-copy">Show us one repeated, expensive, or error-prone workflow. We return the strongest opportunity and the next sensible move.</p>
            <div className="pa-actions">
              <a className="pa-btn" href="/build-brief">Get a free AI audit <span aria-hidden="true">→</span></a>
            </div>
            <p className="pa-close-note">Free. Direct review. No sales sequence. No complete architecture. No revenue promise. No obligation to build. If an existing tool solves it, we say so.</p>
            <div className="pa-audit">
              <h3>Your audit covers</h3>
              <ul>
                {auditOutputs.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </section>
        </div>
      </main>

      <footer className="pa-foot pa-grid">
        <a className="pa-mark" href="/">PrimeArcTech</a>
        <nav aria-label="Footer">
          <a href="#studio">Studio</a>
          <a href="/fieldrelay">FieldRelay</a>
          <a href="#method">Method</a>
          <a href="/about">About</a>
          <a href="/security">Security</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
        <div className="pa-foot-contact">
          {/* PLACEHOLDER: hello@primearc.tech is not a configured mailbox yet. */}
          <EmailCopy />
          <a href={BUSINESS_CONTACT.whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a>
          <a href={`tel:${BUSINESS_CONTACT.phoneHref}`}>{BUSINESS_CONTACT.phoneDisplay}</a>
          <span>{BUSINESS_CONTACT.location}</span>
        </div>
        <p>© {new Date().getFullYear()} PrimeArcTech.</p>
      </footer>
    </div>
  );
}
