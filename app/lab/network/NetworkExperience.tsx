"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { BEATS, INPUT_CHIPS, LAYER_CALLOUTS, LOSS_STATS, NAV, PRODUCTS, copyMotion, type Beat } from "./engine/copy";
import { createNetwork, type FrameState, type NetworkHandle } from "./engine/createNetwork";
import "./network.css";

const STILLS = [
  { src: "/network/stills/t06.png", id: "hero" },
  { src: "/network/stills/t15.png", id: "input" },
  { src: "/network/stills/t24.png", id: "layers" },
  { src: "/network/stills/t34.png", id: "attention" },
  { src: "/network/stills/t44.png", id: "loss" },
  { src: "/network/stills/t52.png", id: "embedding" },
  { src: "/network/stills/t60.png", id: "book" },
] as const;

const StageLabels = memo(function StageLabels({
  onDive,
}: {
  onDive: (id: string) => void;
}) {
  return (
    <>
      <div className="net-callouts">
        {LAYER_CALLOUTS.map((callout) => (
          <div key={callout.id} className="net-callout" data-anchor={callout.id} data-hidden="1">
            <span>{callout.index}</span>
            <b>{callout.label}</b>
          </div>
        ))}
      </div>
      <div className="net-products">
        {PRODUCTS.map((product) => (
          <div key={product.id} className="net-product" data-anchor={product.id} data-hidden="1">
            <small>{product.name}</small>
            <strong>{product.name}</strong>
            <span>{product.line}</span>
            <span>{product.proof}</span>
            {product.proofPlaceholder ? <span className="net-tag">placeholder</span> : null}
            <button type="button" onClick={() => onDive(product.id)}>
              Dive
            </button>
            <Link href={product.href}>Open</Link>
          </div>
        ))}
      </div>
    </>
  );
});

