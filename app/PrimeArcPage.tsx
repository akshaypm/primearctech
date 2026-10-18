"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { ArcCanvas } from "./home/ArcCanvas";
import { Stage, type SceneName } from "./home/v3/Stage";
import type { Anchor, SceneHandle } from "./home/v3/types";
import { BUSINESS_CONTACT } from "@/lib/contact";
import "./home/home.css";

const team = [
  { name: "Akshay P M", role: "Senior IoT Platform Engineer", image: "/v3/people/akshay-head-bw.jpg", width: "a" },
  { name: "Navaneet Deshpande", role: "Senior System Engineer · Cloud systems", image: "/v3/people/navaneet-deshpande-bw.jpg", width: "b" },
  { name: "Shreyas Shivakumar", role: "Applied AI Engineer", image: "/v3/people/shreyas-shivakumar-bw.jpg", width: "c" },
] as const;

function place(anchors: Anchor[], id: string): CSSProperties | undefined {
  const anchor = anchors.find((item) => item.id === id);
  if (!anchor) return undefined;
  return { left: anchor.x, top: anchor.y };
}

function EmailLine() {
  const [copied, setCopied] = useState(false);
  const email = BUSINESS_CONTACT.email;
  return (
    <a
      className="pa-alt"
      href={`mailto:${email}`}
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
      {copied ? "Copied" : email}
    </a>
  );
}

export function PrimeArcPage() {
  const heroRef = useRef<HTMLElement>(null);
  const [locked, setLocked] = useState(50);
  const [fitHandle, setFitHandle] = useState<SceneHandle | null>(null);
  const [productHandle, setProductHandle] = useState<SceneHandle | null>(null);

  return (
    <div className="pa">
      <a className="pa-skip" href="#main">Skip to content</a>
      <header className="pa-hero" id="hero" ref={heroRef}>
        <ArcCanvas trackRef={heroRef} />
        <HeroChrome />
      </header>
      <main id="main">
        <Demo locked={locked} onProgress={setLocked} />
        <Engagements />
        <How />
        <Proof />
        <Products handle={productHandle} onHandle={setProductHandle} />
        <Partners />
        <Team />
        <Fit handle={fitHandle} onHandle={setFitHandle} />
        <Book />
      </main>
    </div>
  );
}

function HeroChrome() {
  return (
    <>
      <div className="pa-top">
        <a className="pa-wm" href="#hero">PrimeArcTech</a>
        <nav aria-label="Primary">
          <a href="#engagements">Engagements</a>
          <a href="#products">Products</a>
          <a href="#partners">Partners</a>
          <a href="#team">Team</a>
        </nav>
        <a className="pa-textlink" href="#book">Book a call</a>
      </div>
      <div className="pa-hero-copy">
        <p className="pa-eyebrow">Senior-engineer AI studio · US &amp; UK</p>
        <h1>AI features, <br />from demo to production.</h1>
        <p className="pa-lede">We take the AI feature your team demoed and make it hold up under real users, real data and real cost. For B2B software companies, Seed to Series B.</p>
        <div className="pa-actions">
          <a className="pa-btn" href="#book">Book a call with an engineer <span>→</span></a>
          <a className="pa-textlink" href="#how">How we work</a>
        </div>
      </div>
      <p className="pa-cap">The Arc — real-time, 260 fins<br />Bangalore, IN</p>
    </>
  );
}

