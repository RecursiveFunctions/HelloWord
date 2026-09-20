import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Script from "next/script";
import { ThemeSync } from "@/components/theme-sync";
import { OfflineBanner, RegisterServiceWorker } from "@/components/pwa";
import { TooltipProvider } from "@/components/ui/tooltip";
import { themeInitScript } from "@/lib/theme-runtime";
import { THEME_COLOR } from "@/lib/themes";
import "./globals.css";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HelloWord",
  description:
    "A lightweight incremental reading app: sources become markdown, notes are the pivot, activities are scheduled with FSRS.",
  applicationName: "HelloWord",
  appleWebApp: {
    capable: true,
    title: "HelloWord",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/192",
    apple: "/icons/180",
  },
};

export const viewport: Viewport = {
  // Overridden at runtime once the user picks a mode (see lib/theme-runtime).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  // Extend under the notch / home indicator; the shell pads with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-accent="indigo"
      data-surface="clean"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Script id="helloword-theme" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <OfflineBanner />
        <TooltipProvider>{children}</TooltipProvider>
        <ThemeSync />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
