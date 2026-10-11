/** Release policy: access credentials do not establish production/reuse rights. */
export const EXPERIMENTAL_FARES_ENABLED: boolean = false;
export const EXPERIMENTAL_FARE_NOTICE = "Integration-system fare estimates are hidden. Check the current price with the transport operator.";
export const FACILITY_REUSE_NOTICE = "SBB Trafimage/INSA station facilities and page-derived Graubünden tourism water points are disabled pending reuse permission. OpenStreetMap facilities, swisstopo points and separately licensed SBB parking/timetable data remain available.";
export function facilityReuseAllowed(provider: string): boolean { return !["sbb", "graubuenden"].includes(provider); }
