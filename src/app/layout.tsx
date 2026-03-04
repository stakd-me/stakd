import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Portfolio Operating System",
  description: "Decision support, risk control, and audit trail for manual crypto operations",
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
