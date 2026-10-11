# Official cycling sections and launch review

_11 October 2026. Owner-authorised implementation. Switzerland-first; owner-private access is retained. This is an engineering and source-rights review, not legal, trademark or patent clearance._

## Delivered behaviour

Select a journey, open **Map → Official cycling routes → Find official routes**, choose a cycling section, then **Check this option** and **Use this route section**. Suggestions use the official SwitzerlandMobility ordinary cycling geometry displayed on swisstopo, not Komoot tours. Up to three continuous route sections progress toward the selected section's destination. The initial journey search does no additional work for this feature.

GeoAdmin's `ch.astra.veloland` layer supplies route number, title and geometry. The app preserves source attribution **Bundesamt für Strassen, Kanton, Stiftung SchweizMobil**, links the published route/stage and the official map, and labels the result as a Re.route itinerary using part of that route. No logos, photos, marketing descriptions, partner iframe, mountain-bike or hiking tours are copied. The [February 2026 publisher manual](https://images.schweizmobil.ch/files/Datenbezug%20SchweizMobil-Routen.pdf) distinguishes open-use attributed geometry from separately licensed editorial assets.

The app takes a continuous portion of one geometry part; it never draws a connector between disconnected source parts. BRouter computes a road path through at most 50 guides, respecting directed road access and normal terrain checks. The routed path must match at least 95% of the official corridor in both directions, using distance-weighted samples within 60 metres, with bounded snapping and detour length. These are pilot geometry checks, not proof that every metre is officially designated or currently passable. Connections to the user's actual section endpoints are checked separately.

The actual path and both connectors are checked against `ch.astra.veloland-sperrungen_umleitungen`. Machine roles distinguish closed ways from advisory detours. Intersecting closed ways reject the option; the app does not improvise a detour from a disconnected advisory line. Unknown roles, malformed/truncated responses, unavailable data and old closure checks prevent applying. Closure dates are unstructured, so even a future or unclear closure notice is conservatively treated as blocking. A 25-metre overlap tolerance can also reject a nearby parallel path. Today's published feed is not a forecast or a guarantee that no unreported closure exists.

The existing cycling-edit feasibility pipeline preserves exact trains, service evidence, stops and dwell times, and rechecks the whole-journey cycling bounds, permitted cycling placement, access/transfer limits, horizon, boarding allowances and arrival deadline. Apply rechecks the current journey. An official route is neither a confirmed reservation nor a promise of scenery, traffic-free riding or safety.

## Bounded work and performance

- Explicit user action only; at most three distinct routes. Search-area diagonal at most 120 km; selected official portion 0.5–80 km, with connector/detour limits.
- Allowlisted GeoAdmin endpoint/layers, 1 KB input, 4 MB upstream response, 30,000 retained vertices; two active upstream requests per server isolate. Duplicate requests coalesce. This is not a service-wide GeoAdmin quota.
- At most six server-memory queries; routes reused for 24 hours, closures for 15 minutes. Reaching the upstream result cap is explicitly partial, never silently complete. Closure evidence expires for application after 30 minutes.
- Road requests use the existing serial client queue. No automatic infinite scenic search, targeted-duration loop generator, nationwide route download or social network is included.

## Source and claim safeguards

| Concern | Implemented response | Remaining dependency |
|---|---|---|
| Trafimage/INSA facilities | Disabled server-side before cache/upstream access and client-side before loading/merging; old source caches removed; Zürich HB station-plan annotations removed | Written permission for the exact endpoint, fields and proposed public use before reenabling |
| Tourism-page water points | Graubünden/Flims-Laax page extraction also disabled because reuse rights were unverified | Rights-holder confirmation or a separately licensed replacement |
| Other SBB-derived sources | Separately licensed open parking, timetable and transfer data remain | Keep each dataset's terms distinct from Trafimage terms |
| Experimental fares | Integration-system quote requests and API responses disabled; reviewed published tariffs remain | Production fare arrangement and product/scope validation; unknown totals stay unknown |
| OSM | Canonical tile URL, visible attribution, ordinary browser caching, origin Referer; no tile prefetch/offline download | Public-service capacity, exact routing-data rights and applicable ODbL database offer before larger distribution |
| Official parking | Server/browser refresh changed to 30 minutes, following the stricter publisher update schedule | Capacity and field verification remain separate |
| Software dependencies | Full notices for 12 production packages plus Vite's bundled preload helper; licence generation checked by every build | Owner must choose any project-wide licence separately |

