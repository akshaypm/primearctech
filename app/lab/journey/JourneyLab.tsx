"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { STATIONS, copyInk, textOpacity } from "./copy";
import { mountJourney, type JourneyWorld } from "./world";
import "./journey.css";

type JourneyApi = {
  setFrame: (progress: number, timeMs: number) => void;
  stations: { id: string }[];
  seconds: number;
  marks: { id: string; kind: string; progress: number }[];
};

declare global {
  interface Window {
    __journey?: JourneyApi;
  }
}

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

export function JourneyLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<JourneyWorld | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const copy = copyRef.current;
    const track = trackRef.current;
    if (!canvas || !copy || !track) return;
    const capture = new URLSearchParams(window.location.search).get("capture") === "1";
    if (capture) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    let alive = true;
    let frame = 0;
    const cards = () => [...copy.querySelectorAll<HTMLElement>(".lj-card")];

    const paint = (progress: number) => {
      const text = textOpacity(progress);
      copy.classList.toggle("is-ink", copyInk(progress));
      cards().forEach((card, index) => {
        const opacity = index === text.index ? text.opacity : 0;
        const rise = smoothstep(Math.min(1, opacity / 0.45));
        card.style.setProperty("--fade", opacity.toFixed(3));
        card.querySelectorAll<HTMLElement>(".line > span").forEach((line, lineIndex) => {
          const delay = Math.min(1, Math.max(0, (opacity - lineIndex * 0.08) / 0.4));
          const shown = index === text.index ? smoothstep(delay) * rise : 0;
          line.style.setProperty("--y", `${(1 - shown) * 110}%`);
        });
      });
    };

    let stop = () => {};
    void mountJourney(canvas).then((world) => {
      if (!alive) {
        world.dispose();
        return;
      }
      worldRef.current = world;
      const api: JourneyApi = {
        stations: world.stations,
        seconds: world.seconds,
        marks: world.marks,
        setFrame(progress, timeMs) {
          world.setProgress(progress);
          world.setTime(timeMs);
          world.render();
          paint(progress);
        },
      };
      window.__journey = api;
      world.resize();
      api.setFrame(0, 0);

      if (capture) return;

      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ autoRaf: false });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      const trigger = ScrollTrigger.create({
        trigger: track,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.65,
        onUpdate: (self) => {
          world.setProgress(self.progress);
          paint(self.progress);
        },
      });
      const onPointer = (event: PointerEvent) => {
        world.setPointer((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
      };
      window.addEventListener("pointermove", onPointer);
      const onResize = () => {
        world.resize();
        ScrollTrigger.refresh();
      };
      window.addEventListener("resize", onResize);
      const loop = (now: number) => {
        frame = requestAnimationFrame(loop);
        world.setTime(now);
        world.render();
      };
      frame = requestAnimationFrame(loop);
      document.documentElement.style.scrollBehavior = "auto";
      stop = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onPointer);
        window.removeEventListener("resize", onResize);
        gsap.ticker.remove(tick);
        trigger.kill();
        lenis.destroy();
        document.documentElement.style.scrollBehavior = "";
      };
    });

    return () => {
      alive = false;
      stop();
      worldRef.current?.dispose();
      worldRef.current = null;
      if (window.__journey) delete window.__journey;
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <main className="lj">
      <canvas ref={canvasRef} className="lj-gl" />
      <div ref={copyRef} className="lj-copy">
        {STATIONS.map((station) => (
          <article key={station.id} className={`lj-card is-${station.side}`} data-station={station.id}>
            <p className="line eyebrow">
              <span>{station.eyebrow}</span>
            </p>
            <h1>
              {station.lines.map((line) => (
                <span className="line" key={line}>
                  <span>{line}</span>
                </span>
              ))}
            </h1>
          </article>
        ))}
      </div>
      <div ref={trackRef} className="lj-track" style={{ height: `${STATIONS.length * 100}vh` }} />
    </main>
  );
}