function Demo({ locked, onProgress }: { locked: number; onProgress: (value: number) => void }) {
  return (
    <section className="pa-sec pa-demo pa-light" id="demo" aria-labelledby="demo-title">
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">02 — Demo to production</p>
        <h2 id="demo-title">The demo worked. Production is a different machine.</h2>
      </div>
      <p className="pa-ov pa-side">Most AI features stall in the same place: they impress in a meeting, then wobble under real users, real data and real cost. <b>That gap is the job we take.</b></p>
      <Scene id="demo" scene="demo" fallback="/v3/stills/demo.jpg" mobileHeight={440} scrubCenter={0.5} onProgress={(value) => onProgress(Math.round(value * 100))}>
        {(anchors) => (
          <>
            <p className="pa-tag pa-anchor" style={place(anchors, "t0")}><i>Demo</i> — works on the happy path</p>
            <p className="pa-tag pa-anchor" style={place(anchors, "t1")}><i>Production</i> — holds under load</p>
          </>
        )}
      </Scene>
      <p className="pa-ov pa-prog"><b>{locked}%</b>locked down</p>
      <div className="pa-ov pa-foot">
        <p className="pa-lead">What we lock down before anything ships</p>
        <p><span>Latency</span>p95 measured under real traffic, not a demo prompt</p>
        <p><span>Drift</span>Evals that catch regressions when a model or prompt changes</p>
        <p><span>Failure</span>Fallbacks, retries and a human path when the model is wrong</p>
        <p><span>Cost</span>Cost per request you can defend to finance</p>
      </div>
    </section>
  );
}

function Engagements() {
  return (
    <section className="pa-sec pa-eng" id="engagements" aria-labelledby="eng-title">
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">03 — Engagements</p>
        <h2 id="eng-title">Three ways in. One standard of finish.</h2>
      </div>
      <p className="pa-ov pa-lede">Every engagement starts with an engineer reading your code, not a sales deck. <b>Projects start around $10K.</b></p>
      <Scene id="engagements" scene="engagements" fallback="/v3/stills/engagements.jpg" mobileHeight={360} scrubCenter={0.5}>
        {(anchors) => (
          <>
            <StageCopy id="s0" anchors={anchors} index="01 · Raw stock" title="Audit" meta={<>Fixed scope · <span className="ph">[placeholder] weeks · [placeholder] price</span></>}>
              We read your AI feature end to end: prompts, retrieval, evals, infra and cost. You get a ranked fix list your team can act on.
            </StageCopy>
            <StageCopy id="s1" anchors={anchors} index="02 · Cut" title="Build to production" meta={<>Milestone-based · <span className="ph">[placeholder] price</span></>}>
              We ship the feature with tracing, evals, fallbacks and a cost budget, in your repo and through your code review.
            </StageCopy>
            <StageCopy id="s2" anchors={anchors} index="03 · Installed" title="Embedded engineers" meta={<>Per quarter · <span className="ph">[placeholder] price</span></>}>
              Senior engineers inside your team for a quarter: your standups, your backlog, your on-call.
            </StageCopy>
          </>
        )}
      </Scene>
      <p className="pa-ov pa-cap">One bar, three stages of machining. Scroll moves the camera along it.</p>
    </section>
  );
}

function StageCopy({ id, anchors, index, title, meta, children }: { id: string; anchors: Anchor[]; index: string; title: string; meta: ReactNode; children: string }) {
  return (
    <div className="pa-anchor is-flow pa-stage-copy" style={place(anchors, id)}>
      <p className="pa-n">{index}</p>
      <h3>{title}</h3>
      <p>{children}</p>
      <p className="pa-meta">{meta}</p>
    </div>
  );
}

function How() {
  return (
    <section className="pa-sec pa-how pa-light" id="how" aria-labelledby="how-title">
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">04 — How we work</p>
        <h2 id="how-title">Engineers on the call. Engineers on the code.</h2>
      </div>
      <p className="pa-ov pa-lede">No account managers and no handoff to a junior bench. <b>The engineer who scopes your work is the one who writes it.</b></p>
      <Scene id="how" scene="how" fallback="/v3/stills/how.jpg" mobileHeight={330} scrubCenter={0.62} />
      <div className="pa-steps">
        <article>
          <p className="pa-k"><i className="on" />Week 1</p>
          <h3>Baseline</h3>
          <p>We instrument the feature you already have: traces, an eval set, cost per request. Nothing ships yet. We measure.</p>
        </article>
        <article>
          <p className="pa-k"><i className="on" />Weeks 2 – <span className="ph">[placeholder]</span></p>
          <h3>Ship behind flags</h3>
          <p>Small pull requests into your repo, reviewed by your team, each one measured against the baseline. A weekly call and written notes.</p>
        </article>
        <article>
          <p className="pa-k"><i />Handover</p>
          <h3>Your team owns it</h3>
          <p>Runbooks, dashboards and an eval suite in your stack. We stay reachable for <span className="ph">[placeholder]</span> weeks after.</p>
        </article>
      </div>
      <p className="pa-ov pa-note">The Arc as a toolpath. One fin per pull request, measured after each pass.</p>
    </section>
  );
}

