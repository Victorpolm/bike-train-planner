# Live OJP canary evidence

Captured by the private production monitor on 11 October 2026 at 19:28:17 UTC from the public Swiss OJP2 API. Fixed public corridor: Zürich HB to Bern, departure at check time; explanatory realtime requested; bicycle filter off. This contains timetable/service data for the fixed corridor, not a personal itinerary or GPS history. No request headers or credentials are retained.

- Raw bytes: 438143
- SHA256: `380fc6480b9321402f11513155dc5c0a249222b2341b002fa7c9190f4c1971a7`
- Raw EstimatedTime elements: 34
- Parsed services with live estimates: 7
- Parser: `prototype-v0/src/ojp.ts`, `parseOjpConnections(xml,false)`

This is an actual provider response, not the synthetic estimate injection used by `maintenance.test.ts`. Use the recorded date when testing freshness. Service availability and estimates will change. Source: https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ .
