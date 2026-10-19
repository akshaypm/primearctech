"use client";

import { useEffect, useRef } from "react";
import { JOURNEY_SECONDS, MARKS } from "./clock";
import { journeyAllowed } from "../gates";
import { registerLayer, unregisterLayer } from "../gl-host";
import { mountJourneyWorld, type JourneyWorld } from "./world";

type JourneyApi = {
  setFrame: (progress: number, timeMs: number) => void;
  marks: typeof MARKS;
  seconds: number;
};

declare global {
  interface Window {
    __journey?: JourneyApi;
  }
}

export function JourneyHost() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const root = host?.closest(".pa");
    if (!host || !root || !journeyAllowed()) return;

    let alive = true;
    let world: JourneyWorld | null = null;
    let progress = 0;
    let timeMs = 0;
    let forced = false;
    let paused = false;
    const portraitQuery = window.matchMedia("(max-width: 700px)");

    const paintType = (value: number) => {
      const reveal = world?.reveal(value) ?? { hero: 1, demo: 0, shift: 0 };
      const visible = value > 0.16;
      root.classList.toggle("is-journey", visible);
      const heroCopy = root.querySelector<HTMLElement>(".pa-hero-copy");
      const demoHead = root.querySelector<HTMLElement>("#demo .pa-head");
      const demoSide = root.querySelector<HTMLElement>("#demo .pa-side");
      if (heroCopy) {
        if (!visible && reveal.hero >= 0.999) {
          heroCopy.style.removeProperty("opacity");
          heroCopy.style.removeProperty("transform");
        } else {
          heroCopy.style.opacity = reveal.hero.toFixed(3);
          heroCopy.style.transform = `translate3d(${(-18 * (1 - reveal.hero)).toFixed(2)}px, ${(-8 * (1 - reveal.hero)).toFixed(2)}px, 0)`;
        }
      }
      for (const node of [demoHead, demoSide]) {
        if (!node) continue;
        if (!visible && reveal.demo === 0) {
          node.style.removeProperty("opacity");
          node.style.removeProperty("transform");
          continue;
        }
        node.style.opacity = reveal.demo.toFixed(3);
        const depth = node === demoSide ? 10 : 22;
        node.style.transform = `translate3d(${((1 - reveal.demo) * depth).toFixed(2)}px, ${((1 - reveal.demo) * 14).toFixed(2)}px, 0)`;
      }
      host.dataset.on = visible ? "true" : "false";
    };

    const placeHost = () => {
      const demo = document.getElementById("demo");
      const side = document.querySelector("#demo .pa-side");
      const demoBottom = demo ? demo.getBoundingClientRect().bottom : window.innerHeight;
      const height = Math.max(0, Math.min(window.innerHeight, demoBottom));
      const sideBox = side?.getBoundingClientRect();
      const narrow = portraitQuery.matches;
      if (narrow && sideBox && sideBox.bottom > 48 && sideBox.bottom < window.innerHeight * 0.72) {
        const top = Math.round(sideBox.bottom + 16);
        host.style.top = `${top}px`;
        host.style.height = `${Math.max(2, height - top)}px`;
        return;
      }
      host.style.top = "0px";
      host.style.height = `${Math.max(2, height)}px`;
    };

    const applyScroll = () => {
      if (forced) return;
      const hero = document.getElementById("hero");
      const demo = document.getElementById("demo");
      const next = document.getElementById("engagements");
      if (!hero || !demo) return;
      const start = hero.offsetTop + window.innerHeight * 0.08;
      const end = demo.offsetTop + Math.min(140, demo.offsetHeight * 0.12);
      const nextTop = next?.getBoundingClientRect().top ?? window.innerHeight + 1;
      if (window.scrollY < start) {
        progress = 0;
        paintType(0);
        return;
      }
      if (nextTop < window.innerHeight * 0.78) {
        progress = 1;
        paintType(0);
        return;
      }
      progress = Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start)));
      paintType(progress);
    };

    const onPause = (event: Event) => {
      paused = !(event instanceof CustomEvent && event.detail === false);
    };
    window.addEventListener("arc:pause", onPause);

    let stop = () => {};
    void mountJourneyWorld().then((next) => {
      if (!alive) {
        next.dispose();
        return;
      }
      world = next;
      const api: JourneyApi = {
        marks: MARKS,
        seconds: JOURNEY_SECONDS,
        setFrame(value, time) {
          forced = true;
          progress = Math.min(1, Math.max(0, value));
          timeMs = time;
          const hero = document.getElementById("hero");
          const demo = document.getElementById("demo");
          if (hero && demo) {
            const start = hero.offsetTop + window.innerHeight * 0.08;
            const end = demo.offsetTop + Math.min(140, demo.offsetHeight * 0.12);
            const y = progress <= 0.16
              ? (progress / 0.16) * start
              : start + ((progress - 0.16) / 0.84) * (end - start);
            window.scrollTo(0, y);
          }
          paintType(progress);
          const width = host.clientWidth || window.innerWidth;
          const height = progress > 0.16 ? window.innerHeight : 2;
          host.style.height = progress > 0.16 ? `${window.innerHeight}px` : "1px";
          next.resize(width, height);
          next.render(progress, timeMs, portraitQuery.matches);
          return next.pose();
        },
      };
      window.__journey = api;
      registerLayer("journey", {
        dense: true,
        overlay: true,
        element: host,
        resize(width, height) {
          next.resize(width, Math.max(2, height));
        },
        tick(now) {
          if (!forced) {
            timeMs = paused ? timeMs : now;
            applyScroll();
          }
          if (host.dataset.on !== "true") {
            host.style.removeProperty("height");
            host.style.removeProperty("top");
            return;
          }
          placeHost();
          next.render(progress, timeMs, portraitQuery.matches);
        },
        texture: () => next.texture(),
      });
      applyScroll();
      const onScroll = () => {
        if (!forced) applyScroll();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      stop = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        unregisterLayer("journey");
      };
    });

    return () => {
      alive = false;
      stop();
      window.removeEventListener("arc:pause", onPause);
      world?.dispose();
      root.classList.remove("is-journey");
      if (window.__journey) delete window.__journey;
    };
  }, []);

  return <div ref={hostRef} className="pa-journey-host" data-on="false" aria-hidden="true" />;
}