function Proof() {
  return (
    <section className="pa-sec pa-proof" id="proof" aria-labelledby="proof-title">
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">05 — Engineering depth</p>
        <h2 id="proof-title">Engineering you can inspect.</h2>
      </div>
      <p className="pa-ov pa-side">Every system we ship is traced, evaluated and budgeted. <b>You see the same evidence we do</b> from the first week, not a slide about it at the end.</p>
      <Scene id="proof" scene="proof" fallback="/v3/stills/proof.jpg" mobileHeight={320}>
        {(anchors) => (
          <>
            {anchors.filter((anchor) => anchor.id.startsWith("span")).map((anchor) => (
              <p key={anchor.id} className={anchor.label === "llm.generate" ? "pa-lab pa-anchor is-hot" : "pa-lab pa-anchor"} style={{ left: anchor.x, top: anchor.y }}>
                {anchor.label}<em>{anchor.note}</em>
              </p>
            ))}
            <div className="pa-pin pa-anchor" style={place(anchors, "pin")}>
              <p>910 ms of a 1,840 ms request.<br />The first thing we would fix.</p>
              <span>span llm.generate · <span className="ph">[illustrative]</span></span>
              <i />
            </div>
          </>
        )}
      </Scene>
      <div className="pa-ov pa-cs"><b>Client trace, anonymised <span className="ph">[placeholder]</span></b>This plate gets swapped for a real client trace, with permission, once one is cleared for publishing.</div>
      <ul className="pa-ov pa-list">
        <li><b>Traces</b> on every request, model call and tool call</li>
        <li><b>Evals</b> that run before each release, against a pass bar you agree to</li>
        <li><b>Budgets</b> for latency, failure rate and cost per request</li>
      </ul>
      <p className="pa-ov pa-note">Fig. 05 — A request trace, milled in graphite. Each span is a finned bar; length is time.</p>
    </section>
  );
}

