import Link from "next/link";
import { Clock, Palette, Server, UserRound } from "lucide-react";
import { ClockPresets } from "@/components/clock-presets";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/page-section";
import { ThemeEditor } from "@/components/theme-editor";
import { aFactorCopy } from "@/lib/contracts/scheduling";
import { getProfile } from "@/lib/store/review";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

function Row({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[14rem_1fr] sm:gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <div className="text-lg font-semibold">{children}</div>
        {note ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {note}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

export default async function SettingsPage() {
  const profile = await getProfile();

  return (
    <div className="space-y-8">
      <PageHeader
        className="mb-0"
        title="Settings"
        description={
          <>
            The clock preset is also on the{" "}
            <Link href="/review" className="underline">
              Review
            </Link>{" "}
            screen, where you can watch it take effect.
          </>
        }
      />

      <PageSection
        title="Appearance"
        icon={Palette}
        description="Accent, light or dark, and the surface everything sits on."
      >
        <ThemeEditor />
      </PageSection>

      <PageSection
        title="Clock preset"
        icon={Clock}
        description="How fast review time passes, so you can watch scheduling work."
      >
        <ClockPresets dayMs={profile.day_ms} verbose />
      </PageSection>

      <PageSection title="Profile" icon={UserRound}>
        <dl className="divide-y">
          <Row
            label="Request retention"
            note="Raising this is the principled way to see cards more often."
          >
            {profile.request_retention}
          </Row>
          <Row
            label="Interval modifier"
            note={aFactorCopy(profile.interval_modifier)}
          >
            {profile.interval_modifier}
          </Row>
          <Row
            label="Learning steps"
            note="Real-world durations, scaled into the active clock."
          >
            <span className="font-mono">
              {profile.learning_steps.join(", ")}
            </span>
          </Row>
          <Row label="Relearning steps">
            <span className="font-mono">
              {profile.relearning_steps.join(", ")}
            </span>
          </Row>
          <Row label="A-factor" note="Per-card, on each schedule row.">
            0.1–5.0
          </Row>
          {profile.clock_offset_ms > 0 ? (
            <Row
              label="Review clock"
              note="Reset it from the banner on the Review screen."
            >
              Skipped ahead
            </Row>
          ) : null}
        </dl>
      </PageSection>

      <PageSection
        title="Environment"
        icon={Server}
        description={
          <>
            Seed fixtures. Set until C&apos;s client is live:
          </>
        }
      >
        <code className="rounded-lg bg-muted px-3 py-2 font-mono text-base">
          AI_MOCK=1
        </code>
      </PageSection>
    </div>
  );
}
