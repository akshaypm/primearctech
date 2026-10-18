"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
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

function revealFor(progress: number, index: number, count: number) {
  if (progress <= 0.001 && index === 0) return 0;
  if (progress >= 0.999 && index === count - 1) return 0;
  const span = 1 / count;
  const local = (progress - index * span) / span;
  if (local <= 0 || local >= 1) return 110;
  const enter = Math.min(1, local / 0.18);
  const exit = Math.min(1, (1 - local) / 0.18);
  return (1 - Math.min(enter, exit)) * 110;
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
    let alive = true;
    let frame = 0;
    const cards = () => [...copy.querySelectorAll<HTMLElement>(".journey-card")];

    const paint = (progress: number) => {
      const count = cards().length || 1;
      let active = 0;
      let best = Infinity;
      cards().forEach((card, index) => {
        const center = (index + 0.5) / count;
        const distance = Math.abs(progress - center);
        if (distance < best) {
          best = distance;
          active = index;
        }
        const y = revealFor(progress, index, count);
        card.querySelectorAll<HTMLElement>(".line > span").forEach((line) => {
          line.style.setProperty("--y", `${y}%`);
        });
      });
      cards().forEach((card, index) => card.classList.toggle("is-on", index === active));
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
      const onResize = () => world.resize();
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
    };
  }, []);

  const stations = [
    { id: "hero", kicker: "01 — Hero", lines: ["AI features,", "from demo to production."] },
    { id: "demo", kicker: "02 — Demo to production", lines: ["The demo worked.", "Production is a different machine."] },
    { id: "engagements", kicker: "03 — Engagements", lines: ["Three ways in.", "One standard of finish."] },
    { id: "how", kicker: "04 — How we work", lines: ["Engineers on the call.", "Engineers on the code."] },
    { id: "proof", kicker: "05 — Engineering depth", lines: ["Engineering you", "can inspect."] },
    { id: "products", kicker: "06 — Products", lines: ["When the same problem", "shows up three times."] },
    { id: "partners", kicker: "07 — Partners", lines: ["Built under", "your name."] },
    { id: "fit", kicker: "09 — Fit", lines: ["We work to a tolerance.", "So should a client list."] },
    { id: "book", kicker: "10 — Book a call", lines: ["Talk to an engineer,", "not a salesperson."] },
  ];

  return (
    <main className="journey">
      <canvas ref={canvasRef} className="journey-gl" />
      <div ref={copyRef} className="journey-copy">
        {stations.map((station) => (
          <article key={station.id} className="journey-card" data-station={station.id}>
            <p>{station.kicker}</p>
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
      <div ref={trackRef} className="journey-track" style={{ height: `${stations.length * 100}vh` }} />
    </main>
  );
}
