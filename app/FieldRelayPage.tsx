"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- vinext cross-route prefetch is intentionally bypassed with full document navigation. */

import Image from "next/image";
import { BUSINESS_CONTACT } from "@/lib/contact";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  Headset,
  PhoneCall,
  ShieldCheck,
  SpinnerGap,
  WarningCircle,
  Wrench,
  X,
} from "@phosphor-icons/react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { calculateRevenueOpportunity } from "@/lib/calculator";

const EVIDENCE_LINKS = {
  invoca:
    "https://www.invoca.com/reports/the-invoca-home-services-lead-conversion-benchmarks-report-2026",
  serviceTitan:
    "https://www.servicetitan.com/toolbox/state-of-the-trades/trends/top-performer-profile",
};

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      animate={reduceMotion ? { opacity: 1, y: 0 } : undefined}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduceMotion ? 0 : 0.72, delay: reduceMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function MagneticLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 280, damping: 22, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 280, damping: 22, mass: 0.5 });
  const reduceMotion = useReducedMotion();

  function handleMove(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (reduceMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - bounds.left - bounds.width / 2) * 0.13);
    y.set((event.clientY - bounds.top - bounds.height / 2) * 0.18);
  }

  return (
    <motion.a
      href={href}
      className={`button button-primary ${className}`}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMove}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <span>{children}</span>
      <ArrowRight aria-hidden="true" weight="bold" />
    </motion.a>
  );
}

