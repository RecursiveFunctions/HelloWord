import { z } from "zod";

export const Mcq = z.object({
  type: z.literal("mcq"),
  stem: z.string().min(1),
  options: z.array(z.string()).min(3).max(6),
  answer: z.number().int().nonnegative(), // index into options
  explanation: z.string().optional(),
});

export const SelectAll = z.object({
  type: z.literal("select_all"),
  stem: z.string().min(1),
  options: z.array(z.string()).min(3).max(8),
  answers: z.array(z.number().int().nonnegative()).min(1),
  explanation: z.string().optional(),
});

export const FillBlank = z.object({
  type: z.literal("fill_blank"),
  template: z.string().min(1), // blanks marked {{1}}, {{2}}
  blanks: z
    .array(
      z.object({
        id: z.number().int().positive(),
        accepted: z.array(z.string()).min(1), // case-insensitive, trimmed
        hint: z.string().optional(),
      }),
    )
    .min(1),
});

export const Closed = z.object({
  type: z.literal("closed"),
  stem: z.string().min(1),
  answer: z.string().min(1),
  accepted: z.array(z.string()).default([]),
  hint: z.string().optional(),
});

export const ActivityPayload = z.discriminatedUnion("type", [
  Mcq,
  SelectAll,
  FillBlank,
  Closed,
]);
export type ActivityPayload = z.infer<typeof ActivityPayload>;

export const ActivityResponse = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mcq"), choice: z.number().int() }),
  z.object({
    type: z.literal("select_all"),
    choices: z.array(z.number().int()),
  }),
  z.object({
    type: z.literal("fill_blank"),
    filled: z.record(z.string(), z.string()),
  }),
  z.object({ type: z.literal("closed"), text: z.string() }),
]);
export type ActivityResponse = z.infer<typeof ActivityResponse>;

export const Rating = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type Rating = z.infer<typeof Rating>;

export const ActivityType = z.enum(["mcq", "select_all", "fill_blank", "closed"]);
export type ActivityType = z.infer<typeof ActivityType>;
