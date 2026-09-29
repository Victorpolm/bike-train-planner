# OpenStreetMap parking coverage — 29 September 2026

## Request and delivery

The owner reported missing ETH Zürich bicycle parking that is mapped in OpenStreetMap, and approved adding OSM to the existing official feed. The prior release used OSM only for map tiles, not searchable parking.

Private **version 32** adds OSM parking to the same **Bike parking** filter and **Find closest parking** action. The reference remains starting point A, with straight-line distance and no GPS request. Both sources load independently when parking is enabled. A failed source leaves the other usable, with an explicit incomplete-source message and retry action. Closest waits until loading settles, then searches all loaded records regardless of map centre/zoom; changing A recalculates it.

OSM-only pins appear from zoom 13; official pins from zoom 10. The selected closest pin remains visible at any zoom. At most 1,500 ordinary pins are drawn at once, with a zoom-in notice if limited. This display cap does not limit the closest calculation. Existing routing, fares and the bicycle-accompanies-traveller model are unchanged.

## Data and interpretation

- Keep the [official combined feed](https://opentransportdata.swiss/en/cookbook/road-traffic-cookbook/bike-and-car-parking/), filtered to `BIKE`.
- Add the [Swiss Overpass service](https://overpass.osm.ch/) using one fixed regional query: `[out:json][timeout:30];nwr["amenity"="bicycle_parking"];out center tags;`. No arbitrary user query, secret or starting coordinate is sent upstream.
- Import nodes, ways and relations. Ways/relations use Overpass representative centres, explicitly not entrances. Skip invalid coordinates, non-parking objects and explicitly disused/abandoned records.
- Preserve OSM object IDs/links, operator, rack type, capacity (including zero), cover, access, fee indication and raw mapped opening hours. Missing information stays unknown. Opening hours are not evaluated for arrival; capacities are not free-space counts. Access restrictions remain visible and restricted facilities can still be the closest **listed** result.
- The visible source attribution links to [© OpenStreetMap contributors / ODbL](https://www.openstreetmap.org/copyright); individual records link to their OSM objects. The public API exposes source records separately.
- Deduplicate by provider/object ID and explicit OSM object links. Proximity or equal generic names alone do not establish identity. Unresolved overlap stays separate and is disclosed; counts are **records**, not a verified count of distinct physical facilities. Capacities are never summed. Explicitly linked records retain both references, conflicts are labelled and restricted access is not promoted to public.

The download contained **20,729 OSM objects** (12,873 nodes, 7,845 ways, 11 relations); **20,728 were imported** after excluding one disused object. Raw response: 4,771,381 bytes, SHA-256 `2afe327b3c7b763c23caee154da31ff59f7d54c65fb15a69dbc054b9ab039407`. These are dated source observations, not an exhaustive physical inventory. The upstream `timestamp_osm_base` was not an ISO date, so it is not presented as a provider-update timestamp. Download time is not a survey date.

The complete downloaded dataset is not committed. Five attributed real OSM records form a small regression fixture in `prototype-v0/src/fixtures/eth-parking-osm.json`.

## Caching and failure handling

`GET /api/parking?source=official|osm` uses separate caches and shared in-flight requests. Successful data is fresh for 24 hours. Cloudflare's optional edge Cache API reuses public source data across cold handlers; an in-memory cache remains available if the edge cache fails. On refresh failure, data up to seven days old may be served with a stale label; older/missing data produces a source-specific 503. Failed OSM downloads have a 60-second cooldown. No scheduled job, storage binding, paid provider or new key is introduced.

The national OSM request has a 40-second client deadline and a 16 MiB response limit. HTTP-200 Overpass timeout remarks are rejected rather than accepted as a complete dataset. The prototype's private audience and daily caching bound current usage; reconsider acquisition/indexing before a large public rollout. [SOSM service terms](https://sosm.ch/about/terms-of-service/).

## Verification

- **213 application tests passed**, 11 suites, zero failures/cancellations/skips. Seven new cases cover actual ETH points/areas, both campuses and changed start, unknown/restricted access, duplicate/conflicting records, independent source failure, partial Overpass responses, cooldown/stale expiry and cache reuse across cold handlers.
- TypeScript, frontend and Worker production builds passed. The existing frontend chunk-size advisory remains non-blocking.
- The real downloaded OSM dataset yields `node/11811170403`, **42 m** from the ETH Zentrum test point **47.3763, 8.5476**, and `node/7936524432`, **38 m** from the ETH Hönggerberg test point **47.4077, 8.5077**. These are chosen public campus test coordinates, not user GPS or verified entrances.
- ETH-operated covered stands `node/321526421` are imported with the mapped capacity 48, public access and no fee. These are OSM descriptions, not a site inspection.
- Browser interaction/visual testing was unavailable because the managed browser-control skill is absent. No browser QA is claimed.

**Deployed endpoint verification at 14:30:38 UTC:** Both source endpoints returned fresh, non-stale data: 1,608 official records and 20,728 OSM records. The combined list contained 22,336 records; no cross-source explicit identity links were matched in this snapshot, so this is not a deduplicated physical-facility total. ETH-operated stands `node/321526421` are present. The production responses and published calculation returned:

| Starting point | Closest source/object | Straight-line distance |
|---|---|---:|
| ETH Zentrum, 47.3763, 8.5476 | OSM node/11811170403 | 42 m |
| ETH Hönggerberg, 47.4077, 8.5077 | OSM node/7936524432 | 38 m |
| Zürich HB, 47.378177, 8.540192 | Official Veloparking Zürich HB | 51 m |
| Bern station, 46.948825, 7.439122 | OSM node/9221548268 | 87 m |
| Biel/Bienne station, 47.13297, 7.24224 | Official Veloparking Biel/Bienne | 51 m |

[Machine-readable endpoint evidence](experiments/parking-osm-live-2026-09-29.json). This verifies source access and calculation, not rendered browser interactions or real-world entry.

## Publication and remaining work

Owner-private version **32** succeeded at **2026-09-29 14:28:31 UTC**, environment revision **3**. Published Site source: `caf56444e9fb7af9e1e8f9a2ca074624f4357cbe`; deployment: `appgdep_6abbcafb80e88191ad7315f53d2881dd`. Owner-only access was rechecked with zero external visitors. GitHub receives the matching application source and these release notes.

Refresh the [planner](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site), select an ETH starting point, enable **Bike parking**, wait for the two source statuses, then **Find closest parking**. Zoom in to browse additional local racks.

Next: try actual destinations, review unresolved duplicate identities and entrance/access evidence, then add municipal inventories. GPS, route-to-entrance distance, public-only/suitability filters, validated opening-at-arrival, live occupancy and other amenity categories remain separate future work.
