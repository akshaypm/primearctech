import type { ReactNode } from "react";
import { BUSINESS_CONTACT } from "@/lib/contact";
import { SiteBackground } from "./three/SiteBackground";
/* eslint-disable @next/next/no-html-link-for-pages -- cross-route navigation intentionally uses reliable document requests. */

export function TrustPage({ eyebrow, title, intro, children, immersive = false }: { eyebrow: string; title: string; intro: string; children: ReactNode; immersive?: boolean }) {
  return <main className={immersive ? "trust-page trust-immersive" : "trust-page"}>{immersive ? <SiteBackground intensity={0.85} /> : null}<header className="trust-nav"><a href="/" className="prime-wordmark"><strong>PrimeArc</strong><span>Tech</span></a><nav><a href="/#studio">Studio</a><a href="/fieldrelay">FieldRelay</a><a href="/about">About</a></nav><a href="/build-brief">Get free AI audit</a></header><article><p className="prime-label">{eyebrow}</p><h1>{title}</h1><p className="trust-intro">{intro}</p><div className="trust-body">{children}</div></article><footer><span>PrimeArcTech · {BUSINESS_CONTACT.location}</span><div><a href={`mailto:${BUSINESS_CONTACT.email}`}>Email</a><a href={`tel:${BUSINESS_CONTACT.phoneHref}`}>Call</a><a href={BUSINESS_CONTACT.whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/fieldrelay">FieldRelay</a></div></footer></main>;
}