const fieldRelayLinks = [
  { href: "/", label: "PrimeArcTech" },
  { href: "/fieldrelay/demo", label: "Live demo" },
  { href: "#calculator", label: "Calculator" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#offer", label: "Offer" },
] as const;

function FieldRelayNav() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 1100px)");
    const onChange = () => {
      if (!narrow.matches) setOpen(false);
    };
    narrow.addEventListener("change", onChange);
    return () => narrow.removeEventListener("change", onChange);
  }, []);

  const pick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!open) return;
    setOpen(false);
    const href = event.currentTarget.getAttribute("href");
    const section = href?.startsWith("#") ? document.querySelector(href) : null;
    if (!href || !section || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, "", href);
    section.scrollIntoView({ block: "start" });
    buttonRef.current?.focus({ preventScroll: true });
  };

  return (
    <nav ref={navRef} className="nav shell" aria-label="Primary navigation" data-open={open ? "true" : "false"}>
      <a href="/fieldrelay" className="wordmark" aria-label="FieldRelay product home">
        <span>FieldRelay</span>
        <small>by PrimeArcTech</small>
      </a>
      <button
        ref={buttonRef}
        type="button"
        className="nav-menu-btn"
        aria-expanded={open}
        aria-controls="fr-nav-links"
        onClick={() => setOpen((value) => !value)}
      >
        Menu<i aria-hidden="true" />
      </button>
      <ul id="fr-nav-links" className="nav-links">
        {fieldRelayLinks.map((link) => (
          <li key={link.href}>
            <a href={link.href} onClick={pick}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <a className="nav-cta" href="#audit">
        Get my audit <ArrowUpRight aria-hidden="true" weight="bold" />
      </a>
    </nav>
  );
}

function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "7%"]);

  return (
    <header className="hero" ref={heroRef}>
      <motion.div className="hero-media" style={{ y: reduceMotion ? 0 : imageY }}>
        <Image
          src="/fieldrelay/01-hero.webp"
          alt="HVAC technician beside a service vehicle and mechanical equipment at night"
          fill
          priority
          sizes="100vw"
        />
      </motion.div>
      <div className="hero-scrim" aria-hidden="true" />
      <FieldRelayNav />

      <div className="hero-content shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Built for HVAC + plumbing</p>
          <h1>Every missed call is already choosing a contractor.</h1>
          <p className="hero-support">
            Managed overflow and after-hours intake for residential HVAC and plumbing companies.
          </p>
          <div className="hero-actions">
            <MagneticLink href="#audit">Get my audit</MagneticLink>
            <a className="button button-secondary" href="/fieldrelay/demo">
              Test the call flow <ArrowRight aria-hidden="true" weight="bold" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

function Evidence() {
  return (
    <section className="section evidence" id="evidence">
      <div className="shell">
        <div className="evidence-grid">
          <Reveal className="evidence-image-frame">
            <Image
              src="/fieldrelay/02-evidence.webp"
              alt="Quiet after-hours dispatch desk with an unanswered service phone"
              fill
              sizes="(max-width: 768px) 100vw, 52vw"
            />
          </Reveal>
          <div className="evidence-copy">
            <Reveal>
              <p className="context-label">Industry benchmarks</p>
              <h2>The gap between ringing and revenue.</h2>
              <p className="section-intro">
                FieldRelay is built around the handoff point where intent is highest and your team is least available.
              </p>
            </Reveal>
            <div className="evidence-stats">
              <Reveal className="evidence-stat" delay={0.08}>
                <strong>52%</strong>
                <p>of home-service callers reach a person.</p>
                <a href={EVIDENCE_LINKS.invoca} target="_blank" rel="noreferrer">
                  Invoca benchmark <ArrowUpRight aria-hidden="true" />
                </a>
              </Reveal>
              <Reveal className="evidence-stat evidence-stat-offset" delay={0.16}>
                <strong>62<span>%</span></strong>
                <p>of inbound lead calls are booked by top performers, compared with 39% for other contractors.</p>
                <a href={EVIDENCE_LINKS.serviceTitan} target="_blank" rel="noreferrer">
                  ServiceTitan benchmark <ArrowUpRight aria-hidden="true" />
                </a>
              </Reveal>
            </div>
          </div>
        </div>
        <Reveal className="audit-promise">
          <div className="audit-promise-lead">
            <p>Free, human-reviewed audit</p>
            <h3>Know what to fix before buying anything.</h3>
          </div>
          <div className="audit-promise-output">
            <strong>Leak</strong>
            <span>Where high-intent calls leave your current flow.</span>
          </div>
          <div className="audit-promise-output">
            <strong>Value</strong>
            <span>What the recoverable portion may be worth.</span>
          </div>
          <div className="audit-promise-output">
            <strong>First fix</strong>
            <span>The smallest practical recovery point to install.</span>
          </div>
          <MagneticLink href="#audit">Get my audit</MagneticLink>
        </Reveal>
      </div>
    </section>
  );
}

function RangeInput({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <span className="range-stepper">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <output>{value.toLocaleString()}{suffix}</output>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </button>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        onClick={(event) => onChange(Number(event.currentTarget.value))}
        onKeyUp={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={(event) => onChange(Number(event.currentTarget.value))}
        onBlur={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span className="range-bounds" aria-hidden="true">
        <small>{min.toLocaleString()}{suffix}</small>
        <small>{max.toLocaleString()}{suffix}</small>
      </span>
    </label>
  );
}

function RevenueCalculator() {
  const [monthlyCalls, setMonthlyCalls] = useState(300);
  const [answerRate, setAnswerRate] = useState(52);
  const [leadRate, setLeadRate] = useState(70);
  const [recoveryRate, setRecoveryRate] = useState(50);
  const [averageTicket, setAverageTicket] = useState(425);

  const result = useMemo(
    () => calculateRevenueOpportunity({ monthlyCalls, answerRate, leadRate, recoveryRate, averageTicket }),
    [monthlyCalls, answerRate, leadRate, recoveryRate, averageTicket],
  );

  return (
    <section className="section calculator-section" id="calculator">
      <div className="calculator-media" aria-hidden="true">
        <Image src="/fieldrelay/03-calculator.webp" alt="" fill sizes="100vw" />
      </div>
      <div className="shell calculator-shell">
        <Reveal className="calculator-heading">
          <h2>Estimate what unanswered calls may be worth.</h2>
          <p>Adjust the assumptions. Every output is an estimate, not a promise.</p>
        </Reveal>

        <div className="calculator-card">
          <div className="calculator-controls">
            <RangeInput label="Monthly inbound calls" value={monthlyCalls} min={25} max={1000} step={25} onChange={setMonthlyCalls} />
            <RangeInput label="Answer rate" value={answerRate} min={20} max={95} suffix="%" onChange={setAnswerRate} />
            <RangeInput label="Calls that are leads" value={leadRate} min={20} max={100} suffix="%" onChange={setLeadRate} />
            <RangeInput label="Missed leads recovered" value={recoveryRate} min={10} max={90} suffix="%" onChange={setRecoveryRate} />
            <RangeInput label="Average initial job value" value={averageTicket} min={100} max={2000} step={25} suffix=" USD" onChange={setAverageTicket} />
          </div>
          <div className="calculator-results" aria-live="polite" aria-atomic="true">
            <p className="results-kicker">Estimated monthly opportunity</p>
            <div className="primary-result">
              <span>$</span>
              <strong>{Math.round(result.monthlyRevenue).toLocaleString()}</strong>
            </div>
            <div className="result-lines">
              <p><span>Missed calls</span><strong>{Math.round(result.missedCalls).toLocaleString()}</strong></p>
              <p><span>Recoverable bookings</span><strong>{result.recoveredBookings.toFixed(1)}</strong></p>
            </div>
            <p className="estimate-note">
              Benchmark default: 52% answer rate from <a href={EVIDENCE_LINKS.invoca} target="_blank" rel="noreferrer">Invoca</a>. Your lead mix and close rate will vary.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const journeyStages = [
  { title: "Answer", text: "Pick up overflow and after-hours calls with your approved greeting, service area, and availability rules.", icon: PhoneCall },
  { title: "Qualify", text: "Capture the equipment, issue, urgency, property type, and caller details your dispatcher needs.", icon: Wrench },
  { title: "Book", text: "Offer only the slots and job types you authorize, then confirm the appointment details with the caller.", icon: Check },
  { title: "Escalate", text: "Route emergencies, uncertainty, and sensitive conversations to the right person without improvising.", icon: Headset },
];

function JourneyScene({
  stage,
  index,
  progress,
  reduceMotion,
}: {
  stage: (typeof journeyStages)[number];
  index: number;
  progress: MotionValue<number>;
  reduceMotion: boolean;
}) {
  const start = index * 0.25;
  const hold = start + 0.17;
  const end = index === journeyStages.length - 1 ? 1 : start + 0.25;
  const entry = index === 0 ? 0 : start - 0.06;
  const opacity = useTransform(
    progress,
    index === 0 ? [0, hold, end] : [entry, start, hold, end],
    index === 0 ? [1, 1, 0] : index === journeyStages.length - 1 ? [0, 1, 1, 1] : [0, 1, 1, 0],
  );
  const y = useTransform(progress, index === 0 ? [0, end] : [entry, start, end], index === 0 ? [0, -24] : [44, 0, -24]);
  const Icon = stage.icon;
  return (
    <motion.article
      className="journey-scene"
      style={{ opacity: reduceMotion ? 1 : opacity, y: reduceMotion ? 0 : y }}
    >
      <div className="journey-scene-icon"><Icon aria-hidden="true" weight="duotone" /></div>
      <div>
        <h3>{stage.title}</h3>
        <p>{stage.text}</p>
      </div>
    </motion.article>
  );
}

function CallJourney() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.03, 1.1]);
  return (
    <section className={`journey ${reduceMotion ? "is-reduced" : ""}`} id="how-it-works" ref={sectionRef}>
      <div className="journey-canvas">
        <div className="journey-media-column">
          <motion.div className="journey-image-frame" style={{ scale: reduceMotion ? 1 : imageScale }}>
              <Image
                src="/fieldrelay/04-journey.webp"
                alt="Service phone, technician notes, and dispatch tools arranged as a call journey"
                fill
                sizes="(max-width: 768px) 100vw, 56vw"
              />
          </motion.div>
        </div>
        <div className="journey-narrative">
          <div className="journey-heading">
            <h2>One call. Four controlled decisions.</h2>
            <p>FieldRelay follows rules shaped around your operation, then moves uncertainty back to a person.</p>
          </div>
          <div className="journey-scenes">
            {journeyStages.map((stage, index) => (
              <JourneyScene
                key={stage.title}
                stage={stage}
                index={index}
                progress={scrollYProgress}
                reduceMotion={Boolean(reduceMotion)}
              />
            ))}
          </div>
          <div className="journey-verbs" aria-hidden="true">
            {journeyStages.map((stage) => <span key={stage.title}>{stage.title}</span>)}
          </div>
        </div>
      </div>
    </section>
  );
}

const capabilities = [
  { title: "Overflow coverage", text: "Answer when the office line rolls over or your crew is tied up.", position: "12% center" },
  { title: "After-hours intake", text: "Capture urgent context after the dispatcher clocks out.", position: "39% center" },
  { title: "Qualified booking", text: "Gather the right job details before offering an approved time.", position: "67% center" },
  { title: "Human escalation", text: "Transfer high-risk or unclear calls instead of guessing.", position: "91% center" },
];

function Capabilities() {
  const [active, setActive] = useState(0);
  return (
    <section className="section capabilities-section">
      <div className="shell">
        <Reveal className="capabilities-heading">
          <h2>You do not get another platform to babysit.</h2>
          <p>FieldRelay is installed, tested, and reviewed around one job: recovering calls your team cannot take.</p>
        </Reveal>
        <ul className="capability-accordion" aria-label="System capabilities">
          {capabilities.map((capability, index) => (
            <motion.li
              key={capability.title}
              className={`capability-slice ${active === index ? "is-active" : ""}`}
              tabIndex={0}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              animate={{ flexGrow: active === index ? 3.5 : 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="capability-image" style={{ backgroundPosition: capability.position }} aria-hidden="true" />
              <div className="capability-overlay" aria-hidden="true" />
              <div className="capability-copy">
                <h3>{capability.title}</h3>
                <p>{capability.text}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const controlColumns = [
  {
    title: "You decide",
    items: [
      ["Service boundaries", "Where and what your team will service."],
      ["Pricing rules", "What may be quoted and what must wait."],
      ["Dispatch priority", "Which jobs, callers, and windows come first."],
      ["Human threshold", "When the system must stop and transfer."],
    ],
  },
  {
    title: "FieldRelay manages",
    items: [
      ["Overflow answer", "Coverage when staff or crews cannot pick up."],
      ["Structured intake", "Caller, issue, address, urgency, and context."],
      ["Emergency routing", "Approved escalation paths without improvising."],
      ["Transcript review", "Real conversations used to tighten the playbook."],
    ],
  },
];

function HumanHandoff() {
  return (
    <section className="handoff-section">
      <div className="handoff-media">
        <Image
          src="/fieldrelay/06-handoff.webp"
          alt="Dispatcher and field technician coordinating a sensitive service call"
          fill
          sizes="100vw"
        />
      </div>
      <div className="handoff-scrim" aria-hidden="true" />
      <div className="shell handoff-shell">
        <Reveal className="handoff-copy">
          <h2>Routine intake stays fast. Judgment stays human.</h2>
          <p>
            The system handles repeatable questions and approved bookings. Emergencies, uncertainty, and sensitive conversations move to a person.
          </p>
        </Reveal>
        <div className="control-ledger">
          {controlColumns.map((column, columnIndex) => (
            <Reveal className="control-column" key={column.title} delay={columnIndex * 0.08}>
              <h3>{column.title}</h3>
              <div>
                {column.items.map(([title, text]) => (
                  <article key={title}>
                    <ShieldCheck aria-hidden="true" weight="duotone" />
                    <div><strong>{title}</strong><p>{text}</p></div>
                  </article>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const offerQuestions = [
  ["Do we need to replace our phone number?", "Usually not. The audit checks your current phone setup first, then recommends the least disruptive routing method."],
  ["Will the system quote prices?", "Only from rules you explicitly approve. Unapproved estimates remain prohibited by default."],
  ["What happens when a caller is unclear or upset?", "The system follows the agreed escalation path and moves the conversation to a person when judgment is required."],
  ["Does it work with our booking software?", "Compatibility is verified during the audit. No integration is promised until the required workflow has been tested."],
  ["What is included in the free audit?", "A coverage-gap estimate, a map of your current call path, and the first recovery point worth fixing."],
];

function FoundingOffer() {
  return (
    <section className="section offer-section" id="offer">
      <div className="offer-macro" aria-hidden="true">
        <Image src="/fieldrelay/07-offer.webp" alt="" fill sizes="(max-width: 900px) 100vw, 54vw" />
      </div>
      <div className="shell offer-shell">
        <div className="offer-layout">
          <Reveal className="offer-intro">
            <p className="context-label">One founding offer</p>
            <h2>14-Day Missed-Call Recovery System</h2>
            <p>
              A focused launch for the first two residential HVAC or plumbing companies ready to put a managed recovery layer into operation.
            </p>
            <div className="offer-pricing" aria-label="Offer pricing">
              <p><strong>$1,000</strong><span>setup</span></p>
              <p><strong>$750</strong><span>per month for 90 days</span></p>
              <small>Usage billed separately. Limited to the first two customers.</small>
            </div>
          </Reveal>
          <Reveal className="offer-card" delay={0.12}>
            <div className="offer-verbs" aria-label="Implementation activities">
              {[
                ["Audit", "Map call leakage, rules, and service boundaries."],
                ["Train", "Build the intake playbook from your real operation."],
                ["Test", "Run controlled scenarios and correct weak handoffs."],
                ["Go live", "Launch with review, monitoring, and documented ownership."],
              ].map(([verb, text]) => (
                <div key={verb}>
                  <strong>{verb}</strong>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            <div className="offer-guarantee">
              <Clock aria-hidden="true" weight="duotone" />
              <div>
                <strong>Operational launch guarantee</strong>
                <p>If the approved system is not live within 14 days of receiving required access and materials, setup work continues at no added fee until it is.</p>
              </div>
            </div>
            <MagneticLink href="#audit">Get my audit</MagneticLink>
          </Reveal>
        </div>
        <Reveal className="offer-faq">
          <div className="offer-faq-heading">
            <h3>Questions owners ask before forwarding a call.</h3>
            <p>Plain answers. Unknowns get tested during the audit, not hidden inside a sales promise.</p>
          </div>
          <div className="offer-questions">
            {offerQuestions.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}<span aria-hidden="true">+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

type FormStatus = { kind: "idle" | "loading" | "success" | "error"; message?: string };

function AuditForm() {
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setStatus({ kind: "loading" });

    const formData = new FormData(form);
    const params = new URLSearchParams(window.location.search);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      company: formData.get("company"),
      website: formData.get("website") || undefined,
      monthlyCalls: formData.get("monthlyCalls"),
      currentSystem: formData.get("currentSystem") || undefined,
      challenge: formData.get("challenge"),
      consent: formData.get("consent") === "on",
      companyFax: formData.get("companyFax") || undefined,
      startedAt,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
    };

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setStatus({ kind: "error", message: result.error || "We could not send your request. Please try again." });
        return;
      }
      setStatus({ kind: "success", message: "Your audit request is in. We will review the operation and follow up by email." });
      form.reset();
      setStartedAt(Date.now());
    } catch {
      setStatus({ kind: "error", message: "The audit line is temporarily unavailable. Your details were not submitted." });
    }
  }

  return (
    <>
      <form className="audit-form" onSubmit={handleSubmit} noValidate={false}>
        <div className="form-grid">
          <label><span>Name</span><input name="name" autoComplete="name" required minLength={2} /></label>
          <label><span>Work email</span><input name="email" type="email" autoComplete="email" required /></label>
          <label><span>Company</span><input name="company" autoComplete="organization" required minLength={2} /></label>
          <label><span>Website <small>optional</small></span><input name="website" inputMode="url" placeholder="yourcompany.com" /></label>
          <label>
            <span>Monthly call volume</span>
            <select name="monthlyCalls" required defaultValue="">
              <option value="" disabled>Select a range</option>
              <option value="under-50">Under 50</option>
              <option value="50-149">50 to 149</option>
              <option value="150-299">150 to 299</option>
              <option value="300-plus">300 or more</option>
            </select>
          </label>
          <label><span>Current phone or booking system <small>optional</small></span><input name="currentSystem" placeholder="What handles calls today?" /></label>
          <label className="form-span">
            <span>Primary call-handling problem</span>
            <select name="challenge" required defaultValue="">
              <option value="" disabled>Select the closest match</option>
              <option value="missed-calls">Missed calls during the day</option>
              <option value="after-hours">After-hours coverage</option>
              <option value="slow-follow-up">Slow lead follow-up</option>
              <option value="unsure">Not sure where calls are leaking</option>
            </select>
          </label>
        </div>
        <label className="honeypot" aria-hidden="true">
          Company fax
          <input name="companyFax" tabIndex={-1} autoComplete="off" />
        </label>
        <label className="consent-row">
          <input name="consent" type="checkbox" required />
          <span>I agree to be contacted about this audit. No lists, no resale.</span>
        </label>
        <div className="form-submit-row">
          <button className="button button-primary" type="submit" disabled={status.kind === "loading"}>
            {status.kind === "loading" ? <SpinnerGap className="spin" aria-hidden="true" /> : null}
            <span>Get my audit</span>
            {status.kind !== "loading" ? <ArrowRight aria-hidden="true" weight="bold" /> : null}
          </button>
          <button type="button" className="data-use-link" onClick={() => dialogRef.current?.showModal()}>
            How we use your data
          </button>
        </div>
        <div className={`form-status ${status.kind}`} role="status" aria-live="polite">
          {status.kind === "success" ? <Check aria-hidden="true" weight="bold" /> : null}
          {status.kind === "error" ? <WarningCircle aria-hidden="true" weight="bold" /> : null}
          {status.message}
        </div>
      </form>

      <dialog ref={dialogRef} className="data-dialog" aria-labelledby="data-dialog-title">
        <button className="dialog-close" aria-label="Close data-use dialog" onClick={() => dialogRef.current?.close()}>
          <X aria-hidden="true" />
        </button>
        <ShieldCheck aria-hidden="true" weight="duotone" />
        <h2 id="data-dialog-title">A short data-use note</h2>
        <p>We use the details you submit only to review your call-handling operation and contact you about the audit. The form forwards data to the configured private webhook and does not create a public profile.</p>
        <p>If the webhook is not configured or cannot be reached, the form reports the error and does not pretend your request succeeded.</p>
        <button className="button button-secondary" onClick={() => dialogRef.current?.close()}>Understood</button>
      </dialog>
    </>
  );
}

function ClosingAudit() {
  return (
    <section className="audit-section" id="audit">
      <div className="audit-image" aria-hidden="true">
        <Image src="/fieldrelay/08-audit.webp" alt="" fill sizes="(max-width: 900px) 100vw, 48vw" />
      </div>
      <div className="shell audit-shell">
        <div className="audit-layout">
          <Reveal className="audit-heading">
            <h2>Get a human-reviewed missed-call leak audit.</h2>
            <p>Receive a coverage-gap estimate, call-path map, and recommended first fix built from your operation.</p>
            <div className="audit-deliverables" aria-label="Audit deliverables">
              <p><Check aria-hidden="true" weight="bold" /><span>Where calls leak</span></p>
              <p><Check aria-hidden="true" weight="bold" /><span>What recovery may be worth</span></p>
              <p><Check aria-hidden="true" weight="bold" /><span>What to install first</span></p>
            </div>
          </Reveal>
          <AuditForm />
        </div>
        <footer className="footer">
          <div>
            <strong>FieldRelay <span className="product-endorsement">by PrimeArcTech</span></strong>
            <p>Managed missed-call recovery for residential HVAC and plumbing companies.</p>
          </div>
          <div className="footer-links">
            <a href={EVIDENCE_LINKS.invoca} target="_blank" rel="noreferrer">Invoca source <ArrowUpRight aria-hidden="true" /></a>
            <a href={EVIDENCE_LINKS.serviceTitan} target="_blank" rel="noreferrer">ServiceTitan source <ArrowUpRight aria-hidden="true" /></a>
            <a href="/security">Security</a>
            <a href="/privacy">Privacy</a>
            <a href={`mailto:${BUSINESS_CONTACT.email}`}>Email</a>
            <a href={BUSINESS_CONTACT.whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
          <p className="footer-note"><a href={`tel:${BUSINESS_CONTACT.phoneHref}`}>{BUSINESS_CONTACT.phoneDisplay}</a><br />{BUSINESS_CONTACT.location}<br />© {new Date().getFullYear()} PrimeArcTech. FieldRelay is a product by PrimeArcTech.</p>
        </footer>
      </div>
    </section>
  );
}

function MobileAuditBar() {
  return (
    <aside className="mobile-audit-bar" aria-label="Request a missed-call audit">
      <span>Find the leak in your call flow</span>
      <a href="#audit">Get my audit <ArrowRight aria-hidden="true" weight="bold" /></a>
    </aside>
  );
}

export function FieldRelayPage() {
  return (
    <>
      <a className="fr-skip" href="#main">Skip to content</a>
      <Hero />
      <main id="main">
        <Evidence />
        <RevenueCalculator />
        <CallJourney />
        <Capabilities />
        <HumanHandoff />
        <FoundingOffer />
        <ClosingAudit />
        <MobileAuditBar />
      </main>
    </>
  );
}
