"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { BEATS, LAYER_CALLOUTS, LOSS_STATS, NAV, PRODUCTS, beatBias, copyMotion, type Beat } from "./engine/copy";
import { createNetwork, type FrameState, type NetworkHandle } from "./engine/createNetwork";
import { clampLabel, intersections, largestEmptyRect, minInkContrast, relativeLuminance, type Rect } from "./engine/safe";
import "./network.css";

const HERO_BEAT = BEATS.find((item) => item.id === "hero") ?? BEATS[0];
const LABEL_GAP = 50;

let pixelBuf = new Uint8Array(0);

/** Darkest canvas pixel under a copy block. An 8px stride still hits a clay wedge the old 6×4 grid stepped over. */
function readGrid(canvas: HTMLCanvasElement, rect: Rect): [number, number, number][] {
  const gl = canvas.getContext("webgl2");
  const cssW = rect.x1 - rect.x0;
  const cssH = rect.y1 - rect.y0;
  if (!gl || cssW < 4 || cssH < 4) return [];
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  const scaleY = canvas.height / Math.max(1, canvas.clientHeight);
  let x0 = Math.floor(rect.x0 * dpr);
  let x1 = Math.ceil(rect.x1 * dpr);
  let y0 = Math.floor((canvas.clientHeight - rect.y1) * scaleY);
  let y1 = Math.ceil((canvas.clientHeight - rect.y0) * scaleY);
  x0 = Math.max(0, Math.min(canvas.width - 1, x0));
  x1 = Math.max(x0 + 1, Math.min(canvas.width, x1));
  y0 = Math.max(0, Math.min(canvas.height - 1, y0));
  y1 = Math.max(y0 + 1, Math.min(canvas.height, y1));
  const pw = x1 - x0;
  const ph = y1 - y0;
  const need = pw * ph * 4;
  if (pixelBuf.length < need) pixelBuf = new Uint8Array(need);
  gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);
  const step = Math.max(1, Math.round(8 * dpr));
  let bestL = 2;
  let best: [number, number, number] = [228, 216, 196];
  const consider = (col: number, row: number) => {
    const i = (row * pw + col) * 4;
    const rgb: [number, number, number] = [pixelBuf[i], pixelBuf[i + 1], pixelBuf[i + 2]];
    const luma = relativeLuminance(rgb[0], rgb[1], rgb[2]);
    if (luma < bestL) {
      bestL = luma;
      best = rgb;
    }
  };
  for (let row = 0; row < ph; row += step) {
    for (let col = 0; col < pw; col += step) consider(col, row);
  }
  consider(0, 0);
  consider(pw - 1, 0);
  consider(0, ph - 1);
  consider(pw - 1, ph - 1);
  return [best];
}

function sandPixel(buf: Uint8Array): boolean {
  return buf[0] > 190 && buf[1] > 170 && buf[2] > 145 && buf[0] - buf[2] < 80;
}

