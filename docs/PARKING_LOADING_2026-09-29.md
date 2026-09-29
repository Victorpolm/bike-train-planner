# Parking loading and error handling — 29 September 2026

## Report and diagnostic boundary

The owner saw both parking sources marked unavailable in version 32. The previous UI collapsed every fetch, HTTP, sign-in, JSON and source-validation error into the same “source unavailable / retry after a minute” text. That message did not establish a provider outage.

At **15:05:06 UTC**, authenticated deployed-API checks succeeded for both sources: **1,608 official** and **20,728 OSM** records, both freshly downloaded. The ETH Zentrum/Hönggerberg calculations still returned 42/38 m. The available production logs did not reproduce the reported browser failure; their relevant parking requests were successful. A working authenticated diagnostic request is not proof that the owner's browser cookie/session or embedded frame is working.

**The exact original cause remains unconfirmed.** Expired sessions, blocked browser requests, stale/wrong responses and upstream failures are now distinguished rather than choosing one explanation without evidence. No missing API key or simultaneous provider outage is asserted.

## Correction delivered

- The UI now requests separate versioned paths: `/api/parking/v3/official` and `/api/parking/v3/osm`. Old `/api/parking?source=...` clients remain supported. Development middleware and the production Worker both route the new paths.
- Browser requests use `cache: no-store`, JSON accept headers and same-origin credentials; responses are `private, no-store`. Existing server-side daily source caching remains, so avoiding stale browser responses does not mean re-downloading the providers on every click.
- Edge cache entries use distinct versioned paths and must match the requested provider, contain records and carry a valid non-future download timestamp. Legacy, corrupt or mismatched entries are ignored and refreshed instead of being returned as a valid source.
- The shared client keeps a **50-second deadline through body parsing** and preserves cancellation. A temporary network error, invalid/mismatched response or HTTP 502/504 gets at most one retry after a one-second delay. It does not immediately retry authentication errors or a provider's Retry-After response.
- Each source now displays a specific reason: sign-in refresh, denied access, connection failure, timeout, HTTP status/Retry-After, or invalid data. The fixed “retry after a minute” advice is removed unless a response actually requests that delay. Sign-in/network failures offer opening the planner in its own tab. No automatic login, credential change or access-policy change is made.
- Sources remain independent; a completed source survives the other one's failure. Closest still searches loaded records relative to A, with straight-line and partial-source disclosure. No routing, fare or GPS change.

## Verification

**220 tests passed**, 11 suites, zero failures/cancellations/skips; TypeScript/frontend/Worker builds passed. Seven added regressions cover versioned/cache-free requests, 401/403/HTML sign-in replies, wrong-source and connection recovery, truncated JSON, Retry-After, body-read timeout/cancellation and invalid edge-cache recovery. The earlier OSM/ETH tests remain passing.

The live verification below uses the exact new browser-loader function against deployed endpoints in Node, with the Site's authenticated verification header. It does not reproduce a browser cookie session, visual rendering or clicks. Browser interaction testing remains unavailable because the managed browser-control skill is absent.

**Live loader check passed at 15:14:11 UTC.** Both versioned endpoints returned HTTP 200/application-json, `Cache-Control: private, no-store`, schema `3` and the correct source headers. The exact loader accepted fresh official **1,608** and OSM **20,728** records without needing its retry. ETH Zentrum/Hönggerberg remained **42/38 m** to the same OSM objects. [Machine-readable evidence](experiments/parking-loader-live-2026-09-29.json).

All **139 tracked application files** were checked against the published Site checkout when preparing the matching GitHub update. The remaining verification gap is the original owner-browser session; successful server/client-code probes must not be described as browser-interaction QA.

## Publication and next check

Owner-private **version 33** succeeded at **2026-09-29 15:11:50 UTC**, environment revision **3**, Site source `774b1eff9a53e2d46f595181f277f2262bc633b1`, deployment `appgdep_6abbd524abfc8191a6fc98a3f40266e7`. No new key, paid service, schedule or sharing change.

Refresh the [planner](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site) and enable Bike parking. If loading still fails in the owner's browser, the new source-specific message is the next evidence needed; report its exact text instead of assuming an upstream outage.
