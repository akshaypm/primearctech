"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAudio, type SwarmAudio } from "../swarm/engine/audio";
import {
  COPY_NOTE,
  CTA_HREF,
  CTA_LABEL,
  HERO_H1,
  SECTION_PLACEHOLDERS,
  SOUND_STORAGE_KEY,
  STILLS,
  bootLine,
} from "./engine/copy";
import { isCursorLabel, stepCursor, type CursorLabel, type CursorState } from "./engine/cursor";
import type { WorldHandle } from "./engine/createWorld";
import { BEATS, indexLabel } from "./engine/path";
import { scrollSpacerHeight, wrapScroll } from "./engine/scroll";
import "./network.css";

const ASSEMBLY_MS = 2400;

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function StillScenes({ onActive }: { onActive: (index: string, label: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sections = [...root.querySelectorAll<HTMLElement>("[data-label]")];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const section = visible?.target as HTMLElement | undefined;
        if (!section) return;
        onActive(section.dataset.index ?? "01", section.dataset.label ?? "HERO");
      },
      { threshold: [0.45, 0.6] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onActive]);

  return (
    <div className="net-stills" ref={rootRef}>
      {STILLS.map((still) => (
        <section className="net-still" data-index={still.index} data-label={still.label} key={still.id} id={still.id}>
          <img src={still.src} alt={still.alt} width={1440} height={900} decoding="async" fetchPriority={still.id === "hero" ? "high" : "low"} />
          {still.label === "HERO" ? (
            <div className="net-still-copy">
              <h1>{HERO_H1}</h1>
            </div>
          ) : (
            <p>{SECTION_PLACEHOLDERS[still.label]}</p>
          )}
        </section>
      ))}
    </div>
  );
}

