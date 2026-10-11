# Fares, bicycle profiles and automatic renewal monitoring — 11 October 2026

**Follow-up:** The [public-data reliability release](PUBLIC_TRANSPORT_RELIABILITY_2026-10-11.md) extends this implementation. Its 24-source bounded monitor, rotating canary and public-tariff strategy supersede the five-source/fixed-corridor and blanket production-feed dependency descriptions below. The version-73 evidence remains historical.

## Delivered behaviour

One profile represents one person and one bicycle. Age is the age on the travel date, not a stored birth date. Adult pricing is explicitly assumed if it is blank. The profile now records passenger class, GA class, travelcard validity, qualifying child cards/accompaniment, organized groups, an existing dated/day/multiple-day/annual or formally issued mobility bicycle pass, and unverified regional-pass name/operator/zones/validity. The mobility entitlement is never inferred from disability or bicycle type.

Bicycle fields distinguish ordinary, folding, child/balance, cargo, tandem, recumbent, adaptive and other bicycles; unfolded/folded/bagged carriage; length; pedal/25-km/h assist/45-km/h assist/other drive; attached/detached trailers and width; and self-loading. They feed eligibility, reservation ranking, fares, saved profiles and saved routing snapshots. Motor configuration is separate from the rider's cycling-pace assistance setting. This does not certify cargo/trailer/S-pedelec street-path suitability.

Children aged 6–15 only receive the reviewed free bicycle concession with qualifying accompaniment or their own qualifying GA, outside organized-group conditions. They still need compulsory reservations. Child passenger concessions are evaluated separately: a Junior card needs the qualifying parent; a Children's Co-travelcard needs its named qualifying companion, subject to its limits. An expired Half Fare/GA/card cannot generate a discount. Child fares are not reduced twice. Under-six hand-luggage treatment is tied to the actual child/balance-bike configuration, not arbitrary cargo bicycles.

Properly folded/bagged luggage, bicycles over two metres, operator-specific special-bicycle prohibitions and trailer uncertainty are evaluated separately from ticket entitlement. Unknown fit, unreviewed packing exceptions or trailer fares remain explicit operator questions. BLS folded-only packing remains unconfirmed without a bag. Dated vehicle restrictions take priority. Ordinary PostBus access stays unverified without the selected service's evidence because its line-specific exclusions/reservation conditions are not equivalent to a general city network space rule.

Prices carry a product, flexibility, availability, source, validity and production/test provenance. Unknown prices have reasons and operator links. All bicycle/reservation/total components are unknown for prohibited carriage, including with an annual bike pass. Restricted/unknown-flexibility offers cannot win the flexible-price objective. Test-system online quotes remain disabled. Compatibility numeric fields are derived from the qualified result, not independently calculated. Reviewed ZVV/Z-Pass corridor fares remain second-class only; unsupported first-class fares and regional-pass coverage explicitly need an operator quote. A six-day bicycle pack is shown separately (CHF90, changing to CHF96 on 13 December 2026); it is not added to a single journey total.

Live leg times retain scheduled time, signed delay, checked time and freshness. Missing estimates do not mean punctual. Broken/cancelled connections suppress the old arrival/duration and cannot start navigation. The recovery panel searches at most three onward alternatives within a two-hour search horizon, after explicit confirmation of the current stop and completed sections. It subtracts used cycling/boarding budgets, preserves unfinished visits and bicycle custody, keeps the original until a choice is accepted, and does not assume old tickets are valid. GPS navigation retains its existing explicit recalculation. `laterDepartures` searches a full trip, so it was not reused as though it were onward recovery. No automatic claim that a traveller has completed a leg is made from the clock.

## Corrections to the attached ideas

- ZVV does accept the national Bike Day Pass and annual bike pass for bicycle carriage. The reviewed VBZ/VBG/VZO/Stadtbus Winterthur modes now recognize that scope; a train-plus-tram journey does not automatically require two bicycle tickets. Passenger through fares remain separate.
- “Under 16” alone is not sufficient for every free-bike case; accompaniment, qualifying child GA and organized-group exclusions matter.
- The year-round IC reservation exception is the reviewed Zürich–Schaffhausen international corridor, not every arbitrary service named IC4.
- Unsupported bike-type and passenger products remain unknown rather than inventing prices from a similar product.

