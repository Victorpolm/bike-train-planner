import type { NavigationStage } from "./navigation.ts";

/** Adjusting progress may neither confirm nor undo a bicycle action. Forward
 * selection may land on the pending action; only its confirmation passes it. */
export function navigationStageAdjustmentAllowed(stages: readonly Pick<NavigationStage, "leg">[], current: number, target: number) {
  if (!Number.isInteger(current) || !Number.isInteger(target) || current < 0 || target < 0
    || current >= stages.length || target >= stages.length) return false;
  return stages.slice(Math.min(current, target), Math.max(current, target))
    .every(stage => !stage.leg?.bicycleAction);
}
