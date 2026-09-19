import type { MetadataRoute } from "next";

/**
 * The app is installable. Review still goes through the server — FSRS state
 * lives in the `schedule` table and grading through `POST /api/review/grade` —
 * so this is a PWA shell, not an offline-first client. Genuine offline review
 * is a stretch goal, and the contracts already allow it to sync events later.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HelloWord — incremental reading",
    short_name: "HelloWord",
    description:
      "Add a PDF or a URL, keep the passages worth keeping, distil them into notes, and review what the notes teach.",
    start_url: "/notebooks",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/512?maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Review queue", url: "/review" },
      { name: "Library", url: "/library" },
    ],
  };
}