See the maintained [source register](DATA_SOURCE_REGISTER.md), also available inside the app as accessible HTML and JSON. It records 16 sources separately, including attribution, caching, redistribution, service limits and unresolved rights. It is not a blanket claim of clearance. The [Trafimage terms](https://doc.trafimage.ch/Bestimmung_Datenabgabe_v1_2024_DE.pdf) do not by themselves settle the exact INSA endpoint; disabling that integration resolves the immediate runtime exposure without asserting that all SBB data is restricted.

## Privacy audit and launch boundary

The header's **Privacy, sources & use** notice describes GPS, local profiles/saved journeys, third-party requests, recipients, retention that could be verified, user choices, and remaining unknowns. The legal operator and public privacy contact are deliberately unset because the owner has not supplied them. The notice clearly says it is incomplete for external launch. The app remains owner-private.

Code review covered browser geolocation, local storage/IndexedDB, timetable/routing/geocoding/map requests, Worker caches, logs and D1 quota storage. A current hosting-log sample showed URLs, IP-related fields, browser headers, cookie fields and signed-in account identifier/name/email header fields. No actual log values or account details are copied into this repository. Absence of app analytics does not imply absence of hosting logs or cookies.

One-shot origin and foreground navigation remain optional. Application code does not store a continuous GPS trace. Explicitly saved itineraries may contain GPS-derived endpoints and exact travel times. A two-stage **Delete this device's saved personal data** action removes the three known local personal-storage records and reloads; it does not promise to erase provider logs or downloaded reports. Provider-key hashes/hour counters are stored in D1, not journey endpoints; key-clock rows have no automatic deletion. Cache reuse TTLs are distinguished from physical retention.

The [BRouter notice](https://brouter.de/privacypolicy.html) and [Transport API notice](https://transport.opendata.ch/privacy.html) provide provider-specific retention facts. Hosting log/backup retention, all subprocessors, processing countries and necessary international-transfer safeguards still need confirmation from the hosting account/provider. Do not replace these unknowns with a Swiss-only claim. Swiss information duties are described by the [FDPIC](https://www.edoeb.admin.ch/en/duty-to-provide-information). Deliberate expansion to France/Germany requires an assessment of [GDPR territorial application](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en); simple EU accessibility alone is not treated as proof of targeting.

## Name and software rights

The preliminary web review found two similar names in the same broad field: [Re-Route](https://www.re-route.app/) for GPS navigation/group drives, and [Reroute](https://rerouteapp.ca/) for multimodal trip planning. This is evidence that professional conflict searching is warranted, not proof of a registered right or infringement. Swissreg/TMview could not be reliably inspected in this environment. There is no negative-search clearance. Check Re.route, Reroute, ReRoute, Re-Route and Re:Route with a trademark professional, including Swiss and relevant international rights; assess EU rights if expansion is planned. A domain or punctuation difference does not establish clearance. No patent search or freedom-to-operate opinion has been obtained.

GitHub metadata confirms the repository is public and lacks a selected repository licence. This release does not choose MIT, AGPL or another grant for the owner. `package.json`'s `private: true` prevents npm publication; it does not make GitHub private. See [LICENSING.md](../LICENSING.md) and the preserved third-party notices. Public source visibility and permission to reuse are separate.

## Concrete next actions for external launch

1. Owner: provide the operator's legal name and public privacy contact, desired software licence/reuse policy, intended countries and whether the service will remain noncommercial. Only then complete the public notice and project-wide licence.
2. Owner/provider: confirm hosting retention/countries/subprocessors and provider service allowances; obtain any missing public/commercial/cache rights. Do not enable the restricted enrichments before a written, source-specific decision. Production fare data needs a provider arrangement; the current [OJP fare documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/) describes test-system data.
3. Swiss counsel: review the exact privacy notice, terms and liability wording against the actual product; conduct trademark clearance and advise on any necessary patent review. No liability waiver or unsupported guarantee is published here.
4. Complete desktop/phone acceptance and a familiar ride, including closures, official-route application, saved routes, timing, GPS permission/Stop, local deletion and a delayed/cancelled train. Automated/server-render checks do not establish touch, layout, GPS accuracy or real-world path conditions.

### Unsent request prepared for SBB

Subject: Written reuse clarification for the Re.route station-facility integration

Re.route is currently an owner-private Swiss bicycle/public-transport planning prototype. We have disabled our Trafimage/INSA station-facility integration pending clarification. We would like to display selected facility records for ten major stations, using the INSA endpoint and field mapping documented in [our facility-source record](FACILITY_SOURCES_2026-09-30.md). The planned fields include facility names/types, mapped coordinates, floor/plan references, directions and opening-hour information. We are not proposing to reproduce station-map images or logos.

Please confirm the rights holder and applicable terms for this exact API and fields; whether public display in a free Swiss app is permitted; permitted attribution/link wording; caching (proposed 24-hour reuse and at most seven-day stale fallback); normalization and linking to independent OSM records; and whether saved/exported journey records or public repository fixtures may include these fields. Please identify any restrictions on commercial use, onward sharing, derived records, termination, update frequency and API volume. We will keep this source disabled until the permitted scope is recorded. This request is a draft and has not been sent.

### Counsel review brief

Review a Switzerland-first, presently owner-private, free journey-planning prototype with optional foreground GPS, local profiles/saved journeys, multiple independent API recipients and no booking/space guarantee. The current notice identifies incomplete controller/contact and hosting-country/retention information. Review final notice/terms only after these facts are supplied; distinguish data licences, API-service terms, software licences and trademark rights. Assess deliberate EU targeting separately. Review proposed public use of merged source records and any ODbL machine-readable offer, plus the two similar navigation/planning brand uses above. No external legal engagement or message has been initiated.

## Verification

Local verification: **654 JavaScript tests in 11 suites**, **16 Python tests**, **43 actual React render panels**, formatting, Knip and TypeScript/frontend/Worker builds. New regression cases cover multipart identity, reverse orientation, bounded results, shortcut rejection, closure roles/crossings, coalescing/expiry, input injection/size errors, cycling bounds, missed trains, cancellation, restricted-source suppression, fare blocking and personal-data deletion.

Live source smoke check on 11 October: a 5.0006 km portion of Route 32 near Zürich matched a 5.283 km BRouter path at 100% under the corridor metric. Routing estimated 18 minutes; the current closure check completed without an intersecting notice. The separate operation took 12.318 seconds. This direct-source smoke test excluded the elevation service; it does not measure initial journey search, phone performance or field conditions. [Compact evidence](experiments/official-cycling-live-2026-10-11.json). A small attributed geometry fixture protects this case against endpoint-shortcut regressions.

## Publication

Owner-private **version 72** published successfully on **11 October 2026 at 16:58:21 UTC**, environment revision **3**, from Site source `57f3a23e3008cc4d8181768fa2168b9721259b99`. The exact source was pushed before saving the matching frontend/Worker archive. The existing [Re.route URL](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site) is unchanged.

Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_f95aafb47e648191b4f300a5401265a9`; deployment: `appgdep_6acbc016830c8191ade3ef30132f710d` (`succeeded`). Access was rechecked after publication: one owner, no groups or external visitors. Runtime secret/environment bindings are unchanged.

Hosted checks passed at **16:59:29 UTC**: the app and source/licence documents load; restricted SBB and tourism endpoints return 451 with no-store; the fare endpoint returns 503 with its hidden-estimate notice; official routes and closures return complete bounded results for the Zürich test area (9 route records, 11 closure/detour records); out-of-country input returns 400. [Hosted evidence](experiments/official-cycling-hosted-2026-10-11.json). Browser interaction was not tested.

GitHub synchronization and CI confirmation follow in the release record.
