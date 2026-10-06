# Station-transfer ZIP intake and branch consolidation — 6 October 2026

The owner supplied `Transfer in station.zip` both in the conversation and on the existing `Time-transfer` branch. The attachment and repository object are identical: Git blob SHA-1 `61372cb23aa04f7ca33ffdf8ce1bb2ee7a9c5f15`; ZIP SHA-256 `170cbc1648b12b8f6adf51200c7cef80b56726a522671327f48ee8c584c1bc22`.

## Data received and checked

The 9,064,865-byte ZIP contains `stops.txt`, `transfers.txt` and `feed_info.txt`. It is SBB feed version `20260930`, with declared validity 14 December 2025–12 December 2026.

Streaming validation read the complete stops and transfers files:

| Check | Result |
|---|---:|
| Stop/platform records | 104,297 |
| Transfer records | 1,112,959 |
| Type 2 minimum-time records | 811,608 |
| Type 1 coordinated-transfer records | 292 |
| Type 4 stay-on-board records | 301,059 |
| Rows without route/trip/service restrictions | 109,116 |
| Rows restricted by route and trip | 702,784 |
| Rows also restricted by service calendar | 301,059 |
| Missing stop references | 0 |
| Invalid minimum seconds in type 2 rows | 0 |

The original fields `stops.didok` and `transfers.service_id`, absent from the previously researched SQLite copy, are present. Sample unrestricted platform-pair rows agree with the previous audit: Zürich HB platform 42 → 18 is 420 seconds; Bern platform 32 → 1 is 360 seconds. These are exact platform-pair examples, not station-wide constants or proof of bicycle-accessible paths.

The owner provided the three files requested. This removes the original-extract access blocker for the first integration stage. No additional key is needed.

## Integration boundary

The app does not read this ZIP yet. Merging the file only makes the input available in the project.

Build a compact server-side lookup, preserving explicit stop/platform identifiers, source/version, feed validity and restriction fields. Retain exact dated OJP evidence and use applicable static rules for recombined connections. Do not send the full national extract to the browser or unpack it during a journey request.

Start with rules that have no route/trip/calendar restrictions. The remaining rules must not be broadened into general station defaults. Complete matching of their route/trip identities and the dated stay-on-board rules may require the accompanying trips, calendar/calendar_dates and stop_times from the same original feed. Those files are not included in this extract. Preserve such records for later scoped integration and keep uncertainty visible.

## Branch consolidation prepared

- `feature/novice-interface-profiles`: 13 commits ahead of main, including the tested design/profile changes and the subsequent routing fixes and documentation. Its latest Test and build run passed: https://github.com/Victorpolm/bike-train-planner/actions/runs/37511826934.
- `Time-transfer`: created from the same main commit; its original change is only the ZIP. This intake report and its audit now accompany that input.
- The changed paths are disjoint, so the design and data additions can coexist without replacing the newer interface with the older base of Time-transfer.

PR #1 is ready for review: https://github.com/Victorpolm/bike-train-planner/pull/1.
PR #2 prepares the ZIP and this validation record: https://github.com/Victorpolm/bike-train-planner/pull/2.

Recommended order: merge PR #1 into main, then PR #2; verify the resulting tree and main CI; subsequently implement the compact transfer resolver. Keep the source branches until the consolidated state is verified. Version 51 is already the live interface; a GitHub merge alone does not enable the static transfer data or create a new Site release.

Automatic approval review blocked the immediate merge into main because the owner's message asked for a recommendation without explicitly approving that exact merge. Main remains unchanged pending explicit confirmation. No alternate merge mechanism was used.

[Machine-readable intake audit](experiments/uploaded-transfer-audit-2026-10-06.json).
