import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";

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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-bg-page text-text-primary">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