function Products({ handle, onHandle }: { handle: SceneHandle | null; onHandle: (handle: SceneHandle | null) => void }) {
  const hover = (id: string | null) => handle?.setHover?.(id);
  return (
    <section className="pa-sec pa-products pa-light" id="products" aria-labelledby="products-title">
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">06 — Products lab</p>
        <h2 id="products-title">When the same problem shows up three times, we build it once.</h2>
      </div>
      <p className="pa-ov pa-side">Engineering for clients comes first. When several of them ask for the same thing, we turn it into a product they can buy instead of rebuild. <b>FieldRelay was the first. Counter and Roster are being machined now.</b></p>
      <Scene id="products" scene="products" fallback="/v3/stills/products.jpg" mobileHeight={320} onHandle={onHandle}>
        {(anchors) => (
          <>
            <article className="pa-cap pa-anchor is-flow" style={place(anchors, "c0")} onMouseEnter={() => hover("c0")} onMouseLeave={() => hover(null)}>
              <span className="pa-mono">01 / Live</span>
              <h3>FieldRelay</h3>
              <p>Voice intake for home-service companies: answers, qualifies and books after hours.</p>
              <a className="pa-status" href="/fieldrelay"><i />Live — try the demo</a>
            </article>
            <article className="pa-cap pa-anchor is-flow" style={place(anchors, "c1")} onMouseEnter={() => hover("c1")} onMouseLeave={() => hover(null)}>
              <span className="pa-mono">02 / In progress</span>
              <h3>Counter</h3>
              <p>A swarm of AI agents for e-commerce and retail brands. Each agent owns one job.</p>
              <ul>
                <li><b>Customer</b>order status, delivery, escalation</li>
                <li><b>Returns</b>eligibility, exchange or refund, approval</li>
                <li><b>Sales</b>product, size, stock-aware picks</li>
                <li><b>Inventory</b>demand forecast, low-stock alerts</li>
              </ul>
              <span className="pa-status is-off"><i /><span className="ph">[placeholder: status]</span></span>
            </article>
            <article className="pa-cap pa-anchor is-flow" style={place(anchors, "c2")} onMouseEnter={() => hover("c2")} onMouseLeave={() => hover(null)}>
              <span className="pa-mono">03 / In progress</span>
              <h3>Roster</h3>
              <p>A web tool for fitness coaches to manage their clients, with AI built in.</p>
              <ul>
                <li><b>For</b>fitness coaches and their clients</li>
                <li><b>Format</b>web app</li>
                <li><b>AI</b>integrated into client management</li>
                <li><b>Built with</b>a working fitness coach</li>
              </ul>
              <span className="pa-status is-off"><i /><span className="ph">[placeholder: status]</span></span>
            </article>
          </>
        )}
      </Scene>
    </section>
  );
}

function Partners() {
  return (
    <section className="pa-sec pa-partners" id="partners" aria-labelledby="partners-title">
      <Scene id="partners" scene="partners" fallback="/v3/stills/partners.jpg" mobileHeight={440} scrubCenter={0.5}>
        {(anchors) => <p className="pa-plate pa-anchor" style={place(anchors, "plate")}>[Your agency]</p>}
      </Scene>
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">07 — For agencies and IT firms</p>
        <h2 id="partners-title">Built under your name.</h2>
        <p>US and UK agencies win AI projects they can&apos;t staff. We build them white-label: your brand on the work, our senior engineers behind it.</p>
      </div>
      <div className="pa-ov pa-terms">
        <div><span>Your client</span>You own the relationship. We work inside your process.</div>
        <div><span>Your brand</span><em>White-label by default, under NDA <span className="ph">[placeholder: confirm terms]</span></em></div>
        <div><span>Our engineers</span>The same three people, on your calls when you want them.</div>
      </div>
      <div className="pa-ov pa-cta"><a className="pa-btn" href="#book">Talk about a partnership <span>→</span></a></div>
      <p className="pa-ov pa-cap">The Arc, in your colourway. Same machine underneath.</p>
    </section>
  );
}

function Team() {
  return (
    <section className="pa-sec pa-team" id="team" aria-labelledby="team-title">
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">08 — Team</p>
        <h2 id="team-title">Three engineers. You&apos;ll talk to all of us.</h2>
      </div>
      <p className="pa-ov pa-side">A small senior team in Bangalore, building for B2B software companies in the US and UK. <b>The people on the first call are the people on the code.</b></p>
      {team.map((person, index) => (
        <figure className={`pa-person is-${person.width}`} key={person.name}>
          <div className="pa-ph">
            <Image src={person.image} alt={person.name} fill sizes="(max-width: 700px) 84vw, 500px" />
          </div>
          <figcaption>
            <div>
              <h3>{person.name}</h3>
              <p>{person.role}</p>
            </div>
            <span>0{index + 1}</span>
          </figcaption>
        </figure>
      ))}
      <p className="pa-ov pa-foot">Backgrounds and past systems <span className="ph">[placeholder: one line each, from Akshay]</span>. Bangalore, IN.</p>
    </section>
  );
}

const fitRows = [
  ["go", "B2B SaaS, Seed to Series B", "GO"],
  ["go", "10–200 people, US or UK", "GO"],
  ["go", "Just raised, or hiring for AI/ML", "GO"],
  ["go", "An AI feature in production that's flaky", "GO"],
] as const;