export function NetworkExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sandRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<NetworkHandle | null>(null);
  const beatId = useRef("loader");
  const copyRef = useRef<HTMLElement>(null);
  const introRef = useRef(true);
  const epochRef = useRef(false);
  const diveRef = useRef<string | null>(null);
  const progressRef = useRef(0);
  const [beat, setBeat] = useState<Beat>(BEATS[0]);
  const [intro, setIntro] = useState(true);
  const [epoch, setEpoch] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [sound, setSound] = useState(false);
  const [dive, setDive] = useState<string | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const params = new URLSearchParams(window.location.search);
    const shot = params.get("shot") === "1";
    if (shot && params.get("ui") !== "1") root.setAttribute("data-shot", "true");
    const pending = params.get("product");
    let opened = false;
    let alive = true;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const move = (event: PointerEvent) => {
      const cursor = cursorRef.current;
      if (!cursor || !fine) return;
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    };
    window.addEventListener("pointermove", move);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleRef.current?.cancelDive();
    };
    window.addEventListener("keydown", onKey);

    const unlock = () => handleRef.current?.audio.unlock();
    window.addEventListener("pointerdown", unlock);

    const boot = async () => {
      const handle = await createNetwork({
        canvas,
        onFrame: (state: FrameState) => {
          if (!alive) return;
          if (sandRef.current) sandRef.current.style.opacity = String(state.sand);
          if (barRef.current) barRef.current.style.width = `${Math.round(state.progress * 100)}%`;
          const placed = new Set(state.anchors.filter((anchor) => anchor.visible).map((anchor) => anchor.id));
          root.querySelectorAll<HTMLElement>("[data-anchor]").forEach((node) => {
            const id = node.dataset.anchor || "";
            const anchor = state.anchors.find((item) => item.id === id);
            node.dataset.hidden = placed.has(id) ? "0" : "1";
            if (!anchor) return;
            node.style.left = `${Math.round(anchor.x)}px`;
            node.style.top = `${Math.round(anchor.y)}px`;
          });
          if (state.fallback) {
            root.setAttribute("data-fallback", "true");
            setFallback(true);
            introRef.current = false;
            setIntro(false);
          }
          if (state.intro !== introRef.current) {
            introRef.current = state.intro;
            setIntro(state.intro);
          }
          if (state.epoch !== epochRef.current) {
            epochRef.current = state.epoch;
            setEpoch(state.epoch);
          }
          if (state.dive !== diveRef.current) {
            diveRef.current = state.dive;
            setDive(state.dive);
          }
          if (Math.abs(state.progress - progressRef.current) > 0.01) {
            progressRef.current = state.progress;
          }
          const motion = copyMotion(state.intro ? 0 : state.t);
          const copy = copyRef.current;
          if (copy) {
            copy.dataset.place = motion.beat.id;
            copy.style.opacity = state.intro ? "0" : String(motion.opacity);
            copy.style.transform = `translate3d(0, ${state.intro ? 24 : motion.y}px, 0)`;
          }
          root.dataset.intro = state.intro ? "1" : "0";
          root.dataset.beat = state.intro ? "loader" : motion.beat.id;
          root.dataset.epoch = state.epoch ? "1" : "0";
          if (motion.beat.id !== beatId.current && !state.intro) {
            beatId.current = motion.beat.id;
            setBeat(motion.beat);
          }
          if (!state.intro && pending && !opened && handleRef.current) {
            opened = true;
            handleRef.current.scrollToTime(34);
            handleRef.current.dive(pending);
          }
        },
      });
      if (!alive) {
        handle?.dispose();
        return;
      }
      handleRef.current = handle;
      const stored = window.localStorage.getItem("network-sound") === "on";
      if (stored) setSound(true);
      if (stored && handle) handle.audio.setEnabled(true);
    };
    void boot();

    return () => {
      alive = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock);
      handleRef.current?.dispose();
    };
  }, []);

  const onDive = useCallback((id: string) => {
    handleRef.current?.dive(id);
    handleRef.current?.audio.cue("click");
  }, []);

  const go = (t: number) => {
    handleRef.current?.scrollToTime(t);
    handleRef.current?.audio.cue("click");
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    const audio = handleRef.current?.audio;
    audio?.setEnabled(next);
    audio?.unlock();
    if (next) audio?.cue("ambient");
  };

  return (
    <div className="net" ref={rootRef} data-intro="1" data-beat="loader" data-fallback={fallback ? "true" : undefined}>
      <div className="net-spacer" data-network-spacer="" />
      <canvas ref={canvasRef} className="net-canvas" aria-hidden={fallback} />
      <div ref={sandRef} className="net-sand" />
      <div ref={cursorRef} className="net-cursor" aria-hidden="true" />

      <header className="net-nav">
        <Link className="net-mark" href="/">
          PrimeArc
        </Link>
        <ul className="net-links">
          {NAV.map((item) => (
            <li key={item.id}>
              <button type="button" data-on={beat.id === item.id} onClick={() => go(item.t)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="net-nav-end">
          <button type="button" className="net-sound" aria-pressed={sound} onClick={toggleSound}>
            Sound {sound ? "on" : "off"}
          </button>
          <Link className="net-cta" href="/build-brief">
            Get free AI audit
          </Link>
        </div>
      </header>

      <section className="net-copy" ref={copyRef} data-place={beat.id} data-side={beat.side} aria-live="polite">
        <p className="net-kicker">{beat.kicker}</p>
        {beat.h1 ? <h1>{beat.title}</h1> : <h2>{beat.title}</h2>}
        {beat.body ? <p>{beat.body}</p> : null}
        {beat.placeholder ? <span className="net-tag">placeholder</span> : null}
        {beat.id === "input" ? (
          <div className="net-chips">
            {INPUT_CHIPS.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        ) : null}
        {beat.id === "loss" ? (
          <dl className="net-stats">
            {LOSS_STATS.map((stat) => (
              <div className="net-stat" key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>
                  {stat.value}
                  {stat.placeholder ? " ·" : ""}
                </dd>
              </div>
            ))}
            <span className="net-tag">placeholder</span>
          </dl>
        ) : null}
      </section>

      <StageLabels onDive={onDive} />

      <footer className="net-foot">
        <span className="net-kicker">PrimeArc</span>
        <nav className="net-legal" aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/security">Security</Link>
        </nav>
      </footer>

      {epoch ? (
        <div className="net-epoch">
          <p>00 / Hero · Epoch 02</p>
        </div>
      ) : null}

      {intro && !fallback ? (
        <div className="net-boot" role="status">
          <p className="net-kicker">00 — Boot</p>
          <h2>initialising layer 1/4…</h2>
          <div className="net-bar" aria-hidden="true">
            <span ref={barRef} />
          </div>
        </div>
      ) : null}

      {dive ? (
        <button type="button" className="net-skip" onClick={() => handleRef.current?.skipDive()}>
          Skip
        </button>
      ) : null}

      {fallback ? (
        <div className="net-fallback">
          <p className="net-kicker">Still frames</p>
          <h1>We build AI systems that complete real work.</h1>
          <p>The live world needs WebGL2. These are the animatic beats.</p>
          <Link className="net-cta" href="/build-brief">
            Get free AI audit
          </Link>
          {STILLS.map((still) => {
            const copy = BEATS.find((item) => item.id === still.id);
            return (
              <figure key={still.src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={still.src} alt={copy?.title || "Network still"} />
                <figcaption>
                  <p className="net-kicker">{copy?.kicker}</p>
                  <h2>{copy?.title}</h2>
                  {copy?.body ? <p>{copy.body}</p> : null}
                  {copy?.placeholder ? <span className="net-tag">placeholder</span> : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
