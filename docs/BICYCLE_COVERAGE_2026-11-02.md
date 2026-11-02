# Bicycle coverage and reservation decisions — 2 November 2026

## Delivered behavior

Re.route owner-private **version 80** is published at the existing URL. Site source `83774611e7d77de525e1173ca8fb10f418ebfbd6`, deployment `appgdep_6ae87440b25c819185c4a3f59cde8bb7`, environment revision **4**, published **2026-11-02 11:30:28 UTC**. GitHub application files match that source change; deployment and GitHub synchronization are separate operations.

- **VBZ B31:** bicycle-compatible dated OJP search establishes access despite no bike icon in its attributes. Official operator identity resolves `ojp:849` and the reviewed `ojp:3849` timetable alias to VBZ. With successfully checked conditions containing no bicycle reservation requirement, ZVV/T600 establishes **no reservation required**, subject to space and a bicycle ticket.
- **Platform ambiguity:** the official provider-reference→DIDOK station identity survives an ambiguous platform. Transfer-time computation still treats that platform as ambiguous and invents no transfer minutes. Unknown/contradictory references and stale date/platform keys are not accepted.
- **Ordinary-bike evidence:** standard, self-loaded unfolded pedal bicycles retain exact-service permission even when country/platform resolution is incomplete. Special dimensions, packing, trailers, motor types, international-only restrictions and explicit bans remain separate constraints. An ordinary positive foreign-section observation does not extend Swiss tariff rules abroad.
- **Operator register:** generated exact business-number/SBOID mapping replaces manual numeric-code expansion. It retains business abbreviations and validity; parent-company siblings are not merged for tariff membership. `STI146` and `STI Berg605` remain distinct.
- **Shared reservation rule:** the current T600 membership matrix provides 148 conservative unqualified business-number candidates; independently reviewed ZVV incorporation covers VBZ/VBG/VZO/Stadtbus Winterthur. The fallback currently applies only to ordinary domestic bus/tram modes, with independently established permission, a successful exact-service conditions check, no reservation notice/unrecognized bicycle wording/code/conflict, and dates within the reviewed boundary. Existing more-specific operator rules take precedence. This is a sourced inference, not an explicit API `reservation=false` field.
- **Unresolved service checks:** the search now tries at most two exact-section TripInfo requests per OJP client, charged to the existing request budget, with a 12-second timeout each. Failures/empty details do not become bans or exemptions. Detailed selection refresh remains available. Explanations distinguish missing service references from a completed but inconclusive detailed check.

## Decision boundaries

Permission, bike fit, ticket, reservation and actual space remain distinct. No icon alone proves neither acceptance nor a reservation exemption. A successful bicycle-filter match or explicit positive provision is permission evidence; VN/operator bans prevail. Generic passenger-seat R is not bicycle VR. Unknown reservation wording, unknown bicycle codes and conflicting requirements block the shared exemption.

The national fallback is deliberately not applied to cable cars, funiculars, ships, international sections, replacements or unresolved mountain feeder-line scope. Existing reviewed rail policies and dated requirements remain in force. T600 membership is not permission, and a nonmember is not automatically prohibited. Shared inference expires after **12 December 2026**, a local review boundary rather than a claim that the publisher ends the rules then. Capacity and booking are not supplied.

## Sources and reproducibility

