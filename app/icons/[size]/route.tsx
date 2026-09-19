import { ImageResponse } from "next/og";

/**
 * Manifest icons, rendered rather than committed as binaries.
 *
 * The mark is a passage with one line highlighted: an extract. Drawn entirely
 * with boxes so it needs no font, which keeps it identical on every platform.
 *
 * `?maskable=1` pads the mark into the safe zone Android crops to.
 */
const SIZES = [180, 192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(
  request: Request,
  context: RouteContext<"/icons/[size]">,
): Promise<Response> {
  const { size: raw } = await context.params;
  const size = Number(raw);
  if (!Number.isFinite(size) || size < 16 || size > 1024) {
    return new Response("Unsupported icon size.", { status: 404 });
  }

  const maskable = new URL(request.url).searchParams.has("maskable");
  const unit = size / 16;
  // Android crops a maskable icon to the inner 80%, so shrink the mark to fit.
  const inset = maskable ? unit * 3 : unit * 2.5;

  const line = (width: string, highlighted: boolean) => (
    <div
      key={width + String(highlighted)}
      style={{
        width,
        height: unit * 1.15,
        borderRadius: unit * 0.6,
        background: highlighted ? "#fb923c" : "rgba(255,255,255,0.32)",
      }}
    />
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0a09",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: unit * 0.9,
            width: size - inset * 2,
            height: size - inset * 2,
          }}
        >
          {line("100%", false)}
          {line("78%", false)}
          {line("92%", true)}
          {line("64%", false)}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
