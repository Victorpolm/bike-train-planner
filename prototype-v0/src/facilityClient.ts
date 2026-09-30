import { validFacilityData, type FacilityJob, type FacilityLoad } from "./facilitySources.ts";

// Independent results and a small request pool: a failed page/station never hides
// successful records from another source. No route coordinates leave the client.
export async function loadFacilityJobs(jobs: readonly FacilityJob[], signal: AbortSignal,
  update: (load: FacilityLoad) => void, fetcher: typeof fetch = fetch) {
  let next = 0;
  const worker = async () => {
    while (!signal.aborted && next < jobs.length) {
      const job = jobs[next++]; update({ ...job, status: "loading" });
      try {
        const response = await fetcher(job.path, { signal: AbortSignal.any([signal, AbortSignal.timeout(job.provider === "swisstlm3d" ? 90000 : 35000)]),
          headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error([401, 403].includes(response.status) ? "Open the planner in its own tab to restore access." : "Unavailable; retry after a minute.");
        if (response.headers.get("Content-Type")?.includes("text/html")) throw new Error("Open the planner in its own tab to restore access.");
        const value: unknown = await response.json();
        if (!validFacilityData(value, job)) throw new Error("Source format could not be validated.");
        if (!signal.aborted) update({ ...job, status: "ready", data: value });
      } catch (error) {
        if (!signal.aborted) update({ ...job, status: "error", error: error instanceof Error && ["Open the planner in its own tab to restore access.", "Unavailable; retry after a minute.", "Source format could not be validated."].includes(error.message)
          ? error.message : "Could not load this source; retry loading." });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, worker));
}
