import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import { AccessPanel } from "@/components/AccessPanel";
import { SignInDialog } from "@/components/SignInDialog";
import { BackgroundMotion } from "@/components/BackgroundMotion";
import { PwaRegister } from "@/components/PwaRegister";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { SettingsProvider } from "@/components/SettingsProvider";
import { HEAD_SCRIPT } from "@/lib/settings.ts";
import "./globals.css";

// Chakra Petch (angular, game-HUD) for the wordmark, headings, buttons and tabs; JetBrains Mono for prices, tables and body text.
const display = Chakra_Petch({ subsets: ["latin", "latin-ext"], weight: ["500", "700"], variable: "--font-display", display: "swap" });
const data = JetBrains_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-data", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Replay", template: "%s | Replay" },
  description: "See what a buy from the past would be worth today: a stock, a coin or a currency, bought once or on a schedule.",
  applicationName: "Replay",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/replay-logo.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Replay",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Replay",
    title: "Replay",
    description: "See what a buy from the past would be worth today: a stock, a coin or a currency, bought once or on a schedule.",
    images: [{ url: "/og-image.png", width: 512, height: 512, alt: "Replay" }],
  },
  twitter: {
    card: "summary",
    title: "Replay",
    description: "See what a buy from the past would be worth today: a stock, a coin or a currency, bought once or on a schedule.",
    images: ["/og-image.png"],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#03090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the script in <head> sets data-theme and friends on <html> before React starts, by design.
    <html lang="en" suppressHydrationWarning className={`h-full font-sans ${display.variable} ${data.variable}`}>
      <head>
        {/* Applies the saved theme before the first paint, so a light-mode visitor never sees a dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <SettingsProvider>
          <div className="relative z-10 flex min-h-dvh w-full flex-1 flex-col">{children}</div>
          <PwaRegister />
          <UpdatePrompt />
          <AccessPanel />
          <SignInDialog />
          <BackgroundMotion />
        </SettingsProvider>
      </body>
    </html>
  );
}