- [T600, edition 1 June 2026](https://www.allianceswisspass.ch/fr/asp/Telechargements?download=2666): §7.1.1 electronic timetable restrictions, §7.1.7 stricter operator terms, §7.10.1 reservation notices.
- [ZVV tariff §5.2.1](https://www.zvv.ch/de/allgemeine-seiten/tarif/verbundtarif-und-richtlinien/gepaeck-velo.html) adopts T600 chapter 7; [ZVV operator guidance](https://www.zvv.ch/en/travelcards-and-tickets/tickets/self-service-bicycle-transport.html) supplies local bicycle permission.
- [Official membership matrix](https://www.allianceswisspass.ch/awbf), retrieved 2 November, resolves to download 19832, edition 1 June 2026. PDF SHA256 `88763584d5a296deb4add03ea83159bbc06dd5b4574adba8061f6965229ebe28`. 338 rows, 314 business numbers, 148 conservative selections, 166 exclusions. Independent coordinate extraction confirmed the row/code count. All scoped rows, non-unanimous yes values and footnoted rows are excluded; VBZ's unrelated T673 footnote is handled through the separate reviewed ZVV rule.
- [Official business organisation register](https://opentransportdata.swiss/en/cookbook/masterdata-cookbook/business-organisations/). The new download returned HTTP403; generation therefore uses the verified **11 October 2026** inventory already committed in `docs/research`, not a claimed fresh download. 1,286 distinct validated dated identities yield 2,572 exact lookup keys. The generated file records the input hash and date.

Rebuild identities from the app directory:

```bash
python scripts/generate-operator-identities.py ../docs/research/SWISS_OPERATOR_COVERAGE_INVENTORY_2026-10-11.csv --checked 2026-10-11
```

Rebuild membership from the downloaded public PDF (requires `pdfplumber`):

```bash
python scripts/generate-bike-membership.py /path/to/official-membership.pdf src/bike-membership.json
```

The extractor asserts the reviewed edition and table headings. A new layout/edition requires review rather than silently extending validity. No bulk PDF/registry download or API secret is committed. New factual derived records and source-register links are shipped. Paused automatic tariff-expiry alerts remain paused.

## Verification

- **726 JavaScript tests**, **16 Python tests**, **65 rendered panels** pass; TypeScript, frontend/Worker production builds, formatting and unused-code analysis pass.
- New production-derived fixture: B31 Waserstrasse→Bahnhofplatz/HB, **3 November 12:02–12:19 Swiss time**, no bike icon, OJP bike-filter match, raw operator849.
- New production-derived fixture: STI B21 Interlaken Ost, Bahnhof→Beatenbucht, **3 November 08:10–08:38 Swiss time**, explicit VB/filtered acceptance, ambiguous Beatenbucht platform. Station8507178 remains independently verified. The following funicular's tariff/reservation scope remains separate.
- Nine captured Swiss query cases contain 60 transit legs. Before: **51 confirmed / 5 uncertain / 4 prohibited** with an ordinary 180cm pedal-bike profile. After replay against corrected source and hydrated official station data: **56 confirmed / 0 uncertain / 4 prohibited**. This is a bounded sample, not a nationwide completeness claim. Eight captured positive cross-border legs also preserve ordinary-bike permission without gaining Swiss reservation exemptions.
- Regression guards cover missing/failed condition checks, foreign scope, unknown codes/wording, VR, conflicting conditions, bans, STI Berg sibling exclusion, unknown operators, replacement service names/categories, special bikes, tariff expiry, station-reference conflicts and mutable cache inputs.
- **Post-deployment live check, 11:35 UTC:** the served JavaScript asset matches the packaged build byte-for-byte (SHA256 `d4bdce0529355a5078abccc698e062f5c31bd7fca0e278381d8448f1bac1e516`). Fresh B31 and Interlaken–Beatenberg API queries returned without warnings. The deployed station endpoint retained five independent identities across 63 checks. Four B31 and two Beatenbucht B21 departures evaluated against the shipped decision code as confirmed / ticket required / no reservation.
- Local browser preview daemon is unavailable. The published page reached its normal ChatGPT sign-in gate in the cloud browser; interactive browser/phone acceptance is **unverified**. Rendering, source matching and live API checks remain distinct from browser acceptance.

## Next verification

Renew the operator snapshot and T600 scope before the December review boundary, then prioritize unresolved mountain/ship/foreign segments using exact journey evidence and applicable line scope. Do not build a permissive national default or a hand-maintained operator-by-operator rule database.
