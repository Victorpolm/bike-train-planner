# Hosted OJP and fare activation

28 September 2026. Both `OJP_API_KEY` and `OJP_FARE_API_KEY` are now configured as secrets in the existing private Site. Environment revision 3 is deployed. Authenticated journey and fare requests succeed on the hosted application. No credential was copied from GitHub, printed, returned to the browser or committed.

## Failure found and corrected

Configuration presence alone was insufficient: after applying the secrets, `/api/ojp/status` and `/api/fares/status` returned `available: true`, but real requests failed. Credential-free diagnostics isolated a `TypeError` in the request's redirect mode, before an upstream HTTP response was available.

Both adapters used `redirect: "error"`, which failed in the hosted runtime. They now use `redirect: "manual"` and reject every non-success response, including redirects. They never follow a redirect or forward the authorization header to another destination. No endpoint, key value, itinerary-matching rule or fare eligibility rule changed.

Operational logs contain only fixed failure categories, request/body phase, provider name and HTTP status. They exclude exception messages, request/response bodies and headers. Status endpoints continue to indicate configuration presence only; use a real request to verify provider access.

## Live checks

All checks used the existing owner-private Site. Travel date: **29 September 2026**, with times below in Europe/Zurich. Prices are OJP **test estimates**, not verified purchase offers.

| Check | Observed result |
|---|---|
| Both integration status endpoints | HTTP 200, `available: true` |
| Zürich HB to Bern, requested departure 10:00 | HTTP 200; 9 normalized transit legs across returned alternatives; no warnings |
| Chur 12:11 to Luzern 14:25 via Thalwil, full-fare adult | HTTP 200, `quoted`; CHF 33.40 passenger supersaver, CHF 25.50 bicycle route ticket |
| Zürich HB 10:06 to Bern 11:24, Half Fare adult | HTTP 200, `quoted`; CHF 19.20 passenger supersaver, CHF 26.50 bicycle route ticket |

The Zürich-Bern quote was constructed by the real client functions `addOjpConnections` and `fareQuery` from the newly returned OJP leg, including its exact service reference, stops and times. It therefore verifies the client-to-server itinerary contract as well as authentication. The Chur-Luzern request reused the recorded future itinerary from the preceding ten-case experiment. Bicycle amounts above are the provider's route tickets before the UI compares applicable published passes; reservations remain separate.

The full-fare Chur-Luzern quote changed from CHF 32.60 in the previous day's experiment to CHF 33.40 in this check. Do not treat a recorded supersaver amount as a permanent tariff. Sanitized request and response evidence is in [the activation record](experiments/ojp-activation-2026-09-28.json).

## Validation and publication

- 188 application tests pass; TypeScript, frontend and Worker production builds pass.
- Three added regressions cover the hosted redirect-mode restriction for journey and fare requests, and rejection of an upstream redirect without exposing provider diagnostics.
- Private Site **version 26**, source `24f3e32d8988090df18348153f63da67467b368c`, deployed successfully at **07:45:31 UTC** using environment revision **3**.
- Version ID: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_b1c735187630819195e947be80f81534`.
- Deployment ID: `appgdep_6aba1b0afd8481918d2ba0cb676ac0e9`.
- Owner-only access was rechecked. No new hosting service, spend, sharing change or recurring job was introduced.

These are live API and client-adapter checks, not browser interaction or complete door-to-door route audits. Intermediate cycling interruptions and unmatched itineraries still cannot receive a substituted through fare. OJP test-data and provider-coverage limitations remain.

## Conclusions from the supplied review

The seven-page review against GitHub commit `4944edc` was assessed separately on 27 September. Its malformed-final-stop defect and 60-minute category-filter example were reproduced without modifying routing code.

1. Fix `addStationboard` so an unreadable final station does not discard valid earlier exits; retain both missing-station and missing-coordinate regressions.
2. Put the additional-travel-time qualification next to the least-cycling/walking category. Preserve the intentional allowance until a preference change is agreed.
3. Compare four and eight initial station pairs on the same 20 real journeys before changing the default. Track arrival quality, first-result latency, total time, request usage, timeouts and Extended coverage. An OJP pair normally costs two upstream calls against the shared 18-request cap.

The review's 18.1% and 10.8% figures describe its synthetic worlds, not measured production failure rates. Its harness files were not supplied. No sampling-cap change, parser fix, label change or routing-engine migration is included in this activation patch.