## Getting source data automatically before expiry

The private Site's persistent monitor offers:

| Endpoint | Purpose |
|---|---|
| `POST /api/maintenance/check` with `X-Maintenance-Intent: review` | Daily bounded run: one quota-accounted Zürich HB–Bern OJP query; source retrieval at most weekly, or retry on the next run after retrieval failure |
| `GET /api/maintenance/status` | Persisted check time, source hashes/change/error states, expiry warnings, last 30 canary samples and stale-monitor detection |
| `GET /api/maintenance/sources/{id}` | Download last retained official HTML/PDF candidate; only when status says `candidateSaved` |
| `GET /api/maintenance/fixture` | Last bounded raw provider response containing real `EstimatedTime`, when captured |

Sources are the ZVV single-ticket page, Z-Pass tariff page, SBB Bike Day Pass page, Alliance SwissPass T600 and its participating-operator list. Fetches use fixed HTTPS sources, bounded bodies/timeouts and same-publisher redirects. Successful downloads retain hash, date, byte count and candidate bytes up to 750kB; larger valid files keep their official URL and hash. HTML changes can be unrelated to fares. A changed hash is a review request, not a new price. Downloads are private review material and are not automatically republished in this public repository.

A persistent D1 daily lease limits duplicate invocations across workers; an interrupted run cannot silently spend another call. Failed/stale runs are visible. The OJP request uses the existing shared credential quota. No personal journey, GPS history, API secret or upstream diagnostic is stored. Raw live fixtures are redacted against the configured key, capped at 600kB, and labelled independently from synthetic tests.

The linked Site schedule runs weekday mornings at 08:30 Europe/Zurich. Every run reads back persisted status. It alerts on source changes, fetch failures, the 60-day renewal window, stale checks, and five consecutive weekday samples with no estimates. Missing/error samples are not counted as successful no-estimate observations. Absence of estimates on one corridor is an investigation signal, not proof of a provider outage.

The public repository also has **Tariff expiry watch**, scheduled daily at 06:15 UTC. It needs no secrets or network tariff requests. `npm run check:tariffs` becomes red within 60 days of a reviewed cutoff. Do not extend a date merely to make it pass. The ZVV/Z-Pass and conservative T600/coverage review boundary is 12 December 2026: the 60-day warning begins 13 October. The independently published bike-day price table extends through 11 December 2027; this does not automatically extend operator acceptance or child-rule review coverage.

Renewal procedure:

1. Read monitor status and download changed/new official source candidates before the boundary.
2. Confirm effective dates, all affected zones/classes/products and bike acceptance with the publisher. Prefer a contracted/versioned feed or change-notification channel over HTML parsing.
3. Update the actual price/rule tables and `src/tariffSources.ts` together. Add examples on both sides of the effective date, including child/card/class/special-bike cases.
4. Run offline tests, rendered panels, expiry checks and the build. Review the diff, publish the private Site, and synchronize GitHub main.
5. Re-read monitor status. If renewal data is unavailable, keep the expired result explicit and link to the operator's current quote.

This separates automated retrieval from approval of a transport tariff. A reliable nationwide first-class/discount/group quote still requires production fare access and the provider's supported products; the integration fare endpoint has not been re-enabled.

## Unattended maintenance run instructions

For the linked schedule: use Sites `get_site` for the injected/selected project. Confirm it is the owner's private Re.route Site with no external viewers. Use its current Site origin and server-supplied bypass credential only for that origin; pass secrets in memory/stdin, never arguments, logs, files or messages. Request POST `/api/maintenance/check` with `X-Maintenance-Intent: review`, then GET `/api/maintenance/status`. Do not open or modify the app source to run the monitor. `already-claimed` means read back completion/staleness, not force another run. If the response fails or was not persisted, report it; do not describe it as successful. Tell the user about actionable changes, errors, upcoming expiries and canary alerts. Never silently change fares, access settings or source dates, and never contact operators.

