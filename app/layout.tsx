import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { OfflineBanner, RegisterServiceWorker } from "@/components/pwa";
import { TooltipProvider } from "@/components/ui/tooltip";
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
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/192",
    apple: "/icons/180",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  // An installed PWA should not bounce the whole page when a pane scrolls.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <OfflineBanner />
        <TooltipProvider>{children}</TooltipProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
