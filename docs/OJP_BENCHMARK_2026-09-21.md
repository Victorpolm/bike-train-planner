# First live OJP bicycle-evidence benchmark

**Result:** The repository secret works. All 16 OJP requests completed successfully, and every case returned transit journeys. OJP supplies useful dated bicycle notes, but this sample does not provide positive bicycle evidence on every leg of any complete journey. The website's confirmed-permission group must not be populated merely because OJP returned a trip.

## Reproducibility

- [Successful Actions run](https://github.com/Victorpolm/bike-train-planner/actions/runs/35604479414), captured **21 September 2026, 13:15–13:16 UTC**, from commit `6196e15fcbea47d9438e8e2c889a5e1a2b4d9475`.
- The first run used the original dated inputs. The [current manifest](../.github/ojp-benchmark-run.json) generalizes the Zürich origin to a public stop. Departure date: Tuesday **22 September 2026**, Europe/Zurich (`+02:00`). The late Libingen case arrives on 23 September.
- Eight otherwise identical request pairs, `BikeTransport=false/true`, six requested results and `UseRealtimeData=none`. Provider-default access was walking, not the app's bicycle routing.
- The original run artifact is retained by Actions until 28 September and includes its original inputs; it must not be republished. ZIP SHA-256: `9d832611da184336407fc30fccf298aa9e34be55d56cc81e020d0c97c6f0b389`.
- Initial summaries missed `PublicCode`/`PublishedServiceName` and nested active-leg durations; raw XML was intact. The parser was corrected and all 16 saved responses were reprocessed locally, with **no additional API calls**. A [reduced real bus-31 response](../prototype-v0/scripts/fixtures/ojp-zurich-night-2026-09-21.xml) preserves the overnight timing/field regression. It omits endpoint geometry and intermediate stops.

The first Zürich case used a user-selected local origin, omitted from this public report. Future runs use the public **Zürich, Waserstrasse** stop instead; their access times will therefore differ. Küsnacht uses **Küsnacht ZH railway station** as a reference, not a reproduction of the user's unspecified origin. Other endpoints are public places already recorded by the app.

## Returned journeys

Times below include waiting from the **requested** departure to arrival at the destination. They describe the earliest arrival among the returned journeys, not a proven global optimum. Earliest arrival was the same with the bicycle filter off and on in all eight cases.

| Journey | Requested Swiss time | Trips off / on | Earliest arrival | Elapsed from request |
|---|---|---:|---|---:|
| Zürich local origin → Zürich HB | 08:00 | 6 / 6 | 08:31 | 31 min |
| Zürich local origin → Zürich HB | 01:54 | 7 / 6 | 05:32 | 218 min |
| Küsnacht ZH station → Zürich HB | 08:00 | 6 / 6 | 08:18 | 18 min |
| Küsnacht ZH station → Zürich HB | 01:54 | 6 / 6 | 05:15 | 201 min |
| Libingen → EPFL | 08:00 | 6 / 6 | 12:35 | 275 min |
| Libingen → EPFL | 23:20 | 7 / 7 | 10:35 next day | 675 min |
| Zürich HB → Laax GR, posta | 08:00 | 6 / 6 | 10:16 | 136 min |
| Rapperswil SG → Renens VD | 08:00 | 6 / 6 | 11:22 | 202 min |

The daytime Zürich local result includes **bus 31 directly from Zürich, Waserstrasse to Zürich, Bahnhofplatz/HB**, with walking access/egress. Its first boarding is at 08:08. At night, the earliest returned trip starts at 05:06 and boards at 05:12. OJP's `Duration=PT26M` excludes **192 minutes before that start**, making the complete answer **218 minutes from 01:54**. The benchmark now records both values explicitly. This corroborates overnight waiting as a real possibility; it does not reproduce the date of the user's earlier 02:08/04:57 example or compare current bicycle durations.

Rapperswil–Renens is present, with the earliest returned option changing at Zürich HB. The default-access Libingen case instead uses Libingen's local bus, rail and the EPFL metro. It does not evaluate cycling to Rapperswil; that requires a separate, road-routed access calculation.

Seven case pairs returned the same dated service/segment identities. The unfiltered Zürich local night response additionally returned a bus 703 → tram 2 → S3 option. Its absence from the filtered result is **not** treated as an explicit prohibition: bounded result selection and underlying filter rules need separate validation. A request for six results sometimes returned seven, as permitted by the provider's documented tie behavior.

Observed request latency: **0.649–3.315 seconds**, median **0.941 seconds**; about 44 seconds for the full sequential capture including pacing and location lookup. This is one run from a GitHub-hosted runner, not an end-user latency guarantee.

## Bicycle evidence actually returned

| Dated service/segment, 22 September | Observation | Appropriate interpretation |
|---|---|---|
| Bus 81, Chur Postautostation 09:28 → Laax 10:18 | `A__VR` plus `I_1Ux` require bicycle reservation and point to SBB Mobile/sbb.ch | Service-specific reservation condition; no reservation availability or completed booking was returned |
| Bus 411, Ilanz Bahnhof/Post 10:04 → Laax 10:16 | `I_9w2` permits carriage without reservation when sufficient space exists and disclaims a carriage guarantee | Positive, conditional information for this service; remaining capacity is unknown |
| Several long-distance rail segments toward Renens | `A__VR` bicycle-reservation note | Preserve the requirement on its exact service and segment |
| Returned local Zürich buses/trams and Küsnacht rail legs | No bicycle-specific service note | Unknown under the app's strict evidence model, even when `BikeTransport=true` returned them |

Across **102 distinct dated service/segment/departure combinations**, bicycle-related text appeared on **6 of 25 bus segments** and **11 of 59 rail segments**; none appeared on the 5 tram or 13 metro segments. This measures explicit note coverage in this small sample, not actual permission rates. General low-floor, passenger-seat reservation and group-reservation notes are not bicycle permission.

The returned PostBus conditions align with its [official bicycle guidance](https://www.postauto.ch/en/travel-and-services/travel-advice-and-reservations/travelling-with-a-bike), which distinguishes reservation routes from carriage subject to available space. The [official OJP documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/) explains the filter and attributes, and warns about restrictions at particular stops. Dynamic `I_*` identifiers must not become unconditional permission rules. These observations still need a reviewed interpretation with validity, bicycle type, operator identity and segment scope before production use.

## Implementation consequence

Keep the two independent optimizations. OJP is a promising source for transit discovery and bicycle conditions, but filter inclusion alone cannot establish the confirmed group. The current static website has not been migrated to OJP and cannot safely hold this key.

The next implementation is a **server-side OJP adapter** with cached responses and explicit service/segment evidence. Preserve unknowns and reservation/space conditions; recalculate actual bicycle access and boarding readiness before selecting connections. Review identifier mapping, omitted restrictions, later alternatives and multiple requested stops before replacing the existing timetable source. An Actions secret proves API access; it does not configure a website backend.

Verification for this change: **105 app tests, 8 Python benchmark tests and the production build passed**. The live run passed all 16 calls; the revised parser was checked against all saved responses. No additional website deployment was required for evaluation scripts and documentation.
