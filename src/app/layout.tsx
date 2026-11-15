import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "DCA Checker", template: "%s | DCA Checker" },
  description: "What a fixed monthly USD buy of a token would have bought, and what it is worth today.",
  applicationName: "DCA Checker",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/dca-logo.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "DCA Checker",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "DCA Checker",
    title: "DCA Checker",
    description: "Backtest a fixed monthly USD purchase for any token, month by month.",
    images: [{ url: "/og-image.png", width: 512, height: 512, alt: "DCA Checker" }],
  },
  twitter: {
    card: "summary",
    title: "DCA Checker",
    description: "Backtest a fixed monthly USD purchase for any token, month by month.",
    images: ["/og-image.png"],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full font-sans">
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <div className="relative z-10 flex min-h-dvh w-full flex-1 flex-col">{children}</div>
        <PwaRegister />
      </body>
    </html>
  );
}