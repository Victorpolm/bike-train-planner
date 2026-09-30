// Shared acquisition limits; provider work is budgeted separately from cycling.
export const SEARCH_LIMITS = { stopsPerSide: 4, connectionsPerPair: 4, baselinePairs: 4, transferStops: 2,
  neighborsPerTransfer: 1, suffixQueries: 2, railExitQueries: 2, stationboards: 1, requests: 18,
  locationProbesPerSide: 2, phaseMilliseconds: 90_000, requestMilliseconds: 20_000 };
