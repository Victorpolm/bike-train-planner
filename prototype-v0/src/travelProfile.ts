/** One traveller and their bicycle. Entitlements never establish vehicle space. */
export type BicycleProfile = {
  kind: "ordinary" | "folding" | "child" | "balance" | "cargo" | "tandem" | "recumbent" | "adaptive" | "other";
  carriage: "unfolded" | "folded" | "bagged";
  lengthCm: number | null;
  drive: "pedal" | "assist25" | "speed45" | "other";
  trailer: "none" | "detached" | "attached";
  trailerWidthCm: number | null;
  selfLoading: boolean;
};
export type TravelProfile = {
  age?: number | null;
  travelClass?: "second" | "first";
  gaClass?: "second" | "first";
  passValidFrom?: string; passValidThrough?: string;
  accompaniedBy16Plus?: boolean;
  organizedGroup?: boolean;
  childCard?: "none" | "junior" | "co-travel" | "child-ga";
  qualifyingCompanion?: boolean;
  bicycle?: BicycleProfile;
  existingBikePass?: "none" | "day" | "multi-day" | "mobility";
  bikePassDate?: string;
  bikePassValidThrough?: string;
  otherPass?: { name: string; operator: string; coverage: string; validThrough: string };
};
export const DEFAULT_BICYCLE: BicycleProfile = { kind: "ordinary", carriage: "unfolded", lengthCm: null,
  drive: "pedal", trailer: "none", trailerWidthCm: null, selfLoading: true };
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => values.includes(v as T) ? v as T : fallback;
const dimension = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 600 ? v : null;
export const validProfileDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const date = (v: unknown) => validProfileDate(v) ? v : v ? "invalid" : "";
export function readBicycle(value: unknown): BicycleProfile {
  let p = value as Partial<BicycleProfile> | undefined;
  if(p?.lengthCm!=null && dimension(p.lengthCm)===null || p?.trailerWidthCm!=null && dimension(p.trailerWidthCm)===null) p={...p,kind:"other",drive:"other"};
  return { kind: oneOf(p?.kind, ["ordinary", "folding", "child", "balance", "cargo", "tandem", "recumbent", "adaptive", "other"], p?.kind === undefined ? "ordinary" : "other"),
    carriage: oneOf(p?.carriage, ["unfolded", "folded", "bagged"], "unfolded"), lengthCm: dimension(p?.lengthCm),
    drive: oneOf(p?.drive, ["pedal", "assist25", "speed45", "other"], "pedal"),
    trailer: oneOf(p?.trailer, ["none", "detached", "attached"], "none"), trailerWidthCm: dimension(p?.trailerWidthCm), selfLoading: p?.selfLoading !== false };
}
export function readTravelProfile(value: unknown): TravelProfile {
  const p = value as TravelProfile | null;
  if (!p || typeof p !== "object") return {};
  const result: TravelProfile = {};
  if (p.age !== undefined) result.age = Number.isInteger(p.age) && p.age! >= 0 && p.age! <= 120 ? p.age : null;
  if (p.bicycle) result.bicycle = readBicycle(p.bicycle);
  if (p.travelClass) result.travelClass = oneOf(p.travelClass, ["first", "second"] as const, "second");
  if (p.gaClass) result.gaClass = oneOf(p.gaClass, ["first", "second"] as const, "second");
  if (p.childCard) result.childCard = oneOf(p.childCard, ["none", "junior", "co-travel", "child-ga"] as const, "none");
  if (p.existingBikePass) result.existingBikePass = oneOf(p.existingBikePass, ["none", "day", "multi-day", "mobility"] as const, "none");
  for (const key of ["accompaniedBy16Plus", "organizedGroup", "qualifyingCompanion"] as const) if (p[key] !== undefined) result[key] = p[key] === true;
  for (const key of ["passValidFrom", "passValidThrough", "bikePassDate", "bikePassValidThrough"] as const) if (p[key] !== undefined) result[key] = date(p[key]);
  if (p.otherPass?.name) result.otherPass = { name: String(p.otherPass.name).slice(0,80), operator: String(p.otherPass.operator ?? "").slice(0,80),
    coverage: String(p.otherPass.coverage ?? "").slice(0,200), validThrough: date(p.otherPass.validThrough) };
  return result;
}
export const travelProfileKey = (profile?: TravelProfile) => {
  const fare=profile as (TravelProfile & {passenger?:string;annualBikePass?:boolean})|undefined;
  return JSON.stringify({...readTravelProfile(profile),passenger:fare?.passenger,annualBikePass:fare?.annualBikePass});
};

export const childBikeFree = (p: TravelProfile) => p.age !== null && p.age !== undefined && p.age < 16 &&
  (p.age < 6 || !p.organizedGroup && (p.accompaniedBy16Plus || (p.childCard === "child-ga" || (p as TravelProfile & {passenger?:string}).passenger === "ga")));
export const validPassOn = (p: TravelProfile, day: string) => (!p.passValidFrom || date(p.passValidFrom)!=="invalid" && p.passValidFrom <= day) && (!p.passValidThrough || date(p.passValidThrough)!=="invalid" && p.passValidThrough >= day);

export function validTravelProfile(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const p = value as TravelProfile;
  if (p.age != null && (!Number.isInteger(p.age) || p.age < 0 || p.age > 120)) return false;
  const enums = { travelClass:["first","second"],gaClass:["first","second"],childCard:["none","junior","co-travel","child-ga"],existingBikePass:["none","day","multi-day","mobility"] };
  for (const [key, values] of Object.entries(enums)) if (p[key as keyof TravelProfile] !== undefined && !values.includes(p[key as keyof TravelProfile] as string)) return false;
  for (const key of ["accompaniedBy16Plus","organizedGroup","qualifyingCompanion"] as const) if(p[key] !== undefined && typeof p[key] !== "boolean") return false;
  if (![p.passValidFrom,p.passValidThrough,p.bikePassDate,p.bikePassValidThrough,p.otherPass?.validThrough].every(d=>d===undefined||d===""||validProfileDate(d))) return false;
  if (p.passValidFrom && p.passValidThrough && p.passValidFrom>p.passValidThrough) return false;
  if(p.bicycle) {
    const b=p.bicycle;
    if (!['ordinary','folding','child','balance','cargo','tandem','recumbent','adaptive','other'].includes(b.kind) || !['unfolded','folded','bagged'].includes(b.carriage) || !['pedal','assist25','speed45','other'].includes(b.drive) || !['none','detached','attached'].includes(b.trailer) || typeof b.selfLoading!=="boolean") return false;
    if (![b.lengthCm,b.trailerWidthCm].every(n=>n===null||dimension(n)!==null)) return false;
    if(b.carriage==='folded'&&b.kind!=='folding') return false;
  }
  return true;
}
