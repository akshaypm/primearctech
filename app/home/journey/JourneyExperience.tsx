"use client";

import { useMemo, useRef } from "react";
import { journeyCopy } from "./content";
import { JourneyCanvas } from "./JourneyCanvas";
import "./journey.css";

export function JourneyExperience() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const engagementsRef = useRef<HTMLElement>(null);
  const howRef = useRef<HTMLElement>(null);
  const { chapters } = journeyCopy;
  const chapterRefs = useMemo(
    () => ({ input: heroRef, assembly: engagementsRef, operation: howRef }),
    [],
  );

  return (
    <section className="pj" aria-label="The system">
      <div className="pj-track" ref={trackRef}>
        <div className="pj-stage" ref={stageRef} data-ready="false">
          <JourneyCanvas
            trackRef={trackRef}
            stageRef={stageRef}
            chapters={chapterRefs}
          />
        </div>
        <div className="pj-chapters">
          <article id={chapters.input.anchor} ref={heroRef} className="pj-chapter" data-chapter="input">
            <div className="pj-copy">
              <p className="pj-kicker">{chapters.input.kicker}</p>
              <h1>{journeyCopy.h1}</h1>
              <p className="pj-lede">{journeyCopy.lede}</p>
              <div className="pj-actions">
                <a className="pa-btn pj-cta" href={journeyCopy.primaryCta.href}>
                  {journeyCopy.primaryCta.label} <span aria-hidden="true">→</span>
                </a>
                <a className="pa-textlink" href={journeyCopy.secondaryCta.href}>{journeyCopy.secondaryCta.label}</a>
              </div>
              <ul className="pj-labels" aria-label="What approaches the system">
                {chapters.input.labels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          </article>

          <article id={chapters.assembly.anchor} ref={engagementsRef} className="pj-chapter" aria-labelledby="eng-title" data-chapter="assembly">
            <div className="pj-copy">
              <p className="pj-kicker">{chapters.assembly.kicker}</p>
              <h2 id="eng-title">{chapters.assembly.title}</h2>
              <p className="pj-lede">{chapters.assembly.sentence}</p>
              <ul className="pj-services">
                {chapters.assembly.services.map((service) => (
                  <li key={service.title}>
                    <h3>{service.title}</h3>
                    <p>{service.deliverables.join(", ")}</p>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article id={chapters.operation.anchor} ref={howRef} className="pj-chapter" aria-labelledby="how-title" data-chapter="operation">
            <div className="pj-copy">
              <p className="pj-kicker">{chapters.operation.kicker}</p>
              <h2 id="how-title">{chapters.operation.title}</h2>
              <p className="pj-lede">{chapters.operation.sentence}</p>
              <ol className="pj-steps">
                {chapters.operation.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
