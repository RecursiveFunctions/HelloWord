type BucketKey = "struggling" | "known" | "untouched";

const COLORS: Record<BucketKey, string> = {
  struggling: "var(--destructive)",
  known: "var(--info)",
  untouched: "var(--warning)",
};

const LABEL_MIN_PERCENT = 8;

/** Pie-only stand-in so every color has a wedge when a bucket is empty. */
const DEMO_VALUES: Record<BucketKey, number> = {
  struggling: 4,
  known: 3,
  untouched: 2,
};

const BUCKETS = [
  {
    key: "struggling" as const,
    label: "Struggling",
    hint: "Hard or worse, or still unstable.",
  },
  {
    key: "known" as const,
    label: "Known",
    hint: "Recall holding across 90 days.",
  },
  {
    key: "untouched" as const,
    label: "Untouched",
    hint: "Tagged, never reviewed.",
  },
];

export function NotebookDiagnostics({
  struggling,
  known,
  untouched,
}: {
  struggling: { concept: string; why: string }[];
  known: string[];
  untouched: string[];
}) {
  const items = {
    struggling: struggling.map((row) => ({
      label: row.concept,
      detail: row.why,
    })),
    known: known.map((label) => ({ label })),
    untouched: untouched.map((label) => ({ label })),
  };
  const slices = BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    value: items[bucket.key].length,
  }));

  return (
    <section className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:gap-8">
      <DiagnosticPie slices={slices} />

      <div className="min-w-0 flex-1 space-y-4 text-sm">
        {BUCKETS.map((bucket) => (
          <BucketTags
            key={bucket.key}
            color={COLORS[bucket.key]}
            label={bucket.label}
            hint={bucket.hint}
            items={items[bucket.key]}
          />
        ))}
      </div>
    </section>
  );
}

function DiagnosticPie({
  slices,
}: {
  slices: { key: BucketKey; label: string; value: number }[];
}) {
  const preview = slices.some((slice) => slice.value === 0);
  const present = preview
    ? slices.map((slice) => ({ ...slice, value: DEMO_VALUES[slice.key] }))
    : slices.filter((slice) => slice.value > 0);
  const total = present.reduce((sum, slice) => sum + slice.value, 0);
  const summary = slices
    .map((slice) => `${slice.value} ${slice.label.toLowerCase()}`)
    .join(", ");

  const size = 200;
  const cx = 100;
  const cy = 100;
  const r = 84;
  const wedges = pieWedges(present, total, cx, cy, r);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto size-[200px] max-w-full shrink-0"
      role="img"
      aria-label={summary}
    >
      {wedges.length === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill={wedges[0].fill} />
      ) : (
        wedges.map((wedge) => (
          <path key={wedge.key} d={wedge.d} fill={wedge.fill} />
        ))
      )}
      {wedges.map((wedge) =>
        wedge.label ? (
          <text
            key={`${wedge.key}-label`}
            x={wedge.label.x}
            y={wedge.label.y}
            fill="var(--background)"
            fontSize={12}
            fontWeight={500}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {wedge.label.text}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function pieWedges(
  slices: { key: BucketKey; value: number }[],
  total: number,
  cx: number,
  cy: number,
  r: number,
) {
  let angle = -Math.PI / 2;
  return slices.map((slice) => {
    const start = angle;
    const sweep = (slice.value / total) * 2 * Math.PI;
    angle += sweep;
    const mid = start + sweep / 2;
    const full = sweep >= 2 * Math.PI - 1e-6;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const percent = (slice.value / total) * 100;
    return {
      key: slice.key,
      fill: COLORS[slice.key],
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      label:
        percent < LABEL_MIN_PERCENT
          ? null
          : {
              x: full ? cx : cx + r * 0.55 * Math.cos(mid),
              y: full ? cy : cy + r * 0.55 * Math.sin(mid),
              text: `${percent.toFixed(1)}%`,
            },
    };
  });
}

function BucketTags({
  color,
  label,
  hint,
  items,
}: {
  color: string;
  label: string;
  hint: string;
  items: { label: string; detail?: string }[];
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 font-medium leading-none">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        {label}
        <span className="text-xs font-normal text-muted-foreground">
          {items.length}
        </span>
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">None right now.</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item.label}>
              <span
                className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs text-muted-foreground"
                style={{ background: `${color}18` }}
                title={item.detail}
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