/** The visible right edge of a block, whether the projected corner sits in clay or in the gap past it. */
function clayEdge(canvas: HTMLCanvasElement, x1: number, y: number): number {
  const gl = canvas.getContext("webgl2");
  if (!gl) return x1;
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  const py = Math.min(canvas.height - 1, Math.max(0, Math.floor((canvas.clientHeight - y) * dpr)));
  const buf = new Uint8Array(4);
  const at = (x: number) => {
    const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(x * dpr)));
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return sandPixel(buf);
  };
  let x = Math.min(canvas.clientWidth - 1, Math.max(0, Math.floor(x1)));
  if (at(x)) {
    const stop = Math.max(0, x - 240);
    while (x > stop && at(x)) x -= 3;
    return x;
  }
  const stop = Math.min(canvas.clientWidth - 1, x + 240);
  while (x < stop && !at(x + 3)) x += 3;
  return x;
}

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
            <span className="net-idx">{callout.index}</span>
            <span className="net-call">{callout.label}</span>
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
          const canvasEl = canvasRef.current;
          const labelBoxes: Rect[] = [];
          let focusBox: Rect | null = null;
          const labelNodes = [...root.querySelectorAll<HTMLElement>("[data-anchor]")];
          labelNodes.sort((a, b) => {
            const af = placed.find((item) => item.id === a.dataset.anchor)?.focus ? 1 : 0;
            const bf = placed.find((item) => item.id === b.dataset.anchor)?.focus ? 1 : 0;
            return bf - af;
          });
          labelNodes.forEach((node) => {
            const id = node.dataset.anchor || "";
            const anchor = placed.find((item) => item.id === id);
            node.dataset.hidden = anchor ? "0" : "1";
            if (!anchor) return;
            const leader = node.querySelector<HTMLElement>(".net-leader");
            if (node.dataset.kind === "callout") {
              const mid = (anchor.y0 + anchor.y1) / 2;
              const edge = canvasEl ? clayEdge(canvasEl, anchor.x1, mid) : anchor.x1;
              const left = edge + LABEL_GAP;
              const labelW = 112;
              if (left + labelW > window.innerWidth - 16) {
                node.dataset.hidden = "1";
                return;
              }
              node.style.left = `${Math.round(left)}px`;
              node.style.top = `${Math.round(mid)}px`;
              if (leader) leader.style.width = `${LABEL_GAP}px`;
              labelBoxes.push({ x0: edge, y0: mid - 14, x1: left + labelW, y1: mid + 14 });
            } else {
              const focusedAnchor = placed.find((item) => item.focus);
              const crowded = Boolean(
                !anchor.focus &&
                  focusedAnchor &&
                  Math.abs(anchor.y - focusedAnchor.y) < 150 &&
                  Math.abs(anchor.x - focusedAnchor.x) < 220,
              );
              const body = node.querySelector<HTMLElement>(".net-product-body");
              const want = anchor.focus ? Math.min(240, window.innerWidth - 32) : 108;
              node.style.left = `${Math.round(anchor.x)}px`;
              node.style.top = `${Math.round(anchor.y)}px`;
              const guessed = clampLabel(anchor.x, anchor.y, want, anchor.focus ? 120 : 16, window.innerWidth, window.innerHeight, anchor.focus, crowded);
              if (body) body.style.width = `${Math.round(guessed.width)}px`;
              const height = body?.offsetHeight || (anchor.focus ? 108 : 14);
              let box = clampLabel(anchor.x, anchor.y, guessed.width, height, window.innerWidth, window.innerHeight, anchor.focus, crowded);
              if (!anchor.focus && focusBox && box.top < focusBox.y1 + 8 && box.top + height > focusBox.y0 - 8) {
                const shifted = box.top >= (focusBox.y0 + focusBox.y1) / 2 ? focusBox.y1 + 10 : focusBox.y0 - height - 10;
                box = { ...box, top: Math.max(52, Math.min(shifted, window.innerHeight - 16 - height)) };
              }
              if (anchor.focus) focusBox = { x0: box.left, y0: box.top, x1: box.left + box.width, y1: box.top + height };
              node.dataset.focus = anchor.focus ? "1" : "0";
              node.dataset.flip = box.flip ? "1" : "0";
              node.dataset.placed = "1";
              node.dataset.rise = box.top + 8 < anchor.y - height * 0.2 ? "1" : "0";
              if (body) {
                body.style.left = `${Math.round(box.left - anchor.x)}px`;
                body.style.top = `${Math.round(box.top - anchor.y)}px`;
                body.style.width = `${Math.round(box.width)}px`;
              }
              if (leader) {
                leader.style.width = anchor.focus ? `${Math.max(8, Math.round(box.leader))}px` : "0px";
                leader.style.top = "0px";
              }
              labelBoxes.push({ x0: box.left - 8, y0: box.top - 4, x1: box.left + box.width + 8, y1: box.top + height + 4 });
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
            const narrow = window.innerWidth <= 760;
            const blocks: Rect[] = state.obstacles.map((item) => ({ x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1 }));
            blocks.push(...labelBoxes);
            const nav = root.querySelector<HTMLElement>(".net-nav");
            const padTop = (nav?.offsetHeight || 64) + 10;
            const padBottom = liveBeat.id === "book" ? 64 : 16;
            copy.dataset.place = liveBeat.id;
            let x = 16;
            let y = padTop;
            let prefer = Math.min(liveBeat.id === "layers" ? 640 : 520, window.innerWidth - 32);
            let band = false;
            if (narrow && liveBeat.id === "layers") {
              prefer = window.innerWidth - 32;
              band = true;
              copy.style.width = `${Math.round(prefer)}px`;
              const height = copy.offsetHeight || 120;
              x = 16;
              y = Math.max(padTop, window.innerHeight - 16 - height);
            } else {
              const empty = largestEmptyRect(window.innerWidth, window.innerHeight, blocks, padTop, padBottom);
              const bias = beatBias(liveBeat.id);
              const comfortable = Math.min(liveBeat.id === "layers" ? 640 : 520, window.innerWidth - 24);
              const gap = Math.max(0, empty.x1 - empty.x0 - 32);
              prefer = Math.min(comfortable, Math.max(narrow ? 160 : 220, gap));
              copy.style.width = `${Math.round(prefer)}px`;
              const height = copy.offsetHeight || 160;
              x = bias === "end" ? empty.x1 - 16 - prefer : empty.x0 + 16;
              y = bias === "bottom" ? empty.y1 - 16 - height : empty.y0 + 16;
              if (narrow && liveBeat.id === "hero") y = Math.max(y, window.innerHeight * 0.56);
              x = Math.max(16, Math.min(x, window.innerWidth - prefer - 16));
              y = Math.max(padTop, Math.min(y, Math.max(padTop, window.innerHeight - height - padBottom)));
            }
            let height = copy.offsetHeight || 160;
            if (band) y = Math.max(padTop, window.innerHeight - 16 - height);
            const hitsFor = (rect: Rect) => intersections(rect, state.obstacles, 80);
            copy.style.width = `${Math.round(prefer)}px`;
            copy.style.left = `${Math.round(x)}px`;
            copy.style.top = `${Math.round(y)}px`;
            copy.style.right = "auto";
            copy.style.bottom = "auto";
            copy.style.transform = posterOn ? "none" : `translate3d(0, ${motion.y}px, 0)`;
            const box = copy.getBoundingClientRect();
            let copyRect = { x0: box.left, y0: box.top, x1: box.right, y1: box.bottom };
            let samples = posterOn || !canvasEl ? [] : readGrid(canvasEl, copyRect);
            let contrast = minInkContrast(samples, false);
            let scrim = contrast < 4.5;
            if (!posterOn && !band && liveBeat.id !== "hero" && contrast < 4.5 && canvasEl) {
              const skyW = narrow ? window.innerWidth - 32 : Math.min(prefer, window.innerWidth - 32);
              copy.style.width = `${Math.round(skyW)}px`;
              const skyH = copy.offsetHeight || height;
              const sky = { x0: 16, y0: padTop, x1: 16 + skyW, y1: padTop + skyH };
              const skySamples = readGrid(canvasEl, sky);
              const skyContrast = minInkContrast(skySamples, false);
              if (skyContrast >= 4.5) {
                x = 16;
                prefer = skyW;
                y = padTop;
                height = skyH;
                copyRect = sky;
                samples = skySamples;
                contrast = skyContrast;
                scrim = false;
                band = false;
              } else {
                copy.style.width = `${Math.round(prefer)}px`;
                scrim = true;
                contrast = minInkContrast(samples, true);
              }
            }
            const hits = hitsFor(copyRect);
            if (!posterOn && !narrow && hits.length > 0) {
              scrim = true;
            }
            if (scrim) contrast = minInkContrast(samples.length ? samples : [[228, 216, 196]], true);
            copy.style.width = `${Math.round(prefer)}px`;
            copy.style.left = `${Math.round(x)}px`;
            copy.style.top = `${Math.round(y)}px`;
            copy.dataset.place = liveBeat.id;
            copy.dataset.band = band ? "1" : "0";
            copy.dataset.scrim = scrim ? "1" : "0";
            copy.style.opacity = posterOn ? "1" : String(motion.opacity);
            copy.style.transform = posterOn ? "none" : `translate3d(0, ${motion.y}px, 0)`;
            (window as Window & { __safe?: unknown }).__safe = {
              t: Number(state.t.toFixed(2)),
              beat: liveBeat.id,
              scrim,
              contrast: Number(contrast.toFixed(2)),
              band,
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
