export type CyclingPace = { flatSpeedKmh: number; electricAssist: boolean };
export const CYCLING_PRESETS = {
  city: { label: "City", flatSpeedKmh: 15, electricAssist: false },
  relaxed: { label: "Relaxed", flatSpeedKmh: 20, electricAssist: false },
  regular: { label: "Regular", flatSpeedKmh: 25, electricAssist: false },
  sportive: { label: "Sportive", flatSpeedKmh: 30, electricAssist: false },
  electric: { label: "Electric", flatSpeedKmh: 25, electricAssist: true },
} as const;
export type CyclingPreset = keyof typeof CYCLING_PRESETS;
export const DEFAULT_CYCLING_PACE: CyclingPace = { flatSpeedKmh: CYCLING_PRESETS.regular.flatSpeedKmh, electricAssist: false };
export const MAX_PROFILE_SPEED_KMH = 45;
export const maxCyclingSpeed = (pace?: CyclingPace) => pace ? MAX_PROFILE_SPEED_KMH : 25;
export function validateCyclingPace(pace: CyclingPace) {
  if (!Number.isFinite(pace.flatSpeedKmh) || pace.flatSpeedKmh < 8 || pace.flatSpeedKmh > 35
    || typeof pace.electricAssist !== "boolean") throw new Error("Choose a flat-ground cycling speed between 8 and 35 km/h.");
}

// Constant-power resistance model, using the coefficients of BRouter's touring
// profile / StdPath: P = [m*g*(C_r + grade) + drag*v²]*v (SI units).
// The chosen flat pace calibrates power, not a discount on the whole route.
// E-bike support is a planning assumption: extra power on climbs, rising to
// 250 W at 3% grade and fading linearly between 20 and 25 km/h.
const GRAVITY = 9.81, ROLLING = .01, DRAG = .225;
export const cyclingMass = (pace: CyclingPace) => pace.electricAssist ? 105 : 90;
export function flatCyclingPower(pace: CyclingPace) {
  const v = pace.flatSpeedKmh / 3.6;
  return (cyclingMass(pace) * GRAVITY * ROLLING + DRAG * v * v) * v;
}
export function slopeSpeedKmh(grade: number, pace: CyclingPace) {
  const power = flatCyclingPower(pace), mass = cyclingMass(pace);
  let low = 0, high = MAX_PROFILE_SPEED_KMH / 3.6;
  // Bisection selects the positive root, including downhill coasting. The
  // resistance curve can initially be negative downhill, but crosses P once.
  for (let i = 0; i < 48; i++) {
    const v = (low + high) / 2;
    const assist = pace.electricAssist ? 250 * Math.max(0, Math.min(1, grade / .03))
      * Math.max(0, Math.min(1, (25 - v * 3.6) / 5)) : 0;
    const required = (mass * GRAVITY * (ROLLING + grade) + DRAG * v * v) * v;
    if (required > power + assist) high = v; else low = v;
  }
  return (low + high) / 2 * 3.6;
}
type ElevationSample = { distanceM: number; elevationM: number | null };
export function pacedRidingSeconds(samples: ElevationSample[], distanceKm: number, pace: CyclingPace) {
  validateCyclingPace(pace);
  let seconds = 0, coveredM = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], distanceM = b.distanceM - a.distanceM;
    if (distanceM <= 0) continue;
    const grade = a.elevationM === null || b.elevationM === null ? 0 : (b.elevationM - a.elevationM) / distanceM;
    seconds += distanceM / (slopeSpeedKmh(grade, pace) / 3.6);
    coveredM += distanceM;
  }
  // Missing elevation is explicitly disclosed; no invented climb correction.
  return seconds + Math.max(0, distanceKm * 1000 - coveredM) / (pace.flatSpeedKmh / 3.6);
}
export const paceDescription = (pace: CyclingPace) => `${pace.flatSpeedKmh} km/h on flat ground${pace.electricAssist ? " · electric climbing assistance" : " · rider power on climbs"}`;
