"use client";

import { useEffect } from "react";
import { useOffline } from "next/offline";
import { WifiOff } from "lucide-react";

/**
 * Registers the service worker in production only. In development the worker
 * would cache a Turbopack build that changes on every save, which produces the
 * kind of "why is my edit not showing" hour nobody has at a hackathon.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("Service worker registration failed", error));
  }, []);

  return null;
}

/**
 * Backed by `experimental.useOffline`, which also retries blocked navigations
 * and Server Action requests once connectivity returns.
 */
export function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-center text-xs text-foreground"
    >
      <WifiOff className="size-3.5" />
      Offline. Reading works from cache; grading a card needs the server.
    </div>
  );
}
