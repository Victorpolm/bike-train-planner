# Foreground GPS journey following — 10 October 2026

## Accepted scope and delivered behaviour

The owner approved the proposed phone-location and Start workflow. Select a mixed or cycling-only journey and press **Start** in Map or Journey. The browser requests location permission. The app displays a position marker, accuracy circle and the remaining mapped path of the current cycling/walking section. Dragging the map suspends automatic centring; **Follow my position / Recenter** restores it. A Stop control remains accessible from the phone's Plan view while tracking.

Stage changes are explicit: **Section completed**, **I'm on board**, **I've alighted**, and **I've arrived · Finish**. The stage selector supports starting partway through a trip or correcting an accidental confirmation. Its explanation states that earlier stages, including requested visits at their ends, count as completed. Proximity to a station, a crossing or a scheduled departure never silently confirms boarding. Switching the selected journey or changing planning inputs stops following; ordinary Map/Journey view changes preserve it.

While following, the existing selected-service realtime subscription also runs with the map open. Navigation shows the next service, current departure/platform, reported delay and estimated station arrival at the planned pace. The boarding calculation retains known station allowances and additional transfer walking introduced by live platform changes. On board, the arrival estimate/platform and reported arrival delay stay visible. Cancellation, unknown-delay, failed-refresh and stale-data messages remain explicit. These are estimates, not a promise that a connection will be caught.

**Recalculate from here** makes one explicit new search using the current position and time, destination, remaining requested visits, original model/preferences, arrival deadline and remaining cycling/boarding limits. Completed stages and the furthest confirmed geometric progress consume the modelled cycling budget; going backwards does not refund it. Walking/endpoint/intermediate allowances and automatic cycling-transfer counts are conservatively retained or reduced. The current journey remains available during acquisition and after failure. A successful replacement requires review and **Start** again; it never silently changes the boarded service.

Replanning is blocked while boarded, with an old/imprecise location, after the original arrival deadline, after using the original boarding limit, or after a bicycle custody transition that the current planner cannot represent from a new origin. For the latter, use Plan to make the new bicycle placement explicit. A cycling-only replacement must fit the remaining cycling/time limits; an out-of-limit reference is not silently accepted as a valid replacement. These boundaries preserve constraints instead of resetting them.

**Keep screen awake** is optional. The browser can refuse or release it, and the displayed state reflects that. It is reacquired on return only while following with the option enabled. Stop, completion, route replacement and unmount clear the location watch and release the wake lock, including a lock that resolves after Stop.

## Technical and privacy contract

- New modules: `navigation.ts` (stages, street projection, estimates and constrained replanning), `locationTracking.ts` (testable watch/wake controllers), `useJourneyNavigation.ts` (foreground lifecycle), `JourneyNavigation.tsx` (controls) and `navigation.test.ts`.
- `App.tsx` pins the selected journey, enables realtime while following and handles explicit replacement searches. `MapView.tsx` uses a separate Leaflet navigation layer; location updates do not fetch route candidates, rerun the journey search or rebuild facility layers. Styles are in `src/ui/interface.css`.
- Location watches use high-accuracy requests, no cached fix and a 15-second acquisition timeout. Progress and location-based estimates require a finite fix no older than 20 seconds with accuracy at most 60 m. Old, future, invalid and out-of-order fixes are rejected.
- Projection uses a distance/time window around previous progress, with earliest equally close segments preferred. The window expands across a long hidden interval. It does not jump instantaneously to a later loop crossing. Schematic transit lines are excluded from street matching.
- Off-route status requires accurate fixes outside max(50 m, twice the accuracy) for at least eight seconds. Provider endpoint gaps remain labelled approximate, keep a time allowance and do not create invented street geometry. An unmapped final-access area is not treated as a known wrong turn.
- Hidden/page-hidden states clear the watch and discard the displayed fix. Returning requests fresh data while retaining the current stage. No background/screen-locked tracking, voice directions, automatic rerouting or native-app behaviour is claimed.
- GPS history is neither recorded nor stored on the server. Current location remains in memory until Stop; explicit recalculation sends a current origin to the existing route providers. Map tiles necessarily load around the viewed area. No location permission is requested on initial page load.

The platform behaviour follows the [W3C Geolocation specification](https://www.w3.org/TR/geolocation/) and [Chrome's Screen Wake Lock documentation](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock), reviewed on 10 October. Device location may combine GPS and other signals. HTTPS, browser permission, visibility, embedding policy and battery conditions can affect availability; the app exposes errors and a full-planner link.

## Verification

- **488 tests in 11 suites pass**, including 20 new navigation regressions.
- New cases cover cycling and mixed stages; requested-visit retention; distance/time progress; malformed, old and imprecise fixes; loops and instant jumps; long-gap reacquisition; sustained off-route detection and backtracking; schematic transit exclusion; live delay/platform/boarding estimates; newly introduced platform walking; endpoint gaps; remaining-budget replanning and custody/deadline restrictions; permission/timeout/unavailable errors; pause/resume/Stop and queued callbacks; pending/acquired/rejected wake locks.
- TypeScript, frontend and Worker production builds, React formatting, Knip and whitespace checks pass.
- Browser interaction and real phone GPS/wake-lock tests remain pending. The required browser-preview capability was unavailable; no alternate browser path or simulated phone acceptance is claimed. Existing realtime provider integration is reused; this release makes no new live-provider performance claim.

## Publication

- Owner-private **version 62**, successful publication at **10:42:11 UTC / 12:42:11 Europe/Zurich on 10 October 2026**.
- Site source: `582c351fe689625556ad2de8cc28a52ff871805f`.
- Version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_278993d899bc8191a56983668284f1d3`.
- Deployment: `appgdep_6aca166ea6c88191a610036d81cd54ba`; status `succeeded`; environment revision 3.
- The exact pushed source and matching frontend/Worker archive were published. Existing runtime keys and owner-only access are preserved.
- [Open the private planner](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site).

## Immediate phone acceptance

1. Open the full private planner on the phone. Select a short familiar cycling-only route. Start, allow location, confirm the marker/accuracy and remaining distance; pan and recenter.
2. Deny location once and check the explanation/retry flow. Stop and verify the browser no longer shows active location use.
3. Try a short bike–train journey: confirm access, boarding and alighting; compare a reported delay/platform and connection allowance with station information.
4. Hide/lock and return. The app must pause, reacquire fresh location and keep the same stage. Check screen-awake supported, refused and released states.
5. Deviate briefly on a known section. Recalculate explicitly and verify that remaining requested stops, deadlines and journey limits persist. Failed searches must retain the current trip.
6. Check touch targets, scrolling and map visibility on iOS Safari and Android Chrome; record battery use and noisy-GPS observations before changing pilot thresholds.

After acceptance, continue the existing parking/access and reliable useful-stop priorities. Voice, automatic rerouting, background navigation, saved traces and custody-aware continuation are separately scoped future work.
