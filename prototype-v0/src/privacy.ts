export const PRIVACY_REVIEW_DATE = "11 October 2026";
// Never infer a legal identity or publish an account email as a privacy contact.
export const PRIVACY_OPERATOR: { name: string | null; contact: string | null } = { name: null, contact: null };
export const LOCAL_PERSONAL_KEYS = ["bike-train-travellers-v1", "bike-train-fare-profile-v1", "reroute-journeys-v1"] as const;
export function clearLocalPersonalData(storage: Pick<Storage, "removeItem">) {
  for (const key of LOCAL_PERSONAL_KEYS) storage.removeItem(key);
}
export const PRIVACY_RECIPIENTS = [
  { name: "OpenAI Sites / Cloudflare hosting", data: "IP and request metadata; sign-in identity and cookies; requests sent to the app’s API.", purpose: "Host the app, control access, prevent abuse and diagnose failures." },
  { name: "OpenStreetMap tile service", data: "Your IP address, browser metadata and requested map tiles.", purpose: "Display the map, including the area visible while following your location." },
  { name: "BRouter / FOSSGIS routing.openstreetmap.de", data: "Your IP address and cycling/walking endpoints or route-shaping points.", purpose: "Find road and walking paths. Requests go directly from your browser." },
  { name: "swisstopo / geo.admin.ch", data: "Place queries and map points directly from your browser; route geometry or a rounded search area through our server.", purpose: "Find places, check terrain and find official cycling routes and closures." },
  { name: "Photon (photon.komoot.io)", data: "Your IP address, place-search text and search area.", purpose: "Find named places. This geocoder does not supply Komoot tours or scenic-route data." },
  { name: "transport.opendata.ch / search.ch", data: "Your IP address, stop/place queries, requested stations and travel times.", purpose: "Find public-transport stops and timetable connections." },
  { name: "Open data platform mobility Switzerland / SBB OJP", data: "Selected stops, service identifiers and travel times through our server; no profile name or continuous GPS trace.", purpose: "Check timetables, bicycle conditions, transfers and realtime service changes. Integration fare queries are disabled." },
  { name: "overpass.osm.ch, open transport parking, GitHub", data: "Our server requests public facility/timetable datasets; these requests do not contain your journey endpoints.", purpose: "Load public facilities, parking and maintained station-transfer indexes. Trafimage/INSA and tourism-page extraction are disabled." },
] as const;
