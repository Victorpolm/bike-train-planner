# Buses with an accompanied bicycle

_Implemented and sources reviewed: 2026-09-20. Scope: one standard, unfolded bicycle._

## What the app now does

Buses were already returned by timetable searches. The change preserves the service category and operator, evaluates a small maintained set of bicycle policies, and applies the selected bus preference before routing labels or category winners are calculated. It works in Baseline, Extended and journeys with requested stops.

The form offers **Buses with my bicycle**:

| Choice | Bus eligibility |
|---|---|
| Published bicycle rules · check conditions (default) | Include operators with a matched conditional bicycle policy; exclude unverified bus rules and matched prohibitions. |
| Also include unverified buses | Also explore buses with missing/unmatched rules, visibly marked unverified. Matched prohibitions remain excluded. |
| Avoid buses | Exclude recognized bus and replacement-service categories. Other transport modes remain available. |

The default does **not** mean the selected departure is confirmed to carry bicycles. Operator policies can have route-specific exceptions. Confirm the actual service, any reservation and available space. Train, tram and other carriage checks remain future work; none inherits a bus permission.

Cards identify conditional or unverified bus carriage. Each bus leg shows the operator, instructions, ticket/reservation guidance, source link and review date. Boarding/alighting map pins repeat the bicycle status. Search notes explain excluded departures, counting pass-stop exits once. Editing the choice clears old results and requires a fresh search.

## Initial source coverage

| Matched provider operator | App status | Official source |
|---|---|---|
| `PAG`, PostAuto, PostAuto AG, PostBus | Conditional | [PostBus bicycle guidance](https://www3.postauto.ch/en/travel-and-services/travel-advice-and-reservations/travelling-with-a-bike) |
| `VBZ`, `VBG`, `VZO`, Stadtbus Winterthur, and the explicit full names in the code | Conditional | [ZVV bicycle guidance](https://www.zvv.ch/en/travelcards-and-tickets/tickets/self-service-bicycle-transport.html) |
| `TPG`, Transports publics genevois | Conditional | [tpg bicycle guidance](https://www.tpg.ch/en/travel/helpful-tips/cyclists) |
| `ABF`, Autobus Freienbach, `BRER`, Bus Rapperswil/Jona | Not allowed | [ZVV bicycle guidance](https://www.zvv.ch/en/travelcards-and-tickets/tickets/self-service-bicycle-transport.html) |
| Missing operator, numeric/unmatched identifiers, other companies | Unknown | No policy is inferred from a stop name, region or service name. |

Aliases are exact after trimming, case normalization and whitespace normalization. This is a deliberately small registry, not coverage of every Swiss operator. In particular, tl and unrecognized Winterthur identifiers are not silently treated as covered. Add an alias only after verifying that provider identifier's operator identity.

Recognized bus categories are `B`, `BUS`, `NFB`, `TROLLEYBUS`, `COACH`, plus replacement markers `EV` and `SEV`. Replacement services keep unknown carriage even when an ordinary operator policy exists; an explicit operator prohibition still wins. Unrecognized or missing vehicle categories cannot reliably be identified as buses and remain outside this bus-only filter. Preserved raw category/operator fields make such gaps diagnosable.

## Data and feasibility boundaries

The [Transport API schema](https://transport.opendata.ch/docs.html#journey) supplies category and operator but documents no departure-level bicycle permission, reservation availability or bicycle-space field. Its passenger occupancy fields must not be repurposed as bicycle capacity. The registry therefore keeps **permission**, **reservation requirement**, **reservation availability**, **ticket requirement** and **capacity** separate; no available-space count or completed reservation is invented.

`src/busCarriage.ts` owns the policies and eligibility function; normalization retains raw metadata in `src/itinerary.ts`. `model.ts` and `waypoints.ts` filter each edge before dominance pruning. Rejected edges remain in the observed network for explanations but cannot establish reachability or consume cycling-link discovery through those edges. Service/edge identities include category and operator. The UI shows the same policy used by feasibility.

Rules are a dated snapshot, not an automatic scrape or live confirmation. Recheck the official sources before expanding or refreshing the registry. Preserve unknown values when a source is unavailable or contradictory. Do not equate a national bicycle ticket's acceptance with permission to board. No bicycle purchase/reservation is performed by this app.

Road-route times, the three-minute boarding buffer, requested-stop order, the 24-hour horizon and request/candidate limits remain in force. The boarding buffer is not a guarantee of enough time to load a bicycle rack. Conditional permission is not proof of available capacity; a sampled result remains subject to service checks.

## Verification and next step

The recorded Zürich–Chur–Laax journey retains its `B 81` / `PAG` bus, conditional guidance and map-pin status. Controlled cases verify that a faster prohibited or unverified bus cannot prune a slower eligible alternative, and that the preference applies across requested stops and station-board exits. The old reduced Libingen fixture has no operator fields; its historical timing regression now explicitly includes unverified buses rather than assigning a fictitious permission. See [EXPERIMENTS.md](EXPERIMENTS.md).

Next: obtain reliable departure-level bicycle restrictions/reservation information, expand verified operator identifiers, and separately implement train/tram carriage. Folding, cargo, tandem, trailer and group cases need explicit bicycle-type rules before being offered as covered.
