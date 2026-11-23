import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import { AccessPanel } from "@/components/AccessPanel";
import { SignInDialog } from "@/components/SignInDialog";
import { BackgroundMotion } from "@/components/BackgroundMotion";
import { FloatingScrollTop } from "@/components/FloatingScrollTop";
import { GameDialog } from "@/components/GameDialog";
import { PwaRegister } from "@/components/PwaRegister";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { SettingsProvider } from "@/components/SettingsProvider";
import { HEAD_SCRIPT } from "@/lib/settings.ts";
import { DESCRIPTION, KEYWORDS, SITE_NAME, TAGLINE, X_HANDLE } from "@/lib/site.ts";
import "./globals.css";

// Chakra Petch (angular, game-HUD) for the wordmark, headings, buttons and tabs; JetBrains Mono for prices, tables and body text.
const display = Chakra_Petch({ subsets: ["latin", "latin-ext"], weight: ["500", "700"], variable: "--font-display", display: "swap" });
const data = JetBrains_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-data", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE_NAME}: ${TAGLINE.toLowerCase()}`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: KEYWORDS,
  category: "finance",
  manifest: "/manifest.webmanifest",
  // The tab icon is set by the script in the head below and follows the site's theme. Only the home-screen icon is set here.
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${TAGLINE.toLowerCase()}`,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    site: X_HANDLE,
    creator: X_HANDLE,
    title: `${SITE_NAME}: ${TAGLINE.toLowerCase()}`,
    description: DESCRIPTION,
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
        {/* The tab icon follows the site's theme: the script below sets it before the first paint, and settings.ts keeps it in step. */}
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <SettingsProvider>
          <div className="relative z-10 flex min-h-dvh w-full flex-1 flex-col">{children}</div>
          <PwaRegister />
          <UpdatePrompt />
          <AccessPanel />
          <SignInDialog />
          <GameDialog />
          <BackgroundMotion />
          <FloatingScrollTop />
        </SettingsProvider>
      </body>
    </html>
  );
}