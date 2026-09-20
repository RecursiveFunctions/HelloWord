"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ActivityPayload } from "@/lib/contracts/activity";

function activityPrompt(activity: ActivityPayload): string {
  return activity.type === "fill_blank" ? activity.template : activity.stem;
}

/**
 * Drafted activities with a keep/drop checkbox each. Shared by the reader rail
 * and the triage screen: both show cards the model wrote and let a human pick
 * which ones become real.
 */
export function ActivityDraftList({
  activities,
  selected,
  onToggle,
  className,
}: {
  activities: readonly ActivityPayload[];
  selected: ReadonlySet<number>;
  onToggle: (index: number, checked: boolean) => void;
  className?: string;
}) {
  return (
    <ul className={className ?? "space-y-3"}>
      {activities.map((activity, index) => (
        <li key={`${activity.type}-${index}`} className="rounded-lg border bg-card p-3 text-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={selected.has(index)}
              onCheckedChange={(checked) => onToggle(index, checked === true)}
              aria-label={`Select ${activity.type} activity`}
            />
            <span className="min-w-0">
              <Badge variant="outline">{activity.type.replace("_", " ")}</Badge>
              <span className="mt-2 block font-medium">{activityPrompt(activity)}</span>
              {activity.type === "mcq" && (
                <span className="mt-2 block text-xs text-muted-foreground">
                  {activity.options.map((option, optionIndex) => `${optionIndex + 1}. ${option}`).join(" · ")}
                </span>
              )}
              {activity.type === "select_all" && (
                <span className="mt-2 block text-xs text-muted-foreground">{activity.options.join(" · ")}</span>
              )}
              {activity.type === "closed" && (
                <span className="mt-2 block text-xs text-muted-foreground">Answer: {activity.answer}</span>
              )}
              {activity.type === "fill_blank" && (
                <span className="mt-2 block text-xs text-muted-foreground">
                  {activity.blanks.map((blank) => blank.accepted[0]).join(" · ")}
                </span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