const noRows = [
  ["no", "Local small businesses", "NO-GO"],
  ["no", "Free pilots or spec work", "NO-GO"],
  ["no", "Projects under ~$10K", "NO-GO"],
] as const;

function Fit({ handle, onHandle }: { handle: SceneHandle | null; onHandle: (handle: SceneHandle | null) => void }) {
  const hover = (id: string | null) => handle?.setHover?.(id);
  return (
    <section className="pa-sec pa-fit pa-light" id="fit" aria-labelledby="fit-title">
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">09 — Fit</p>
        <h2 id="fit-title">We work to a tolerance. So should a client list.</h2>
      </div>
      <Scene id="fit" scene="fit" fallback="/v3/stills/fit.jpg" mobileHeight={420} onHandle={onHandle} />
      <div className="pa-ov pa-lists">
        <h4><span>Built for</span><span>Go</span></h4>
        <ul>
          {fitRows.map(([kind, label, mark], index) => (
            <li key={label}>
              <button type="button" onMouseEnter={() => hover(`${kind}-${index}`)} onMouseLeave={() => hover(null)} onFocus={() => hover(`${kind}-${index}`)} onBlur={() => hover(null)}>
                <span>{label}</span><span>{mark}</span>
              </button>
            </li>
          ))}
        </ul>
        <h4><span>Not for</span><span>No-go</span></h4>
        <ul className="is-no">
          {noRows.map(([kind, label, mark], index) => (
            <li key={label}>
              <button type="button" onMouseEnter={() => hover(`${kind}-${index}`)} onMouseLeave={() => hover(null)} onFocus={() => hover(`${kind}-${index}`)} onBlur={() => hover(null)}>
                <span>{label}</span><span>{mark}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="pa-ov pa-hint">Hover a line: the fin slides through the gauge, or stops at it.</p>
    </section>
  );
}

function Book() {
  return (
    <section className="pa-sec pa-book pa-light" id="book" aria-labelledby="book-title">
      <Scene id="book" scene="book" fallback="/v3/stills/book.jpg" mobileHeight={420} />
      <div className="pa-ov pa-head">
        <p className="pa-eyebrow">10 — Book a call</p>
        <h2 id="book-title">Talk to an engineer, not a salesperson.</h2>
      </div>
      <p className="pa-ov pa-sub">Thirty minutes with one of us. Bring the AI feature that&apos;s misbehaving; leave with a straight answer on whether we can help.</p>
      <div className="pa-ov pa-act">
        <a className="pa-btn pa-btn-ink" href="#book"><i />Book a 30-minute call <span>→</span></a>
        <span className="ph">[placeholder: booking link]</span>
        <EmailLine />
      </div>
      <ul className="pa-ov pa-what">
        <li><span>You bring</span>The feature, the stack, what&apos;s going wrong</li>
        <li><span>You get</span>An engineer&apos;s read and a rough shape of the fix</li>
        <li><span>Not included</span>A sales sequence afterwards</li>
      </ul>
      <div className="pa-ov pa-ft">
        <span>PrimeArcTech · Bangalore, IN</span>
        <span>Senior-engineer AI studio for B2B software</span>
        <span>© 2026</span>
      </div>
    </section>
  );
}

function Scene({
  id,
  scene,
  fallback,
  mobileHeight,
  scrubCenter,
  onProgress,
  onHandle,
  children,
}: {
  id: string;
  scene: SceneName;
  fallback: string;
  mobileHeight: number;
  scrubCenter?: number;
  onProgress?: (value: number) => void;
  onHandle?: (handle: SceneHandle | null) => void;
  children?: (anchors: Anchor[]) => ReactNode;
}) {
  return (
    <Stage id={id} scene={scene} fallback={fallback} mobileHeight={mobileHeight} scrubCenter={scrubCenter} onProgress={onProgress} onHandle={onHandle}>
      {children}
    </Stage>
  );
}
