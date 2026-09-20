import { ImageResponse } from "next/og";
import type { ActivityPayload } from "@/lib/contracts/activity";

const WIDTH = 800;
const HEIGHT = 500;

export function excerptMarkdown(markdown: string, max = 280): string {
  return markdown
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function blankTemplate(template: string): string {
  return template.replace(/\{\{\d+\}\}/g, "______");
}

/** Paper screenshot of live markdown or an activity stem — no stored stills. */
export function paperPreview(input: {
  kicker?: string;
  title: string;
  body?: string;
  color: string;
  quote?: boolean;
  lines?: string[];
}): ImageResponse {
  const body = input.body ? excerptMarkdown(input.body) : "";
  const lines = (input.lines ?? []).slice(0, 6);

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          background: "#e7e5e4",
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            background: "#fffefb",
            borderRadius: 12,
            padding: 36,
            boxShadow: "0 18px 40px rgba(28, 25, 23, 0.18)",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 48,
              height: 6,
              borderRadius: 999,
              background: input.color,
              marginBottom: 16,
            }}
          />
          {input.kicker ? (
            <div
              style={{
                display: "flex",
                fontSize: 14,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "#78716c",
                marginBottom: 8,
              }}
            >
              {input.kicker}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 600,
              color: "#1c1917",
              lineHeight: 1.25,
            }}
          >
            {input.title}
          </div>
          {body ? (
            input.quote ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 18,
                  padding: "14px 16px",
                  background: "#fef3c7",
                  borderLeft: `6px solid ${input.color}`,
                  borderRadius: 8,
                  fontSize: 20,
                  color: "#1c1917",
                  lineHeight: 1.4,
                }}
              >
                {body}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  marginTop: 16,
                  fontSize: 18,
                  color: "#57534e",
                  lineHeight: 1.45,
                }}
              >
                {body}
              </div>
            )
          ) : null}
          {lines.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 18,
                gap: 10,
              }}
            >
              {lines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: "2px solid #a8a29e",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      fontSize: 18,
                      color: "#44403c",
                      lineHeight: 1.3,
                    }}
                  >
                    {line}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, headers: { "Cache-Control": "no-store" } },
  );
}

export function noteCoverImage(input: {
  title: string;
  body: string;
  color: string;
}): ImageResponse {
  return paperPreview(input);
}

export function activityPreview(input: {
  payload: ActivityPayload;
  color?: string;
}): ImageResponse {
  const color = input.color ?? "#0f766e";
  const payload = input.payload;
  switch (payload.type) {
    case "mcq":
    case "select_all":
      return paperPreview({
        kicker: payload.type === "mcq" ? "Multiple choice" : "Select all",
        title: payload.stem,
        color,
        lines: payload.options,
      });
    case "fill_blank":
      return paperPreview({
        kicker: "Fill in the blank",
        title: blankTemplate(payload.template),
        color,
      });
    case "closed":
      return paperPreview({
        kicker: "Closed question",
        title: payload.stem,
        color,
      });
  }
}
