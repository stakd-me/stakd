import type { Metadata } from "next";
import { headers } from "next/headers";
import { Archivo, DM_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

// Structured Signal: Archivo carries everything read as language, DM Mono
// everything read as a quantity. Both are self-hosted by next/font, so the
// CSP in src/proxy.ts (font-src 'self') needs no exception.
const archivo = Archivo({
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
  variable: "--font-archivo",
});

const dmMono = DM_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "Portfolio Operating System",
  description: "Decision support, risk control, and audit trail for manual crypto operations",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set by src/proxy.ts; next-themes needs it for its inline script
  // under the nonce-based CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${dmMono.variable}`}
    >
      <body className="antialiased bg-bg-page text-text-primary">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
