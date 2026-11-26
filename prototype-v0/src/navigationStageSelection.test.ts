import assert from "node:assert/strict";
import { it } from "node:test";
import { bicycleActionLeg } from "./bicycleAvailability.ts";
import { navigationStageAdjustmentAllowed } from "./navigationStageSelection.ts";

const point = { label: "Shared stop", lat: 47, lon: 8 };
const stages = [
  {}, {}, { leg: bicycleActionLeg("park", point, 0) }, {}, {},
  { leg: bicycleActionLeg("collect", point, 1) }, {},
  { leg: bicycleActionLeg("park", point, 2) }, {},
];
const allowed = (current: number) => stages.flatMap((_, target) => navigationStageAdjustmentAllowed(stages, current, target) ? [target] : []);

it("allows ordinary stage adjustment up to a pending action, including the action itself", () => {
  assert.deepEqual(allowed(0), [0, 1, 2]);
  assert.deepEqual(allowed(1), [0, 1, 2]);
  assert.deepEqual(allowed(2), [0, 1, 2]);
});

it("cannot undo a confirmed action or skip the next action at the same location", () => {
  assert.deepEqual(allowed(3), [3, 4, 5]);
  assert.deepEqual(allowed(5), [3, 4, 5]);
  assert.deepEqual(allowed(6), [6, 7]);
  assert.deepEqual(allowed(8), [8]);
});

it("requires separate confirmation for consecutive pickup and leave actions", () => {
  const consecutive = [stages[2], stages[5], {}];
  assert.equal(navigationStageAdjustmentAllowed(consecutive, 0, 1), false);
  assert.equal(navigationStageAdjustmentAllowed(consecutive, 1, 0), false);
  assert.equal(navigationStageAdjustmentAllowed(consecutive, 1, 2), false);
  assert.equal(navigationStageAdjustmentAllowed(consecutive, 1, 1), true);
});

it("preserves ordinary adjustment and rejects invalid saved or UI stage indices", () => {
  assert.equal(navigationStageAdjustmentAllowed([{}, {}, {}], 0, 2), true);
  assert.equal(navigationStageAdjustmentAllowed([{}, {}, {}], 2, 0), true);
  for (const target of [-1, .5, Infinity, NaN, stages.length])
    assert.equal(navigationStageAdjustmentAllowed(stages, 1, target), false);
  assert.equal(navigationStageAdjustmentAllowed(stages, -1, 0), false);
  assert.equal(navigationStageAdjustmentAllowed([], 0, 0), false);
});