The writer relies on owner-private Sites dispatch plus an explicit custom header and same-origin browser check. Before sharing or making the Site public, add independent server-side writer authorization or remove the maintenance writer. A browser header by itself is not authorization. No credential is embedded in the scheduled prompt or repository.

## Working with local public transport

Start with a small corridor pilot: ZVV/VBZ for urban links and zone/pass rules, SBB/Alliance SwissPass for national products and machine-readable tariff changes, and PostBus/BLS/RhB/SOB for specific regional bicycle/vehicle exceptions. Expand to tpg/other networks only with reviewed coverage. Request evidence for the exact missing cases, not a generic “bikes allowed” statement.

| Ask the operator for | Record with the answer |
|---|---|
| Tariffs by passenger age, class, travelcard, zones and ticket validity | Product ID, currency/amount, effective dates, transfer/through-ticket rules and test/production status |
| Bicycle and trailer acceptance | Type, dimensions, loading method, operator, line, direction, boarded segment, vehicle and seasonal/peak restrictions |
| Reservations | Required dates/services, booking method/deadline, price, through-booking rules and whether capacity is actually available |
| Ongoing updates | Stable API/feed/document URL, version/hash, change notices, technical contact and reuse permission |
| Station bicycle access | Entrances, lifts, stairs, platform paths and explicit restrictions; ordinary transfer minutes do not establish accessibility |

Journey → Data quality and corrections now exports the exact public-transport service/date/segment, profile, current evidence, prices and a structured list of unanswered operator questions. The user reviews what to share; nothing is sent automatically. Replies are reviewed, dated and tested before changing the app. This is the practical path toward better precision without turning missing information into assumed permission.

## Verification and release evidence

Offline verification includes 666 JavaScript tests, 16 Python tests and 47 server-rendered panels, plus TypeScript/frontend/Worker builds, formatting and unused-code analysis. Added regressions cover child boundaries/accompaniment, expired cards, pass dates, malformed dimensions/dates, prohibited and restricted fares, special bicycle eligibility, source expiry, persistent concurrent monitor calls, raw fixture capture, missing weekday samples and onward budget/custody preservation. Browser and physical-phone interaction remain unverified because the supported browser QA capability is unavailable in this environment. No browser acceptance is claimed.

Hosted version, live monitor readback, scheduling and GitHub synchronization evidence are recorded after deployment below.

### Confirmed hosted evidence

Owner-private **version 73** deployed successfully at **2026-10-11 19:27:57 UTC**, environment revision **3**, from pushed Site source `e4be760d33c09ac903bd330678ba1e145cabe436`. Saved version `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_285a27584cd881918b486d7b25317886`; deployment `appgdep_6acbe3279e6c8191b224cdaf898d8b3d`. Access was read back: one owner, zero groups and zero external visitors.

The live POST and subsequent GET both returned HTTP200. At **19:28:17 UTC** the fixed Zürich HB–Bern sample contained **34 raw EstimatedTime fields**; the production parser recovered **seven services with estimates**. The downloaded [raw response](fixtures/ojp-canary-2026-10-11.xml) was parsed again locally with the same result. This is real provider data, separate from the synthetic fixture used in monitor tests.

Initial source retrieval: ZVV and Z-Pass HTML succeeded and were retained; both Alliance SwissPass PDFs succeeded (hashes recorded; documents exceeded the conservative candidate-retention size and remain available via their official URLs). The SBB Bike Day Pass HTML download failed; it remains explicitly marked error and will retry on the next scheduled run. No validity date was extended. The Sunday setup sample does not count toward the five-weekday diagnostic, which begins with the first weekday run.

The linked **Check Re.route tariffs and live data** schedule was saved enabled for weekdays at **08:30 Europe/Zurich**. Writer capability was verified before scheduling; a future unattended execution has not yet occurred.
