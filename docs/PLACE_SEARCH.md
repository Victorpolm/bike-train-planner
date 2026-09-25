# Named places, addresses and transit stops

Updated 25 September 2026.

The destination and origin inputs support venues as well as streets and stations. Type a name and town, such as **fortyseven baden**, and select the result labelled **Bath / spa · Grosse Bäder 1 · 5400 Baden**. Nearby car parks are separately labelled. A map point or street address remains an alternative.

## Cause and correction

The Transport API returns “FORTYSEVEN Wellness-Therme, Baden, Grosse Bäder 1” with null coordinates. Those coordinates must not be invented. GeoAdmin returns town-level Baden matches. Previously submitting typed text accepted the first usable response, so it could silently route to Baden instead of the bath.

The inputs now combine three independent sources:

- Existing known Swiss hubs and Transport API stops.
- GeoAdmin addresses and geographic names.
- Photon named places from OpenStreetMap, limited to the Swiss bounding box and records with country code CH.

Rank the complete candidate pool before taking eight suggestions. Whole-query matches rank ahead of partial town matches; exact venue names rank ahead of associated car parks. Accent-insensitive word prefixes support partial typing. House numbers must match completely. Submitting unselected text only auto-selects a result covering the whole query; otherwise ask the traveller to select a suggestion or refine the address.

Photon IDs are OSM feature IDs, never transit stop IDs. The planner keeps the returned venue coordinates and discovers transit access around them. Map naming still preserves clicked coordinates.

## Operational limits

Photon's public service supports autocomplete at reasonable request volumes. This owner-private prototype uses a 500 ms typing debounce, at least three characters for Photon, cancellation, the existing bounded 50-query session cache, and a 20-second provider deadline. The providers publish independently. HTTP 429 pauses Photon requests for at least a minute and respects a longer Retry-After. There are no retries or new paid services.

This is a public external dependency with no availability guarantee and incomplete OSM venue coverage. A first venue response took about nine seconds in a live check. The service must be reassessed before public-scale use. No complete Swiss venue inventory or in-house geocoder is claimed.

## Sources and fixture

- [Photon documentation and public-server usage](https://github.com/komoot/photon)
- [Photon search API](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- [OpenStreetMap copyright and ODbL attribution](https://www.openstreetmap.org/copyright)
- [FORTYSEVEN official arrival information](https://www.fortyseven.ch/en/arrival)

The small public response in prototype-v0/src/fixtures/photon-fortyseven-baden.json was retrieved on 25 September 2026 from Photon, query q=fortyseven baden, limit=6, lang=en and bbox=5.95,45.81,10.5,47.81. Data © OpenStreetMap contributors, ODbL. It contains the bath and two associated car parks, not personal trip data. The bath point is latitude 47.4813202, longitude 8.3128908.
