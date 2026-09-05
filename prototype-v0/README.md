# Bike + Train prototype

A local, deliberately simple prototype for comparing bicycle–train journeys in
Switzerland.

## What it does

1. Geocodes a departure point and an arrival point in Switzerland.
2. Combines live nearby-stop searches with a small list of major Swiss rail hubs
   from the official GTFS timetable, then keeps up to five stations within an
   estimated 20-minute bicycle ride of each endpoint.
3. Requests current train connections for every candidate station pair.
4. Ranks the combinations by estimated arrival time at the final destination.

The model assumes a constant cycling speed of 15 km/h, straight-line distances,
and a three-minute station buffer. It does **not** yet calculate navigable or
safe bicycle paths.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Vite. To validate a production build:

```bash
npm test
npm run build
npm run preview
```

## Data used

- Place search: the Swiss federal GeoAdmin SearchServer.
- Nearby stations and live connections: the community Transport API at
  `transport.opendata.ch`.
- Map: OpenStreetMap tiles.

The Transport API is suitable for experimentation and enables browser CORS, but
it is unofficial and rate-limited. A serious production version should move to
the official Swiss Open Journey Planner (OJP) API and store its API token only
on a backend.

## Prototype limitations

- The 20-minute cycling radius is approximated as five kilometres in a straight
  line.
- Candidate rail stations are detected heuristically from several nearby-stop
  searches. The list can be incomplete.
- The train API is queried slowly to respect its public rate limit.
- Bicycle carriage rules and reservations are not included yet.
- The lines on the map are explanatory, not turn-by-turn routes.
