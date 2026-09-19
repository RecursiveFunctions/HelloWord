import { PatchSchedulerProfileBody } from "@/lib/api";
import { SCHEDULER_PRESETS } from "@/lib/contracts/scheduling";
import { getProfile, updateProfile, type ProfilePatch } from "@/lib/store/review";
import { invalid, ok, readJson } from "../../_respond";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ profile: await getProfile(), presets: SCHEDULER_PRESETS });
}

/**
 * A preset is shorthand for three fields, so it is expanded here and then any
 * explicit field in the same request wins. That lets Settings offer "Demo" as
 * one click without preventing a hand-tuned retention on top of it.
 */
export async function PATCH(request: Request) {
  const parsed = PatchSchedulerProfileBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { preset, ...explicit } = parsed.data;

  const patch: ProfilePatch = {};
  if (preset) {
    const chosen = SCHEDULER_PRESETS[preset];
    patch.day_ms = chosen.day_ms;
    patch.learning_steps = chosen.learning_steps;
    patch.relearning_steps = chosen.relearning_steps;
  }
  Object.assign(patch, explicit);

  return ok({ profile: await updateProfile(patch) });
}
