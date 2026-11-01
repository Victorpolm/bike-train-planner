# Live explanatory TripInfo evidence

Captured 13 October 2026 at 20:48 UTC through the existing owner-private production OJP adapter. The fixed public diagnostic request was Zürich HB to Bern; it was not a user itinerary. Both the journey search and exact-service TripInfo returned HTTP200, with no acquisition warning. Both returned departure 21:01:36Z and arrival 22:02:30Z for the selected SBB IC8.

`tripinfo.json` is the real parsed HTTP response, not raw provider XML and not a synthetic fixture. It retains the exact dated service reference so the client refresh path can be replayed. No request headers, keys, user profile or GPS records are included. Use the recorded provider timestamp to evaluate historical freshness.

Raw XML retention for the TripInfo monitor is separately implemented; its first scheduled capture remains to be observed after release. The companion 11 October fixture exercises the XML journey-search parser against an actual raw provider response.

Official protocol documentation: https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptripinforequest-2-0/
