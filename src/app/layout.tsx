import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Crypto Portfolio Manager",
  description: "Private, offline-first crypto portfolio tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-bg-page text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
