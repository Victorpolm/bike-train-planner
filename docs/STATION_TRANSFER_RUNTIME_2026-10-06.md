# Station-transfer runtime integration and repository consolidation

**9 October follow-up, version 60:** When a known station has no matched platform pair because platform information is absent, use its largest published general intra-station minimum as a labelled estimate. Preserve exact OJP priority, identity/edition/date checks and walking already included. Unknown or mismatched IDs and explicit unmatched platforms do not receive this estimate. The original integration below is historical. [Fix and regression evidence](UPDATE_REVIEW_FIXES_2026-10-09.md).

_Implementation deployed 6 October 2026; source, release and regression audit recorded 7 October 2026._

## Status and provenance

**Fact:** The owner approved merging both branches and using the supplied transfer ZIP. GitHub confirms both PRs merged into `main` on 6 October:

| Change | GitHub record | Merge commit | Merged, UTC |
|---|---|---|---|
| Interface and traveller profiles | [PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) | `a62ac023f92a11817b1b176bd8e7122e3809eda7` | 20:44:44 |
| Original transfer ZIP and intake audit | [PR #2](https://github.com/Victorpolm/bike-train-planner/pull/2) | `ef18c8571cedfc67de272dfaf6c2c1688b9c0ea1` | 20:45:09 |

The application integration was subsequently published from the Site source repository but was absent from GitHub `main`. This 7 October change copies the exact version-53 application source into `prototype-v0/` and updates the current documentation. It does not introduce another routing redesign or require another publication.

| Published version | Source commit | Deployment ID | Successful publication, UTC |
|---|---|---|---|
| 52 | `c149f112dd6c964c58c7673113d0ae588a8fdc6e` | `appgdep_6ac5611e32608191b2baaa964ffd56e7` | 6 October, 21:00:13 |
| 53 | `619bc7bb6814d69054e582b632a152a437adeba4` | `appgdep_6ac5621eb5148191b62dd44c00862244` | 6 October, 21:04:31 |

Sites confirmed both successful deployments on 7 October. The existing project is `appgprj_6a9bdfc1819481918c7085729f869ca9`; version 53 remains owner-private, with environment revision 3. [Open the existing planner](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site).

All **214 application files** match the version-53 source: nine existing files changed and six were added relative to the 208-file GitHub application. Site-only `SOURCE.md` and archived `project-documentation/` snapshots are excluded from the authoritative repository. GitHub's unrelated files, source ZIP, history, secrets and CI configuration are preserved.

## Data contract and import

The input is the owner's already committed `Transfer in station.zip`. [The intake audit](STATION_TRANSFER_INTAKE_2026-10-06.md) records its original validation. The runtime asset preserves these source facts:

| Attribute | Value |
|---|---|
| Publisher / edition | SBB / `20260930` |
| Declared validity | 14 December 2025–12 December 2026, inclusive |
| ZIP SHA-256 | `170cbc1648b12b8f6adf51200c7cef80b56726a522671327f48ee8c584c1bc22` |
| Stop/platform records | 104,297 |
| Original transfer rows | 1,112,959 |
| General minimum-time rules in the runtime index | 109,116 |
| Route/trip/calendar-scoped rows excluded from general lookup | 1,003,843 |
| Compiled server asset | 1,715,971 bytes |

`scripts/import-station-transfers.py` reads the original CSVs from the ZIP without unpacking them to the repository. It checks required columns, duplicate stop IDs, referenced stops, nonnegative minima and conflicting general minima. It imports only type-2 rows with no from/to route, from/to trip or service-calendar restrictions. Other transfer types are excluded. Explicit stop IDs, original IDs, DIDOK, parent references, platform codes and location types remain available in the compiled data.

The committed JSON is a reproducible, compressed runtime lookup required by the Worker, not an additional copy of the bulk CSV files. To regenerate from `prototype-v0/`:

```bash
python3 scripts/import-station-transfers.py "../Transfer in station.zip"
```

The full source ZIP remains available for future scoped integration. Route/trip/calendar-specific minimums, coordinated connections and stay-on-board semantics are **not** generalized into passenger transfer rules. Their correct application requires matching timetable identities and, where applicable, trips, calendars/exceptions and stop times from the same edition.

## Runtime behavior and model

**Lookup:** `server/stationTransferHandler.ts` lazily prepares the compiled index in the server. `POST /api/station-transfers/v1` accepts at most 24 endpoint queries per request and an 8,192-character request body. It resolves explicit stop/platform identities, including generated sectors, and returns only records needed for those endpoints. Unknown or contradictory identities are not guessed from names or SLOID arithmetic. Both the deployed Worker and local development middleware expose the same handler.

`StationTransferClient` hydrates acquired transit legs before route results are published, including transfer-discovery station boards. It caches endpoint results within a search and carries successful results into a later explicit action; failed lookups can be retried by that action. Each batch has a 12-second timeout and respects search cancellation. The first lookup failure stops further network attempts for that action and adds a visible warning; exact OJP evidence and labelled fallbacks remain available.

**Feasibility precedence:** the shared `boardingCheck` keeps exact dated OJP access/interchange evidence first, including rejection when an applicable OJP duration is unknown. Otherwise it uses an imported general minimum only when both endpoint identities still match, feed checksums agree, the operating days (or Swiss local dates when absent) lie within validity, and a general rule exists. Missing, changed, ambiguous, expired or unavailable static evidence falls back explicitly to the existing Swiss same-stop default or app estimate. A zero minimum is allowed only when the data actually supplies it.

**State and dominance:** both the ordinary and waypoint solvers retain incoming service/platform context whenever scoped OJP or matched static records make transfers sensitive to that context. An earlier arrival cannot dominate a later arrival solely on time when their platform changes differ. Static records attach to the existing transit edges; this is not a new station-path graph.

**Actions and timing:** boarding after a prior transit leg enforces the selected minimum, subtracts already represented walking and inserts only the remaining mandatory station-transfer step. The check uses both the latest ready time and the incoming arrival plus minimum. Cycling breaks reset the previous transit-transfer context. Existing riding/walking/boardings metrics, category objectives, cycling budgets, horizon and bicycle-permission constraints are preserved. Cycling edits and facility-detour validation use the same checker; selected service and fare identities remain unchanged.

**Cost and failure modes:** index preparation is linear in the imported stops and rules and is cached per Worker instance. Client hydration scans acquired edges and batches uncached endpoint keys; lookup is map-based after initialization, with bounded candidate filtering for platform aliases. More distinct incoming transfer contexts can retain more routing labels; the existing search limits still apply. Cold starts, lookup failure, sampled timetable coverage and unresolved platform identities can leave fallbacks or missed alternatives. No complete national routing or bicycle-accessibility claim follows from this import.

## Verification on 7 October

The synchronized application was checked without altering the deployed source:

- `npm test`: **372 tests in 11 suites**, across 42 test files; no failures, skips or cancellations.
- `npm run format:check` and `npm run check:unused`: passed.
- `npm run build`: TypeScript, frontend and Worker production builds passed. Vite retains its advisory about a frontend chunk larger than 500 kB.
- Every application file was compared with Site source commit `619bc7bb6814d69054e582b632a152a437adeba4`; the imported runtime asset retains the intake ZIP checksum.

Nine existing transfer regressions accompany this synchronization. They check actual Zürich/Bern minima, explicit/generated platform mapping, the six-versus-seven-minute Zürich boarding boundary in both solvers, transfer-sensitive dominance, exact OJP priority, walking counted once, feed expiry/platform changes, bounded requests/cache recovery, planner hydration before publication and reproducible importer exclusions. [Golden journeys and exact outcomes](EXPERIMENTS.md#2026-10-07--verify-the-deployed-station-transfer-integration-before-synchronizing-main).

This is an offline regression and source/deployment audit. No new browser interaction pass or live-provider route-quality test was run in this synchronization.

## Remaining work

Complete the familiar-station desktop/phone acceptance pass, then add correctly scoped service exceptions and a maintained feed-refresh process before the current validity boundary. General passenger minimums do not verify entrances, lifts, stairs, station-exit paths or bicycle passage. Unknown evidence remains visible. The proposed Extra categories/Discover changes and phone food-loading follow-up are separate work, unchanged by this synchronization.
