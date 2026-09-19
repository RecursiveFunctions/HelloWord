import { z } from "zod";
import {
  ActivityPayload,
  ActivityResponse,
  ActivityType,
  Rating,
} from "./contracts/activity";
import { SelectorBundle } from "./contracts/anchor";
import {
  ActivityBatch,
  Diagnostics,
  ExtractProposal,
  NoteDraft,
} from "./contracts/ai";
import { AFactor, SchedulerPresetName } from "./contracts/scheduling";

/**
 * Frozen HTTP contract. Paths are owned by the workstream in the comment.
 * Implementations live in `app/api/**` on feature branches; this file does not.
 */

export const ApiPath = {
  /** Owner A */
  sources: "/api/sources",
  source: (id: string) => `/api/sources/${id}`,
  feedsRefresh: "/api/feeds/refresh",
  notebooks: "/api/notebooks",
  notebook: (id: string) => `/api/notebooks/${id}`,
  notebookItems: (id: string) => `/api/notebooks/${id}/items`,

  /** Owner B */
  notes: "/api/notes",
  note: (id: string) => `/api/notes/${id}`,
  extracts: "/api/extracts",
  extract: (id: string) => `/api/extracts/${id}`,
  extractReanchor: (id: string) => `/api/extracts/${id}/reanchor`,

  /** Owner C */
  aiExtracts: "/api/ai/extracts",
  aiNote: "/api/ai/note",
  aiActivities: "/api/ai/activities",
  tts: "/api/tts", // stretch only
  report: "/api/report",

  /** Owner D */
  reviewQueue: "/api/review/queue",
  reviewGrade: "/api/review/grade",
  schedulerProfile: "/api/scheduler/profile",
  schedule: (activityId: string) => `/api/schedule/${activityId}`,
  diagnostics: (notebookId: string) => `/api/diagnostics/${notebookId}`,
} as const;

export const CreateSourceBody = z.object({
  kind: z.enum(["pdf", "url"]),
  title: z.string().min(1),
  origin_uri: z.string().min(1),
  storage_key: z.string().optional(),
});

export const PatchNoteBody = z.object({
  title: z.string().min(1).optional(),
  body_md: z.string().optional(),
});

export const CreateExtractBody = z.object({
  source_id: z.string().uuid().optional(),
  note_id: z.string().uuid().optional(),
  body_md: z.string().min(1),
  priority: z.number().int().min(0).max(100).default(50),
  selector: SelectorBundle,
});

export const AiExtractsBody = z.object({
  sourceId: z.string().uuid(),
});
export const AiExtractsResponse = z.array(ExtractProposal);

export const AiNoteBody = z.object({
  extractIds: z.array(z.string().uuid()).min(1),
});
export const AiNoteResponse = NoteDraft;

export const AiActivitiesBody = z.object({
  noteId: z.string().uuid(),
  types: z.array(ActivityType).min(1),
  count: z.number().int().min(1).max(12),
});
export const AiActivitiesResponse = ActivityBatch;

export const TtsBody = z.object({
  text: z.string().min(1),
});

export const GradeBody = z.object({
  activityId: z.string().uuid(),
  response: ActivityResponse,
  mode: z.enum(["queue", "quiz", "voice"]).default("queue"),
  durationMs: z.number().int().nonnegative().optional(),
});

export const GradeResult = z.object({
  correct: z.boolean(),
  rating: Rating,
  expected: ActivityPayload,
  nextDue: z.string().datetime(),
});

export const PatchSchedulerProfileBody = z.object({
  request_retention: z.number().min(0.7).max(0.98).optional(),
  interval_modifier: z.number().min(0.01).max(5).optional(),
  day_ms: z.number().int().min(250).max(86_400_000).optional(),
  preset: SchedulerPresetName.optional(),
  learning_steps: z.array(z.string()).optional(),
  relearning_steps: z.array(z.string()).optional(),
});

export const PatchScheduleBody = z.object({
  a_factor: AFactor.optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

export const NotebookItemBody = z.object({
  item_type: z.enum(["source", "note", "extract", "activity"]),
  item_id: z.string().uuid(),
});

export const DiagnosticsResponse = Diagnostics;

export type CreateSourceBody = z.infer<typeof CreateSourceBody>;
export type PatchNoteBody = z.infer<typeof PatchNoteBody>;
export type CreateExtractBody = z.infer<typeof CreateExtractBody>;
export type AiExtractsBody = z.infer<typeof AiExtractsBody>;
export type AiNoteBody = z.infer<typeof AiNoteBody>;
export type AiActivitiesBody = z.infer<typeof AiActivitiesBody>;
export type GradeBody = z.infer<typeof GradeBody>;
export type GradeResult = z.infer<typeof GradeResult>;
export type PatchSchedulerProfileBody = z.infer<typeof PatchSchedulerProfileBody>;
export type PatchScheduleBody = z.infer<typeof PatchScheduleBody>;
export type NotebookItemBody = z.infer<typeof NotebookItemBody>;
