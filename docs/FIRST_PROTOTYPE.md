# First runnable prototype — preservation status

This document records the first runnable implementation of the project.

## Status

**Fact:** The original source archive available from the first implementation session was imported on 2026-09-05 under:

`prototype-v0/`

It is preserved as the historical starting point. Refactoring should happen through later commits rather than by pretending that the first version was cleaner or more complete than it was.

## What v0 does

1. Geocodes Swiss departure and arrival points.
2. Finds up to five candidate stations near each endpoint using nearby-stop queries plus a small list of major Swiss rail hubs.
3. Approximates a 20-minute bicycle catchment as five kilometres at 15 km/h using straight-line distance.
4. Requests live public-transport connections for candidate station pairs.
5. Adds bicycle access/egress and waiting time.
6. Ranks options by estimated arrival time.
7. Displays stations and selected explanatory lines on a map.

The app is a React/TypeScript/Vite web prototype and runs locally with Node.js and npm.

## Known limitations

- Straight-line cycling estimates rather than routed bicycle paths
- Fixed 20-minute/five-kilometre candidate catchment
- Heuristic station detection
- Unofficial, rate-limited community transport API
- No bicycle-carriage or reservation rules
- No cycling-comfort model
- No adaptive fallback when the initial catchment has no feasible journey
- No Pareto or multicriteria route selection
- Explanatory map lines rather than turn-by-turn routes

These limitations are evidence about what to build next, not defects to conceal in the project history.

## Verification history

The original implementation session reported passing unit tests, TypeScript compilation and a production build before packaging the archive.

When the repository is cloned in a fresh environment, verify again with:

```bash
cd prototype-v0
npm install
npm test
npm run build
```

Do not treat the earlier report as a substitute for current verification after dependencies or code change.

## Next technical move

Before adding advanced routing, separate:

1. candidate journey generation;
2. feasibility constraints;
3. route metrics;
4. dominance/ranking;
5. user-facing explanation.

Then add adaptive station search with an explicit maximum and a clear fallback. This preserves a path toward multicriteria/Pareto routing without requiring a full Pareto engine in v0.

## Historical importance

The prototype records:

- original implementation assumptions;
- early UI choices;
- API and dependency choices;
- setup friction on Fedora and Windows;
- the fixed-radius failure mode that motivated adaptive station search;
- the gap between a runnable demo and the intended multimodal model.

`INITIAL_MATHEMATICAL_MODEL.md` preserves the corresponding early graph and optimization reasoning.
