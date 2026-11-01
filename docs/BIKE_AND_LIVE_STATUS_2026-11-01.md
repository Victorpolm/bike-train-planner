# Bicycle requirements and live-time status — 1 November 2026

## Decision and implementation

The owner requested clear bicycle permission/reservation symbols and precise live-time wording. Preserve the private audience, existing routing objectives, bicycle profile restrictions and separate space/booking semantics.

- Each transit step and the detailed bicycle panel displays a bicycle, crossed-out bicycle, bicycle with R, or an unresolved marker, with accessible text. The R means bicycle reservation, not a passenger-seat reservation.
- Distinguish bikes allowed, prohibited on this section, configuration requiring verification, international-only carriage, missing service data, and conflicting reservation conditions. The missing item is named, rather than presenting one generic unknown message.
- Result cards name services with compulsory reservations and unresolved reservation requirements. Ticket requirements remain separate.
- OJP service/segment/stop attributes remain scoped to the dated boarded service. Read both UserText and Text-shaped attribute text. Recognise A__VH provision when supplied and explicit complete permission/reservation sentences in English, French, German and Italian; preserve conditional or unfamiliar wording as unresolved. The two recorded German no-reservation formulations are matched completely rather than through a permissive prefix.
- A bicycle provision signal establishes ordinary-bike permission, subject to any section restriction and the user's bike profile. It does not establish an exemption from reservations. VN overrides positive provision; VI remains section-specific; generic passenger R never means bicycle R.
- Existing OJP detail checks run automatically for selected journey requirements. Apply matching details even when the leg lacks an initial bicycle-evidence object. Applicable published operator rules resolve absent attributes; explicit contradictions are retained.
- Rechecked the SBB seasonal IC reservation calendar against the owner's page on 1 November. The existing calendar already covers the season boundaries, IC2/21/5/51, other IC weekday/holiday rules and year-round international EC/ICE/RJX exceptions. No calendar behaviour was broadened.
- Each departure and arrival independently displays On time, Delayed by N min, early, scheduled/live-unavailable, last reported/update-unavailable, cancelled or indefinite-delay status. On time requires a fresh estimate exactly matching the schedule. Sub-minute delays do not round into On time. Failed/stale estimates never appear current.
- Avoid formatting an invalid live-check timestamp when the first refresh fails.

## Evidence and validation

702 JavaScript tests pass, including nine new regression cases covering XML-to-graph-to-detail processing, positive bicycle attributes versus restrictions, reservation calendars and conditional/multilingual wording, missing/profile/conflicting requirements, and timing freshness/rounding. Existing recorded raw OJP fixtures remain exercised. 16 Python tests, 61 rendered React panel checks, TypeScript/frontend/Worker production builds, unused-code and formatting checks pass.

The managed preview daemon is unavailable (`sites-previewd mailbox is unavailable`), so interactive browser/phone QA is unverified. Component rendering checks are not physical-device acceptance. The restored Site source starts at cfe9bfa1b6681d4c802a125348c77fd243a021f9 (version 75); its previously unsynchronised application changes are preserved.

## Sources and remaining work

- SBB rules: https://www.sbb.ch/fr/informations-voyages/besoins-individuels/voyager-avec-velo/transport-velo-train.html
- SBB detailed help: https://www.sbb.ch/fr/aide-et-contact/produits-services/billets/suisse/velos.html
- Train formations: https://opentransportdata.swiss/en/cookbook/realtime-prediction-cookbook/formationsdaten/

The separate formation API documents VH (bike hooks/platform) and VR (reservation-required provision), but the Site has only OJP and OJP Fare secret names configured. No Formation product key is configured. This release does not fetch formation data or claim to read every symbol shown by SBB. The A__VH recognition is tested synthetically, not claimed as a newly observed production OJP field. Formation integration needs product access, exact train/date/stop-section matching, vehicle-attachment checks and coverage tests; it must not override a service prohibition or infer free capacity.

Next: compare SBB symbols and our decisions for identical dated services across reservation-season boundaries, regional peak restrictions and selected tourist buses. Preserve discrepancies as regression fixtures. Missing attributes, conditional publications and unreviewed operator rules remain possible; this release is not proof of nationwide equivalence to SBB. No reservation booking, live bicycle-capacity confirmation, fare expansion, notification reactivation or access change is included.

## Publication

Private version 76 deployed successfully on 1 November 2026. Site source `302142d519b0d292e00613a7c98f03bf40a5a5dc`; deployment `appgdep_6ae7108c8490819196fdfb52da111490`; runtime environment revision 3. URL: https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site

GitHub synchronization includes the previously deployed version 75 application deltas and this change, while preserving main's later station-transfer dataset updates. Both the Site maintenance automation (observed disabled) and GitHub tariff-expiry notification schedule remain paused.
