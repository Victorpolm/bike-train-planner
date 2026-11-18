# Cycling path preferences, 18 November 2026

## Follow signed routes · 18 November 2026

The optional checkbox under **Cycling path** compares the candidates already returned for that section. Switching it requires no extra upstream route requests. It starts disabled, survives saving and restoring a trip, and uses the common 15% / 15-minute budget. A shorter user-specified hill budget still applies.

The selector measures uninterrupted rideable metres with a current BRouter international, national, regional or local cycling-network tag. Each network class is tracked separately. An overlap counts once. A dismount, unknown interval or incompatible network ends the stretch. Route numbers can change inside a class. The separate official route checker establishes a named SwitzerlandMobility route and checks published closures.

A candidate must extend the longest evidenced stretch and reduce metres outside it by more than one metre (coordinate tolerance). Among such candidates, minimize metres outside that stretch, then elapsed time on a tie. This prevents extra distance on already-signed roads from earning a detour by itself. Fastest can use the allowance. Easy to follow preserves the best known turn count, Lower traffic stress preserves its best known exposure score, and stairs-free and gentler-slope rules retain priority. If the checked paths yield no eligible improvement, show the ordinary choice.

At the 15 km/h rider setting, BRouter returned two usable Vevey–Montreux paths. With Fastest, the checkbox increased the longest mapped stretch from 4.96 to 6.27 km, with displayed elapsed time increasing from 31 to 33 minutes. Easy to follow retained the 7-turn path over the 23-turn path. Lower traffic stress already chose the longer signed stretch. Yverdon–Grandson and Rapperswil–Schmerikon retained their original winners. These checks used BRouter terrain and approach times. Roadside signs and temporary closures remain unverified. The Vevey–Montreux responses are frozen as a regression case.


For each cycling section, compare the usable candidates returned for the same endpoints and rider. Measure elapsed riding, pushing, carrying and endpoint walking before rounding for display when the component times are available. If the quickest checked candidate takes T minutes, the limit is T + min(0.15T, 15 minutes). A tighter rider allowance for gentler slopes still applies. A 10-minute ride allows 90 seconds extra, a 40-minute ride allows 6 minutes, and a 3-hour ride allows 15 minutes. Prefer a stairs-free candidate within the limit when available.

- **Easy to follow.** Minimize distinct BRouter turning decisions, including forks and roundabouts. Straight-on and endpoint hints do not count. Break ties by elapsed time. A missing or malformed instruction stream stays unknown. The existing stored preference key is preserved.
- **Lower traffic stress.** Sum distance-weighted exposure plus a discrete penalty per identified road crossing. Separate facilities have lower exposure than painted lanes or mixed traffic. Directional posted limits take precedence over general limits. A mapped 30 km/h zone beats an otherwise equivalent 50 km/h road. BRouter traffic estimates and designated heavy-goods routes contribute on mixed roads. Permission for lorries alone does not establish regular use.
- **Crossings.** Count a contiguous marked crossing once across split map sections. Use crossing nodes with travel-path context and estimated major-road crossings on minor approaches. Include a strong left-turn instruction from a mapped two-way mixed-traffic road onto a distinct mixed-traffic road. Ordinary bends, passing a pedestrian crossing along a motor road, and grade-separated crossings do not incur that penalty. Missing lane and turn data limit detection.
- **Forest and water.** The strongest preference requires a suitable riding surface, permission to cycle, motor exclusion or a cycle/foot facility with no conflicting motor-access evidence, and a BRouter forest or water proximity class of 4–6. A river alongside a main road or a footpath requiring dismount gets no nature bonus.
- **Candidate generation.** The existing trekking request considers estimated traffic. The shared fastbike request supplies the road-oriented comparison. This adjustment requires no additional upstream requests. Scores describe only the checked candidates. The crossing penalty of 120 equivalent metres and segment weights are initial comfort judgments. Actual lorry volumes, unmapped lane conflicts and collision probabilities are unavailable.

Regression coverage includes Zurich ETH HG–Stadelhofen recorded geometry and instructions, synthetic direction-dependent speed limits, lorry access versus designation, forest or water on motor-free versus mixed roads, crossing deduplication, a one-second budget overrun, the long-trip cap and a tighter rider allowance. The mixed bike-and-transit journey ranking and manually edited paths have separate scopes.

Provider definitions: [BRouter trekking profile](https://github.com/abrensch/brouter/blob/master/misc/profiles2/trekking.brf), [crossing classes](https://github.com/abrensch/brouter/blob/master/docs/developers/pseudo_nodes.md), [environmental data](https://github.com/abrensch/brouter/blob/master/docs/developers/environmental_considerations_and_pseudo_tags.md).

## Original v99 release and verification

Private Re.route v99 was deployed from Site source `3b19566cfa20e7e4ddb276f31ed38ba50b57e5a4`. The Site passed 917 tests, 129 rendered interface checks and its TypeScript/frontend/Worker build. The corresponding focused changes were also ported to the GitHub prototype from main `df5510433cd0c89bfe466c82311eb740935e5f0f`. Its 750 tests, 33 rendered checks and production build passed. The first concurrent GitHub run hit an OJP queue test deadline. The isolated queue suite and the complete rerun passed. Real-world lorry volumes and rider experience remain unvalidated.

## v100 release and verification

Private Re.route v100 was deployed from Site source `33412670170e34726e70f58fab29730274861791`. The Site passed 925 tests and 131 rendered panel checks. The GitHub prototype passed 758 tests and 35 rendered panel checks. Both TypeScript, frontend and Worker production builds passed. The opt-in was independently reviewed and checked against live BRouter responses on three Swiss corridors.
