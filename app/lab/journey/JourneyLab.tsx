"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { STATIONS, copyInk } from "./copy";
import { mountJourney, type JourneyWorld } from "./world";
import "./journey.css";

type JourneyApi = {
  setFrame: (progress: number, timeMs: number) => void;
  stations: { id: string }[];
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

function lineY(progress: number, index: number, count: number, line: number) {
  const span = 1 / count;
  const local = (progress - index * span) / span - line * 0.04;
  if (index === count - 1) return (1 - smoothstep((local + 0.02) / 0.2)) * 110;
  const enter = index === 0 && progress < span * 0.22 ? 1 : smoothstep(local / 0.18);
  const exit = smoothstep((local - 0.76) / 0.16);
  return (1 - enter * (1 - exit)) * 110;
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
      const count = cards().length || 1;
      copy.classList.toggle("is-ink", copyInk(progress));
      cards().forEach((card, index) => {
        card.querySelectorAll<HTMLElement>(".line > span").forEach((line, lineIndex) => {
          line.style.setProperty("--y", `${lineY(progress, index, count, lineIndex)}%`);
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
          <article key={station.id} className="lj-card" data-station={station.id}>
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
