import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://primearc.tech";
const title = "PrimeArcTech | AI features, from demo to production";
const description = "A senior-engineer AI studio that takes AI features from demo to production for B2B software companies in the US and UK.";

export const metadata: Metadata = {
  title: { default: title, template: "%s | PrimeArcTech" },
  description,
  applicationName: "PrimeArcTech",
  metadataBase: new URL(siteUrl),
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  openGraph: {
    type: "website",
    url: "/",
    title,
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "PrimeArcTech senior-engineer AI studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preload" href="/fonts/general-sans-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/general-sans-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/ibm-plex-mono-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
