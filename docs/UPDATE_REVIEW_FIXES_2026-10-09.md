# Update review fixes and the next realtime step

_9 October 2026. Owner-authorized response to the attached “Bike + Train Planner — Update Review”, which reviewed GitHub commit `3198a7e07cc6f4bd4f48d8ae3fa1a6289c76d7c4`._

## Delivered

| Finding | Result |
|---|---|
| A mandatory reservation disappears after TripInfo returns another bicycle note | Unknown reservation updates preserve a known requirement even with VB, VC, VI, VK, VT or VN notes. Contradictory reservation evidence, including across responses, stays unknown and carries a conflict warning. Prohibitions remain prohibitions. |
| An unknown dated reservation becomes “not required” through an operator default | An explicitly unknown dated reservation no longer receives that fallback. Published policy can still supply a sourced reservation rule when no dated reservation field exists. Permission remains separate: an applicable operator policy may still establish carriage permission. More incomplete reservation/price comparisons are an intentional consequence of retaining uncertainty. |
| Known stations without platforms fall back to two minutes | If an exact general pair is unavailable and a station is identified from the feed's DIDOK/original IDs, use its largest published general intra-station minimum. Clearly label this as a station estimate. Keep exact OJP priority, validity/edition checks and walking already counted. Unknown IDs, conflicting stations and unmatched explicit platforms do not receive this estimate. The general two-minute fallback is not globally increased. |
| Confirmed-permission help implies dated evidence only | Help now explains dated service evidence **or** an applicable published operator policy. Neither establishes available bicycle space. |
| No climbing explanation when other objectives produce zero cards | Show the missing-elevation/eligible-journey explanation even with zero proposals. Consider all displayed batches, so a valid later alternative removes the notice. |
| The boarding winner can use a wider window than other badges | Window-scoped objective explanations state their comparison window. Fewer boardings explicitly identifies a wider allowance when applicable. The accepted 30-minute boarding value, 25% ceiling and separate general window are unchanged. |
| A second visitor receives a fare-busy error immediately | Admit up to four distinct pending quotes per handler instance, coalesce duplicates and serialize/pause every upstream call. Enforce a 50-second whole-check deadline, skip cancelled queued work and preserve upstream cooldown. Overflow receives 429 with Retry-After. This is a bounded queue, not a cross-instance quota service. |
| Straight-line experimental estimates ignore selected pace | Carry the selected flat pace through offline/synthetic estimates, station candidates and both solvers. Keep the historical 15 km/h default when no pace is supplied. Live routing still requires road geometry; a provider failure does not introduce a straight-line journey. Electric climbing assistance needs terrain and is not invented in flat estimates. |

The reservation rows are two protections for the same blocker; the remaining six review areas are also handled. Source changes cover carriage evidence, transfer lookup/checks, recommendations, fare handling and pace propagation, with regression coverage beside the existing tests.

## Verification and publication

- **452 tests in 11 suites pass**, including eleven new regression cases. Two older operator-fallback expectations now explicitly distinguish an absent dated field from an unknown dated requirement. The historical discovery fixture explicitly retains its original 15 km/h pace.
- TypeScript, frontend and Worker production builds, React formatting, Knip and whitespace checks pass. The existing frontend bundle-size advisory remains.
- Golden cases include a required reservation followed by every unrelated bicycle-note code, same-response and successive-response conflicts, complete-price/reservation exclusion for unknowns, Zürich Altstetten's missing-platform three-minute minimum, another station's four-minute maximum, incorrect/changed station identities, expiry, walking counted once, and the wider 75-minute boarding comparison.
- Fare cases cover four concurrent visitors, duplicate coalescing, bounded overflow, one upstream call at a time, cache reuse, cancellation, deadline and provider cooldown. Pace cases check train-catching feasibility in both solvers and refusal to substitute an estimate for missing routed geometry.
- Published owner-private **version 60** from Site source `2f0d2bcff6466dd0f6125b0dfe4da1ef375b2508` on **9 October 2026 at 13:41:22 UTC**. Environment revision remains **3**. Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_dc1f3ff1eaa081919cabb545a25099aa`; successful deployment: `appgdep_6ac8eeec8cf08191982b791949580533`.
- The release uses the exact pushed source and its matching build archive. Runtime secrets and audience are unchanged. Browser/phone interaction remains pending because this session had no supported browser preview capability. No fresh live-provider result is claimed.

The review's independent corridor percentages, 320,000-case cache fuzz run and large synthetic-network stress figures belong to the supplied report. Its external `stress/` harness was not attached; those measurements were not rerun and are not claimed as new validation. A larger routing-engine/algorithm migration remains deferred. Measure representative bounded searches and investigate truncation before expanding coverage or claiming exhaustive optimality.

## Next important feature: live updates on the selected public transport

**Owner priority:** Show delays on the actual selected train, bus or other public-transport service. This comes after these fixes and before optional parking/useful-stop/product extensions. Keep the outstanding phone/desktop release acceptance pass alongside that work.

**Current code fact:** `ojpTripRequest` and `ojpTripInfoRequest` in `src/ojp.ts` both send `UseRealtimeData=none`; the current journey model does not retain separate scheduled and estimated times. Fare compatibility lookup also requests scheduled data. Therefore the absence of delays is an application integration gap, not evidence that all SBB data is fixed. The bundled GTFS transfer edition is a separate static source and does not provide live delays.

1. Verify the provider's supported realtime request mode, fields, availability and permissions with a dated live response for an identifiable selected service and operating day.
2. Preserve scheduled service/stop identities and times for retained fares and bicycle evidence. Add separate estimated times, delay, cancellation and platform-update fields; never silently replace those matching keys with realtime values.
3. Show scheduled versus updated departure/arrival, disruption state, source and last-check time. Missing or stale realtime data must say so; it must not be shown as zero delay.
4. Refresh the selected journey with bounded, cancellable requests and provider pacing. Re-evaluate onward connections, final arrival and arrival deadlines; a cancellation or missed connection must stop being presented as feasible. A changed platform requires a new transfer lookup.
5. Add fixtures for delayed arrivals/departures, early arrivals, cancellations, platform changes, unknown/stale data, midnight and missed connections, plus live and phone/desktop acceptance.

This entry records the next implementation priority. It does not claim realtime support is already delivered, promise bicycle-space availability, or create a scheduled automation.
