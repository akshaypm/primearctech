"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { BEATS, LAYER_CALLOUTS, LOSS_STATS, NAV, PRODUCTS, beatBias, copyMotion, type Beat } from "./engine/copy";
import { createNetwork, type FrameState, type NetworkHandle } from "./engine/createNetwork";
import { intersections, largestEmptyRect, type Rect } from "./engine/safe";
import "./network.css";

const HERO_BEAT = BEATS.find((item) => item.id === "hero") ?? BEATS[0];

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
          <div key={callout.id} className="net-callout" data-anchor={callout.id} data-kind="callout" data-hidden="1">
            <span className="net-leader" />
            {callout.index}&nbsp;&nbsp;{callout.label}
          </div>
        ))}
      </div>
      <div className="net-products">
        {PRODUCTS.map((product) => (
          <div key={product.id} className="net-product" data-anchor={product.id} data-kind="product" data-hidden="1" data-focus="0">
            <span className="net-leader" />
            <div className="net-product-body">
              <p className="net-name">{product.name}</p>
              <p className="net-line">{product.line}</p>
              <button type="button" className="net-enter" onClick={() => onDive(product.id)}>
                Enter →
              </button>
            </div>
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
  const cursorRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<NetworkHandle | null>(null);
  const beatId = useRef("hero");
  const copyRef = useRef<HTMLElement>(null);
  const epochRef = useRef(false);
  const diveRef = useRef<string | null>(null);
  const progressRef = useRef(0);
  const [beat, setBeat] = useState<Beat>(HERO_BEAT);
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
      if (!cursor || !fine || event.pointerType === "touch") return;
      root.dataset.cursor = "1";
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
          const placed = state.anchors.filter((anchor) => anchor.visible);
          const calloutCol = placed.reduce((max, anchor) => Math.max(max, anchor.x1), 0) + 18;
          root.querySelectorAll<HTMLElement>("[data-anchor]").forEach((node) => {
            const id = node.dataset.anchor || "";
            const anchor = placed.find((item) => item.id === id);
            node.dataset.hidden = anchor ? "0" : "1";
            if (!anchor) return;
            const leader = node.querySelector<HTMLElement>(".net-leader");
            if (node.dataset.kind === "callout") {
              const mid = (anchor.y0 + anchor.y1) / 2;
              const labelW = 96;
              if (calloutCol + labelW > window.innerWidth - 8) {
                node.dataset.hidden = "1";
                return;
              }
              node.style.left = `${Math.round(calloutCol)}px`;
              node.style.top = `${Math.round(mid)}px`;
              if (leader) leader.style.width = `${Math.max(8, Math.round(calloutCol - anchor.x1))}px`;
            } else {
              const focused = placed.find((item) => item.focus);
              const crowded =
                !anchor.focus &&
                focused &&
                Math.abs(anchor.y - focused.y) < 150 &&
                Math.abs(anchor.x - focused.x) < 220;
              const flip = crowded ? true : anchor.x > window.innerWidth * 0.62;
              const rise = anchor.focus && anchor.y > window.innerHeight - 170;
              node.style.left = `${Math.round(anchor.x)}px`;
              node.style.top = `${Math.round(anchor.y)}px`;
              node.dataset.focus = anchor.focus ? "1" : "0";
              node.dataset.flip = flip ? "1" : "0";
              node.dataset.rise = rise ? "1" : "0";
              if (leader) leader.style.width = anchor.focus ? "36px" : "0px";
            }
          });
          if (posterRef.current) posterRef.current.style.opacity = String(state.poster);
          root.dataset.poster = state.poster > 0.02 ? "1" : "0";
          if (state.fallback) {
            root.setAttribute("data-fallback", "true");
            setFallback(true);
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
          const motion = copyMotion(state.t);
          const copy = copyRef.current;
          const posterOn = state.poster > 0.02 && state.beatId === "hero";
          if (copy) {
            const liveBeat = posterOn ? HERO_BEAT : motion.beat;
            const blocks: Rect[] = state.obstacles.map((item) => ({ x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1 }));
            if (state.beatId === "layers") {
              for (const anchor of placed) {
                const mid = (anchor.y0 + anchor.y1) / 2;
                blocks.push({ x0: anchor.x1, y0: mid - 14, x1: calloutCol + 140, y1: mid + 14 });
              }
            }
            if (state.beatId === "attention") {
              for (const anchor of placed) {
                const flip = anchor.x > window.innerWidth * 0.62;
                const w = anchor.focus ? Math.min(256, window.innerWidth * 0.7) : 108;
                const h = anchor.focus ? 118 : 18;
                const x0 = flip ? anchor.x - 22 - w : anchor.x;
                const y0 = anchor.y - (anchor.focus ? 46 : 9);
                blocks.push({ x0, y0, x1: x0 + w + 22, y1: y0 + h });
              }
            }
            const nav = root.querySelector<HTMLElement>(".net-nav");
            const padTop = (nav?.offsetHeight || 64) + 10;
            const padBottom = liveBeat.id === "book" ? 64 : 16;
            const empty = largestEmptyRect(window.innerWidth, window.innerHeight, blocks, padTop, padBottom);
            const bias = beatBias(liveBeat.id);
            const comfortable = Math.min(liveBeat.id === "layers" ? 640 : 520, window.innerWidth - 24);
            const gap = Math.max(0, empty.x1 - empty.x0 - 32);
            const prefer = Math.min(comfortable, Math.max(220, gap));
            copy.style.width = `${Math.round(prefer)}px`;
            const height = copy.offsetHeight || 160;
            let x = bias === "end" ? empty.x1 - 16 - prefer : empty.x0 + 16;
            let y = bias === "bottom" ? empty.y1 - 16 - height : empty.y0 + 16;
            x = Math.max(12, Math.min(x, window.innerWidth - prefer - 12));
            y = Math.max(padTop, Math.min(y, Math.max(padTop, window.innerHeight - height - padBottom)));
            const copyRect = { x0: x, y0: y, x1: x + prefer, y1: y + height };
            const hits = intersections(copyRect, state.obstacles, 80);
            const scrim = hits.length > 0;
            copy.style.left = `${Math.round(x)}px`;
            copy.style.top = `${Math.round(y)}px`;
            copy.style.right = "auto";
            copy.style.bottom = "auto";
            copy.dataset.place = liveBeat.id;
            copy.dataset.scrim = scrim ? "1" : "0";
            copy.style.opacity = posterOn ? "1" : String(motion.opacity);
            copy.style.transform = posterOn ? "none" : `translate3d(0, ${motion.y}px, 0)`;
            (window as Window & { __safe?: unknown }).__safe = {
              t: Number(state.t.toFixed(2)),
              beat: liveBeat.id,
              scrim,
              nodes: state.obstacles.slice(0, 80).map((item) => `${item.name}:${Math.round(item.x0)}-${Math.round(item.x1)}`),
              anchors: state.anchors.map((anchor) => ({
                id: anchor.id,
                x: Math.round(anchor.x),
                y: Math.round(anchor.y),
                x0: Math.round(anchor.x0),
                x1: Math.round(anchor.x1),
                y0: Math.round(anchor.y0),
                y1: Math.round(anchor.y1),
                focus: anchor.focus,
                visible: anchor.visible,
              })),
              overlaps: hits.map((hit) => ({
                name: "name" in hit.block ? String((hit.block as { name?: string }).name || "") : "",
                area: Math.round(hit.area),
              })),
              x: Math.round(x),
              y: Math.round(y),
              w: Math.round(prefer),
              h: Math.round(height),
            };
          }
          root.dataset.intro = state.intro ? "1" : "0";
          root.dataset.beat = posterOn ? "hero" : motion.beat.id;
          root.dataset.epoch = state.epoch ? "1" : "0";
          if (motion.beat.id !== beatId.current && !posterOn) {
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
    <div className="net" ref={rootRef} data-intro="0" data-beat="hero" data-poster="1" data-fallback={fallback ? "true" : undefined}>
      <div className="net-spacer" data-network-spacer="" />
      <div className="net-poster" ref={posterRef}>
        <picture>
          <source media="(max-width: 760px)" srcSet="/network/poster/hero-828.avif" type="image/avif" />
          <source media="(max-width: 760px)" srcSet="/network/poster/hero-828.webp" type="image/webp" />
          <source srcSet="/network/poster/hero-1920.avif" type="image/avif" />
          <img src="/network/poster/hero-1920.webp" alt="" width={1920} height={1200} fetchPriority="high" />
        </picture>
      </div>
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
