import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActivityPayload } from "@/lib/contracts/activity";
import { isStale, reviewQueue } from "@/lib/seed";

function promptOf(payload: ActivityPayload): string {
  return payload.type === "fill_blank" ? payload.template : payload.stem;
}

export default function ReviewPage() {
  const queue = reviewQueue();
  const current = queue[0];
  const payload = current?.activity.payload;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl tracking-tight">Review</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {queue.length} cards due against the seed clock. Workstream D owns
          grading, the virtual clock, and quiz mode — this shell only renders
          the queue so D is not blocked on a model.
        </p>
      </header>

      {!current || !payload ? (
        <p className="text-muted-foreground">
          Nothing due. Change the seed clock or add cards.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge>{payload.type}</Badge>
              {isStale(current.activity) ? (
                <Badge variant="destructive">stale</Badge>
              ) : null}
            </div>
            <CardTitle className="font-serif text-xl leading-snug">
              {promptOf(payload)}
            </CardTitle>
            <CardDescription>
              From note: {current.note.title}. Due{" "}
              {new Date(current.schedule.due).toLocaleString("en-US", {
                timeZone: "UTC",
              })}{" "}
              UTC. A-factor {current.schedule.a_factor}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {payload.type === "mcq" || payload.type === "select_all" ? (
              <ol className="list-decimal space-y-1 pl-5">
                {payload.options.map((option) => (
                  <li key={option}>{option}</li>
                ))}
              </ol>
            ) : null}
            {payload.type === "closed" ? (
              <p className="text-muted-foreground">
                Hint: {payload.hint ?? "type an answer — grader is D"}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="justify-between">
            <p className="text-xs text-muted-foreground">
              POST {`/api/review/grade`} is D&apos;s. Seed only.
            </p>
            <Button disabled>Grade (D)</Button>
          </CardFooter>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-heading text-lg">Queue</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {queue.map((row, index) => (
            <li
              key={row.activity.id}
              className="flex items-center gap-3 px-4 py-2 text-sm"
            >
              <span className="w-6 text-muted-foreground">{index + 1}</span>
              <Badge variant="outline">{row.activity.type}</Badge>
              <span className="min-w-0 flex-1 truncate">
                {promptOf(row.activity.payload)}
              </span>
              {isStale(row.activity) ? (
                <Badge variant="destructive">stale</Badge>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Scheduler presets live in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
