# Later research: cycling infrastructure and road safety

_Brainstorm recorded 29 September 2026. Status: future investigation, after the useful-stop milestones. No new safety score, routing weight or accident-data integration is implemented by this document._

## User ideas to preserve

The user wants to investigate dangerous crossings/traffic lights, physically separated cycle paths, 30 km/h streets and pedestrian paths, and the risks associated with turning. Keep these as research questions rather than treating “every turn is dangerous” or “a traffic light is the most dangerous place” as established classification rules.

Parking theft protection is a different question, covered in [BIKE_PARKING.md](BIKE_PARKING.md). This document concerns collisions, manoeuvres, road conditions and cycling stress.

## Existing foundation

The app already describes mapped cycling infrastructure, surfaces and grouped posted speeds, and offers a **Lower traffic stress** heuristic. [CYCLING_ROUTES.md](CYCLING_ROUTES.md) documents direction-dependent interpretation and missing data. It does not measure collision probability. BRouter's grouped speed attributes cannot establish an exact 30 km/h limit everywhere; richer raw or official road data would be needed for that distinction.

## Refine the hypotheses

| User idea | Proposed investigation | Avoid this shortcut |
|---|---|---|
| Crossings and traffic lights deserve attention | Actual junction manoeuvre, conflicting traffic, protected bicycle phases, lane changes, turning vehicles, visibility and connection design | Penalising every signal: signals can also separate conflicting movements |
| Separate paths should be distinguished from streets | Physically separated track, painted lane, shared carriageway, shared pedestrian path and unknown; continuity through junctions | Treating a nearby track or a road tagged `cycleway=separate` as protection on the travelled carriageway |
| 30 km/h streets may be preferable | Posted/conditional speed, road width, motor traffic, junctions and parking-door exposure; keep unobserved conditions unknown | Equating a speed sign with measured vehicle speed or a guarantee of low risk |
| Pedestrian paths may reduce motor-vehicle exposure | Bicycle access permission, time restrictions, shared use, width and any required dismount/pushing | Assuming a pedestrian designation permits cycling or removes conflicts with people walking |
| Turns may increase difficulty | Left/right/straight manoeuvres at junctions, across-traffic turns, roundabouts, entry/exit from protected tracks and crossing tram rails | Counting every bend or geometry vertex as equally dangerous; straight travel can cross turning traffic |

**Research anchors:** The [FEDRO/ASTRA junction handbook](https://www.astra.admin.ch/dam/de/sd-web/PRZSm4X-eHMF/handbuch-veloverkehr-kreuzungen.pdf), especially chapters 4–6, distinguishes junction layouts and manoeuvres. Chapter 5 discusses separation by signal phases and direct/indirect left turns. [Suva](https://www.suva.ch/de-ch/praevention/freizeit/sicherheit-auf-dem-velo/beim-velofahren-sicher-abbiegen) identifies left turns as demanding manoeuvres. [FOEN's speed-reduction explanation](https://www.bafu.admin.ch/de/geschwindigkeitsreduktion) supports studying lower motor-vehicle speeds; it does not supply a per-route risk estimate.

These sources motivate candidate features, not universal numerical penalties. A lower-stress detour might involve more turns; penalising turns indiscriminately could favour an unpleasant arterial road.

## Candidate data and limitations

- **OSM and official infrastructure:** directed ways, actual connectivity, bicycle access, [cycleway attributes](https://wiki.openstreetmap.org/wiki/Key:cycleway), crossings/signals, speed restrictions, surfaces and mapped tram rails. Combine separately mapped tracks carefully and avoid double counting. Signal presence does not reveal timing, protected phases or current operation. Local inventories may add reviewed junction design.
- **FEDRO accident records:** the [official dataset](https://opendata.swiss/en/dataset/strassenverkehrsunfalle-mit-personenschaden) describes anonymised injury crashes since 2011, with date/time, road/accident type and severity; geo.admin.ch also provides a bicycle-involvement layer. Audit the download schema, bicycle/e-bike definitions, licence and latest covered year before selecting records. The catalogue publication date is not necessarily the last accident date.
- **Exposure and changes:** seek compatible bicycle/motor-traffic counts, road redesign dates and local reviewed conflict locations where available. Raw crash counts cannot establish risk per cyclist without accounting for use. Busy places may record more crashes; absent records do not prove safety. Injury records do not include every near miss or unreported incident.
- **Reports from riders:** potential evidence of uncomfortable or defective infrastructure, labelled by observation date and review status. Avoid translating an unverified complaint into a quantified risk or a permanent route prohibition.

Map-match crashes cautiously to the actual carriageway, direction and junction, accounting for positional uncertainty, bridges/tunnels and changed layouts. Keep aggregate source period and coverage visible. Do not call an internally chosen crash cluster an official black spot; that requires the competent authority's classification and method.

## Proposed research sequence

1. Select a small set of contrasting cycling corridors and junctions. Review actual manoeuvres and infrastructure, rather than making a national red/green safety map first.
2. Audit which features are observable and how often they are missing or ambiguous. Keep edge attributes and junction/turn attributes separate, with a documented way to connect them.
3. Explain route alternatives using observed facts: separated-track share, streets with documented lower speed limits, identified complex manoeuvres and unknown coverage. Continue using “lower traffic stress” language.
4. Compare rider/expert assessments, route usefulness and detour costs. Test against cases where a signalled crossing is preferable, a route has more easy turns, a pedestrian segment requires pushing, or a formerly problematic junction has been redesigned.
5. Only then propose calibrated changes to route selection. Validate on different corridors and periods; report sensitivity and coverage. Do not introduce a “safe route” guarantee or learned risk score before the evidence supports it.

This track remains after parking and [useful stops](CYCLING_AMENITIES.md). Recording the ideas does not change current routes or justify avoiding all lights, crossings or turns.
