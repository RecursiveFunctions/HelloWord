import Link from "next/link";
import { ClockPresets } from "@/components/clock-presets";
import { ColorWheel } from "@/components/color-wheel";
import { aFactorCopy } from "@/lib/contracts/scheduling";
import { getProfile } from "@/lib/store/review";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfile();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The clock preset is also on the{" "}
          <Link href="/review" className="underline">
            Review
          </Link>{" "}
          screen, where you can watch it take effect.
        </p>
      </header>

      <section>
        <ColorWheel />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg">Clock preset</h2>
        <ClockPresets dayMs={profile.day_ms} verbose />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg">Profile</h2>
        <ul className="space-y-2 text-sm">
          <li>
            Request retention <strong>{profile.request_retention}</strong> —
            raising this is the principled way to see cards more often.
          </li>
          <li>
            Interval modifier <strong>{profile.interval_modifier}</strong> (
            {aFactorCopy(profile.interval_modifier)})
          </li>
          <li>
            Learning steps{" "}
            <strong className="font-mono">
              {profile.learning_steps.join(", ")}
            </strong>
            , relearning{" "}
            <strong className="font-mono">
              {profile.relearning_steps.join(", ")}
            </strong>{" "}
            — real-world durations, scaled into the active clock.
          </li>
          <li>
            Per-card A-factor still sits on each schedule row, range 0.1–5.0.
          </li>
          {profile.clock_offset_ms > 0 ? (
            <li>
              The review clock is currently skipped ahead. Reset it from the
              banner on the Review screen.
            </li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg">Environment</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Seed fixtures. Set <code className="font-mono">AI_MOCK=1</code> until
          C&apos;s client is live.
        </p>
      </section>
    </div>
  );
}
