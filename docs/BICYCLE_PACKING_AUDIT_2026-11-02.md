# Ordinary bicycles, packing conditions and audit follow-up — 2 November 2026

## Delivered behavior

Owner-private Re.route **version 81** is published at the existing URL. Site source `bae99cb7f2046e57705ca18f0f0b497e99d08b25`, deployment `appgdep_6ae897be8a948191b10521942869b33a`, environment revision **4**, published **2026-11-02 14:01:53 UTC**. Audience and runtime keys are unchanged.

| Dated condition | Result for the current planning scope |
| --- | --- |
| Only folding bicycles accepted, including folded-and-bagged-only wording | **Bikes not allowed · Folding bikes only**; excluded from both permitted/uncertain bike scopes |
| An ordinary bicycle accepted only in a transport bag | **Bikes allowed · Bag required**, with the provider's original packing, wheel-removal and size conditions |
| Optional bag, folding-bike fare exemption, or unrecognized packing qualification | Does not establish ordinary-bike permission; unresolved conditions remain qualified |
| Bag required but packaged bicycles prohibited, or a separate carriage ban | No unconditional allowance; retain the conflict/ban |

The explicit all-transit comparison can still display a prohibited service with its warning. Handling conditions survive filtered/unfiltered graph updates, detailed-service refreshes and positive formation evidence. Evidence still belongs to the exact dated service and boarded section. Bag-required conditions appear in the service status, explanation, original notes and whole-journey summary.

A packing requirement alone does **not** establish free carriage, remove a reservation, confirm space, or estimate preparation time. Published, applicable operator luggage exemptions remain separate. Unknown/free-text qualifications are not resolved by unrestricted keyword matching. The new multilingual handling cases are synthetic contract fixtures, not claims that these exact statements were observed in production.

Folding-bike exceptions are outside the owner's current scope. Folding/folded options are removed from settings. Previously saved folding selections use ordinary-bicycle rules and fares; a correctly packed ordinary bicycle remains supported. No folding-only concession is used to admit a service.

## Audit findings checked against the complete application

- **Station identity:** the report's seven recorded Zürich–Bern train legs all resolve to confirmed bicycle permission and required reservation after the existing official station-lookup pipeline. A new test starts without seeded station nodes and changes the stop labels, proving that the official identity join works independently of the name/proximity shortcut. The isolated raw-adapter example omits that lookup; no SLOID digit arithmetic or redundant nationwide hand map was added.
- **IC corridor:** the year-round Zürich–Schaffhausen reservation rule already existed for UIC identities. It now also uses official resolved station identities for SLOIDs. The regression verifies winter IC4 in that corridor and retains uncertainty outside its reviewed corridor. The IC4 number alone is not sufficient to apply an international rule everywhere.
- **Folding profile monotonicity:** superseded by the owner's ordinary-bicycle scope. BLS legacy folding selections no longer receive or lose a folding-only exemption; correctly packed ordinary-bike rules remain separate.
- **Rule freshness:** the ZVV bus/tram fallback now has explicit review bounds (24 September–12 December 2026), matching the dated-policy approach. It cannot continue indefinitely after renewal is due. Expired local rules explain which operator rule was reviewed and its date coverage. Unmatched official station references have a separate explanation. These are Re.route review bounds, not claims that the publisher revokes the policy on those dates.
- **Foreign sections and calendar:** v80 already preserved explicit ordinary-bike permission on foreign/unresolved-country sections without applying Swiss tariffs abroad. Existing calendar regressions remain passing. This release does not claim to reproduce the audit's independent 9,497-case calendar harness.

## Sources and validation

The user-supplied audit was reviewed privately; the PDF is not republished in the repository. Relevant current publisher pages were checked on 2 November:

- [SBB bicycle carriage and reservation rules](https://www.sbb.ch/en/travel-information/individual-needs/travelling-with-bikes/carriage-bikes-train.html): year-round reservation for Swiss sections of international EC/ICE/RJX and IC Zürich HB–Singen/Stuttgart; seasonal rules for other IC services.
- [SBB help with bicycle tickets and reservations](https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html): permission, luggage, reservation and ticket conditions remain distinct.
- [BLS bicycle carriage](https://www.bls.ch/en/fahren/fahrgastinformation/velofahrende/velomitnahme): purpose-made transport-bag requirements for its luggage exemption.

**734 JavaScript tests, 16 Python tests and 69 rendered panels pass**, together with formatting, unused-code analysis, TypeScript and frontend/Worker production builds. Eight new regression groups cover folding-only exclusions, multilingual bag requirements, conflicts, adapters/refresh/cache behavior, legacy profiles, the complete seven-leg station pipeline, winter SLOID IC corridor and stale ZVV rules. Existing synthetic VBZ tests now use dates inside the reviewed rule window; separate before/after tests verify the new boundary.

**Post-publication, 14:02–14:03 UTC:** the served frontend matches the built asset byte-for-byte (SHA256 `8fae388bfca7fb499f3faf68c0b3bc5567366cb557d36dffbdd939d03f67487a`). Fresh B31 and Interlaken–Beatenberg API responses returned 7 and 12 legs without warnings; 63 deployed station checks retained five independent station identities.

Interactive browser/phone verification remains outstanding: the earlier managed preview was unavailable and the live browser required sign-in. Server-rendered UI checks are not browser acceptance. No new live folding-only or bag-only provider service is claimed. Existing bicycle-space availability and booking limitations remain.

## Next step

Renew the scoped operator/T600 rules before the December review boundary and capture actual provider packing-only/folding-only examples to extend the exact wording fixtures. Automatic tariff-expiry notifications remain paused at the owner's request; no new scheduled alert or hard 30-day build gate was added.
