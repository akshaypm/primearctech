"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createAudio, type SwarmAudio } from "./engine/audio";
import { BOOT_LINES, NEXT_SECTION_COPY, SOUND_STORAGE_KEY, bootLine } from "./engine/copy";
import type { SwarmHandle } from "./engine/createEngine";
import "./swarm.css";

const TYPE_CPS = 38;
const LINE_PAUSE = 0.12;

function typedScript(elapsed: number, percent: number) {
  const lines = BOOT_LINES.map((_, index) => bootLine(index, percent));
  let cursor = 0;
  const shown: string[] = [];
  for (const line of lines) {
    const chars = Math.floor((elapsed - cursor) * TYPE_CPS);
    if (chars <= 0) break;
    if (chars >= line.length) {
      shown.push(line);
      cursor += line.length / TYPE_CPS + LINE_PAUSE;
    } else {
      shown.push(line.slice(0, chars));
      break;
    }
  }
  const done = shown.length === lines.length && shown[shown.length - 1] === lines[lines.length - 1];
  return { text: shown.join("\n"), done };
}

export function SwarmExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLPreElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SwarmHandle | null>(null);
  const audioRef = useRef<SwarmAudio | null>(null);
  const [phase, setPhase] = useState<"boot" | "live" | "still" | "fallback">("boot");
  const [sound, setSound] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stored = window.localStorage.getItem(SOUND_STORAGE_KEY) === "on";
    const audio = createAudio({ reducedMotion: reduce });
    audioRef.current = audio;
    if (stored) {
      audio.setEnabled(true);
      queueMicrotask(() => setSound(true));
    }

    const unlock = (event: Event) => {
      const target = event.target;
      const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      if (element?.closest(".swarm-sound")) return;
      void audio.unlock();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    if (reduce) {
      queueMicrotask(() => setPhase("still"));
      return () => {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        audio.dispose();
        audioRef.current = null;
      };
    }

    const canvas = canvasRef.current;
    const loader = loaderRef.current;
    const readout = readoutRef.current;
    const bar = barRef.current;
    const copy = copyRef.current;
    if (!canvas || !loader || !readout || !bar || !copy) {
      return () => {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        audio.dispose();
        audioRef.current = null;
      };
    }

    let cancelled = false;
    let textDone = false;
    let assetsReady = false;
    let skipped = false;
    let started = false;
    const progress = { value: 0 };
    const startedAt = performance.now();
    let removeTicker: (() => void) | null = null;

    const reveal = (fast: boolean) => {
      if (started || cancelled) return;
      started = true;
      engineRef.current?.playLock({ fast });
    };

    const maybeStart = () => {
      if (assetsReady && (textDone || skipped)) reveal(skipped);
    };

    const boot = () => {
      if (skipped) {
        readout.textContent = BOOT_LINES.map((_, index) => bootLine(index, progress.value * 100)).join("\n");
        textDone = true;
        maybeStart();
        return;
      }
      const elapsed = (performance.now() - startedAt) / 1000;
      const next = typedScript(elapsed, progress.value * 100);
      readout.textContent = next.text || BOOT_LINES[0];
      if (next.done) {
        textDone = true;
        maybeStart();
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key === "Tab") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a")) return;
      skipped = true;
      boot();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a")) return;
      skipped = true;
      boot();
    };

    window.addEventListener("keydown", onKey);
    loader.addEventListener("pointerdown", onPointerDown);

    void (async () => {
      const [{ createEngine }, gsapModule] = await Promise.all([
        import("./engine/createEngine"),
        import("gsap"),
      ]);
      if (cancelled) return;
      const gsap = gsapModule.default;
      gsap.ticker.add(boot);
      removeTicker = () => gsap.ticker.remove(boot);
      engineRef.current = createEngine({
        canvas,
        audio,
        onProgress: (value) => {
          progress.value = value;
          bar.style.transform = `scaleX(${value.toFixed(4)})`;
        },
        onReady: () => {
          assetsReady = true;
          maybeStart();
        },
        onLockStart: () => {
          gsap.to(loader, { autoAlpha: 0, duration: skipped ? 0.18 : 0.28, ease: "power2.inOut", overwrite: true });
          gsap.to(canvas, { opacity: 1, duration: skipped ? 0.2 : 0.35, ease: "power2.out", overwrite: true });
          gsap.fromTo(copy, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: skipped ? 0.35 : 0.7, delay: skipped ? 0.05 : 0.42, ease: "power3.out", overwrite: true });
          window.removeEventListener("keydown", onKey);
          loader.removeEventListener("pointerdown", onPointerDown);
        },
        onLive: () => {
          if (!cancelled) setPhase("live");
        },
        onFallback: () => {
          if (!cancelled) setPhase("fallback");
        },
      });
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("keydown", onKey);
      loader.removeEventListener("pointerdown", onPointerDown);
      removeTicker?.();
      engineRef.current?.dispose();
      engineRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
    if (engineRef.current) engineRef.current.setSound(next);
    else audioRef.current?.setEnabled(next, { gesture: true });
  };

  return (
    <div className={`swarm is-${phase}`}>
      <img
        className="swarm-poster"
        src="/lab/swarm/poster.webp"
        alt="A chrome falcon, wings raised, head in profile."
        width={1440}
        height={900}
        fetchPriority="high"
        decoding="async"
      />
      <canvas ref={canvasRef} className="swarm-canvas" aria-hidden="true" />
      <div className="swarm-vignette" aria-hidden="true" />
      <div className="swarm-grain" aria-hidden="true" />
      <div className="swarm-loader" ref={loaderRef}>
        {/* PLACEHOLDER COPY: boot readout, not approved marketing. */}
        <pre ref={readoutRef} className="swarm-readout">{BOOT_LINES[0]}</pre>
        <div className="swarm-hairline" aria-hidden="true"><span ref={barRef} /></div>
      </div>
      <header className="swarm-hero">
        <div className="swarm-copy" ref={copyRef}>
          <h1>We build AI systems that complete real work.</h1>
          <Link className="swarm-cta" href="/build-brief">Get free AI audit</Link>
        </div>
      </header>
      <section className="swarm-next" aria-label="Next section">
        {/* PLACEHOLDER COPY: the following section is outside this prototype. */}
        <p>{NEXT_SECTION_COPY}</p>
      </section>
      <button type="button" className="swarm-sound" aria-pressed={sound} onClick={toggleSound}>
        {sound ? "SOUND ON" : "SOUND OFF"}
      </button>
      <noscript>
        <style>{".swarm-loader{display:none}.swarm-copy{opacity:1;transform:none}"}</style>
      </noscript>
    </div>
  );
}
