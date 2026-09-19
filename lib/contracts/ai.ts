import { z } from "zod";
import { ActivityPayload } from "./activity";

export const ExtractProposal = z.object({
  exact: z.string().min(10), // must appear verbatim in the source markdown
  priority: z.number().int().min(0).max(100),
  reason: z.string(), // shown in the margin UI
  concepts: z.array(z.string()).max(5),
});
export type ExtractProposal = z.infer<typeof ExtractProposal>;

export const NoteDraft = z.object({
  title: z.string().min(1),
  body_md: z.string().min(1),
  concepts: z.array(z.string()).max(8),
});
export type NoteDraft = z.infer<typeof NoteDraft>;

export const ActivityBatch = z.object({
  activities: z.array(ActivityPayload).min(1).max(12),
});
export type ActivityBatch = z.infer<typeof ActivityBatch>;

export const Diagnostics = z.object({
  struggling: z.array(z.object({ concept: z.string(), why: z.string() })),
  known: z.array(z.string()),
  untouched: z.array(z.string()),
  next_action: z.string(),
});
export type Diagnostics = z.infer<typeof Diagnostics>;
