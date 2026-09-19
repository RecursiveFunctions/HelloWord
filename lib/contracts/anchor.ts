import { z } from "zod";

export const SelectorBundle = z.object({
  exact: z.string().min(10), // refuse shorter: fuzzy search explodes
  prefix: z.string().max(64),
  suffix: z.string().max(64),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type SelectorBundle = z.infer<typeof SelectorBundle>;

export const AnchorStatus = z.enum(["anchored", "orphaned", "detached"]);
export type AnchorStatus = z.infer<typeof AnchorStatus>;
