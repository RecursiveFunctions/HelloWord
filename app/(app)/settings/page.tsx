import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SCHEDULER_PRESETS, aFactorCopy } from "@/lib/contracts/scheduling";
import { schedulerProfile } from "@/lib/seed";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Workstream D owns this screen. The frozen contract already has three
          clock presets and an A-factor overlay so the UI can be built against
          seed data.
        </p>
      </header>

      <section>
        <h2 className="mb-3 font-heading text-lg">Clock preset</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.values(SCHEDULER_PRESETS).map((preset) => {
            const active = preset.day_ms === schedulerProfile.day_ms;
            return (
              <Card
                key={preset.name}
                size="sm"
                className={active ? "ring-2 ring-primary" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{preset.label}</CardTitle>
                    {active ? <Badge>active</Badge> : null}
                  </div>
                  <CardDescription>{preset.blurb}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  day_ms = {preset.day_ms.toLocaleString()} · steps{" "}
                  {preset.learning_steps.join(", ")}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg">Profile</h2>
        <ul className="space-y-2 text-sm">
          <li>
            Request retention{" "}
            <strong>{schedulerProfile.request_retention}</strong> — raising this
            is the principled way to see cards more often.
          </li>
          <li>
            Interval modifier{" "}
            <strong>{schedulerProfile.interval_modifier}</strong> (
            {aFactorCopy(schedulerProfile.interval_modifier)})
          </li>
          <li>
            Per-card A-factor still sits on each schedule row, range 0.1–5.0.
          </li>
        </ul>
      </section>
    </div>
  );
}
