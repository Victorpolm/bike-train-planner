import snapshot from "./data/tlm-water-2026-02.json" with { type: "json" };
import { tlmWaterAmenity } from "./tlmWater.ts";
import type { FacilityData } from "../src/facilitySources.ts";

// A compact derived application index, not the national DBF/SHP/ZIP dataset.
// Edition/import dates are fixed. Rebuild it explicitly after a source review.
export const TLM_WATER_SNAPSHOT: FacilityData = { schema: 1, provider: "swisstlm3d", key: "swisstlm3d", fetchedAt: snapshot.importedAt,
  facilities: snapshot.points.map(p => tlmWaterAmenity(p, snapshot.importedAt)) };