export function NetworkExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<SwarmAudio | null>(null);
  const worldRef = useRef<WorldHandle | null>(null);
  const soundRef = useRef(false);
  const [phase, setPhase] = useState<"boot" | "live" | "still">("boot");
  const [sound, setSound] = useState(false);
  const [beat, setBeat] = useState("HERO");
  const [index, setIndex] = useState("01 / HERO");

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const audio = createAudio({ reducedMotion: reduce });
    audioRef.current = audio;
    if (window.localStorage.getItem(SOUND_STORAGE_KEY) === "on") {
      audio.setEnabled(true);
      queueMicrotask(() => setSound(true));
    }

    const unlock = (event: Event) => {
      const target = event.target;
      const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      if (element?.closest(".net-sound")) return;
      void audio.unlock();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    if (reduce || !webglAvailable()) {
      queueMicrotask(() => setPhase("still"));
      return () => {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        audio.dispose();
        audioRef.current = null;
      };
    }

    const canvas = canvasRef.current;
    const readout = readoutRef.current;
    const bar = barRef.current;
    const spacer = spacerRef.current;
    if (!canvas || !readout || !bar || !spacer) {
      return () => {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        audio.dispose();
        audioRef.current = null;
      };
    }

    let cancelled = false;
    let finished = false;
    let assetsReady = false;
    let assetProgress = 0;
    let bootRaf = 0;
    const bootStart = { t: performance.now() };
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    const fitSpacer = () => {
      spacer.style.height = `${scrollSpacerHeight(window.innerHeight)}px`;
    };
    fitSpacer();

    const finish = () => {
      if (finished || cancelled) return;
      finished = true;
      window.cancelAnimationFrame(bootRaf);
      worldRef.current?.setAssembly(1);
      worldRef.current?.reveal();
      if (soundRef.current) audio.onLock(1.05);
      setPhase("live");
      setBeat("HERO");
      setIndex("01 / HERO");
    };

    const boot = (now: number) => {
      const visual = Math.min(1, (now - bootStart.t) / ASSEMBLY_MS);
      const assembly = assetsReady ? visual : Math.min(visual, 0.88);
      worldRef.current?.setAssembly(assembly);
      bar.style.transform = `scaleX(${assetProgress.toFixed(4)})`;
      readout.textContent = bootLine(assetsReady ? visual : assetProgress);
      if (assetsReady && visual >= 1) finish();
    };

    const loop = (now: number) => {
      boot(now);
      if (!finished && !cancelled) bootRaf = window.requestAnimationFrame(loop);
    };

    const onReady = () => {
      assetsReady = true;
      assetProgress = 1;
      const elapsed = performance.now() - bootStart.t;
      if (elapsed > ASSEMBLY_MS - 420) bootStart.t = performance.now() - (ASSEMBLY_MS - 420);
    };

    const onScroll = () => {
      if (!finished) return;
      const wrapped = wrapScroll(window.scrollY, window.innerHeight);
      if (wrapped.wrapped) window.scrollTo(0, wrapped.scrollY);
      worldRef.current?.setProgress(wrapped.progress);
    };

    const skip = (event: Event) => {
      const target = event.target;
      const element = target instanceof Element ? target : null;
      if (element?.closest("a, button")) return;
      if (event instanceof KeyboardEvent && (event.metaKey || event.ctrlKey || event.altKey || event.key === "Tab")) return;
      if (!assetsReady) return;
      bootStart.t = performance.now() - ASSEMBLY_MS;
      boot(performance.now());
    };

    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", fitSpacer);
    bootRaf = window.requestAnimationFrame(loop);

    void import("./engine/createWorld").then(({ createWorld }) => {
      if (cancelled) return;
      const world = createWorld({
        canvas,
        audio,
        mobile: window.matchMedia("(max-width: 700px)").matches,
        motion: !reduce,
        onProgress: (value) => {
          assetProgress = value;
        },
        onReady,
        onBeat: (label) => {
          const next = BEATS.find((item) => item.label === label) ?? BEATS[0];
          setBeat(next.label);
          setIndex(indexLabel(next));
        },
        onFallback: () => {
          queueMicrotask(() => {
            worldRef.current?.dispose();
            worldRef.current = null;
            if (!cancelled) setPhase("still");
          });
        },
      });
      worldRef.current = world;
    }).catch(() => {
      if (!cancelled) setPhase("still");
    });

    return () => {
      cancelled = true;
      finished = true;
      window.cancelAnimationFrame(bootRaf);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", fitSpacer);
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "auto";
      worldRef.current?.dispose();
      worldRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cursor = cursorRef.current;
    const label = labelRef.current;
    if (!fine || !cursor || !label) return;

    let pointerX = window.innerWidth * 0.5;
    let pointerY = window.innerHeight * 0.42;
    let snap: { x: number; y: number; label: CursorLabel } | null = null;
    let state: CursorState = { x: pointerX, y: pointerY, label: null };
    let last = performance.now();
    let raf = 0;

    const place = (clientX: number, clientY: number) => {
      pointerX = clientX;
      pointerY = clientY;
      const hit = document.elementFromPoint(clientX, clientY);
      const target = hit?.closest<HTMLElement>("[data-cursor]");
      const nextLabel = target?.getAttribute("data-cursor");
      if (target && isCursorLabel(nextLabel)) {
        const rect = target.getBoundingClientRect();
        const next = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, label: nextLabel };
        if (snap?.label !== next.label || snap.x !== next.x) audioRef.current?.hover();
        snap = next;
      } else {
        snap = null;
      }
    };

    const onMove = (event: PointerEvent) => place(event.clientX, event.clientY);
    const onDown = (event: PointerEvent) => {
      if (reduce) return;
      const pulse = document.createElement("span");
      pulse.className = "net-pulse";
      pulse.style.left = `${event.clientX}px`;
      pulse.style.top = `${event.clientY}px`;
      document.body.appendChild(pulse);
      window.setTimeout(() => pulse.remove(), 320);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      state = stepCursor(state, pointerX, pointerY, snap, dt);
      cursor.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
      cursor.classList.toggle("is-flip", state.x > window.innerWidth - 88);
      label.textContent = state.label ?? "";
      raf = window.requestAnimationFrame(frame);
    };

    cursor.classList.add("is-on");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    raf = window.requestAnimationFrame(frame);
    return () => {
      cursor.classList.remove("is-on");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.cancelAnimationFrame(raf);
    };
  }, [phase]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
    audioRef.current?.setEnabled(next, { gesture: true });
  };

  const onActive = useCallback((nextIndex: string, nextBeat: string) => {
    setIndex(`${nextIndex} / ${nextBeat}`);
    setBeat(nextBeat);
  }, []);

  const showIndex = phase === "live" || phase === "still";
  const note = SECTION_PLACEHOLDERS[beat] ?? "";

  return (
    <div className={`net is-${phase}${beat === "HERO" ? " is-hero" : ""}`} data-copy={COPY_NOTE}>
      <Link className="net-cta" href={CTA_HREF} data-cursor="open">
        {CTA_LABEL}
      </Link>
      {phase === "still" ? (
        <StillScenes onActive={onActive} />
      ) : (
        <>
          <img className="net-poster" src={STILLS[0].src} alt="" width={1440} height={900} fetchPriority="high" decoding="async" />
          <canvas ref={canvasRef} className="net-canvas" aria-hidden="true" />
          <div className="net-loader" aria-hidden={phase !== "boot"}>
            <p ref={readoutRef} className="net-readout" aria-live="polite">{bootLine(0)}</p>
            <div className="net-hairline" aria-hidden="true"><span ref={barRef} /></div>
          </div>
          <div className="net-hero-copy">
            <h1>{HERO_H1}</h1>
          </div>
          {note ? <p className="net-note">{note}</p> : null}
          <div ref={spacerRef} className="net-scroll" aria-hidden="true" />
        </>
      )}
      {showIndex ? <p className="net-index">{index}</p> : null}
      <button type="button" className="net-sound" data-cursor="play" aria-pressed={sound} onClick={toggleSound}>
        {sound ? "SOUND ON" : "SOUND OFF"}
      </button>
      <div ref={cursorRef} className="net-cursor" aria-hidden="true">
        <i />
        <span ref={labelRef} />
      </div>
      <noscript>
        <img src="/lab/network/stills/t06.png" alt="Terracotta clay network on a sand ground." width={1440} height={900} />
      </noscript>
    </div>
  );
}
