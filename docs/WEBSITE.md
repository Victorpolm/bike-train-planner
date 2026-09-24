# Website access and development

## Open the private website

[**Open private website**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site)

The Site is restricted to its owner. Use the same ChatGPT account used to publish it; sign in if prompted. Knowing the address does not grant someone else access.

To open it from GitHub, visit the [repository home page](https://github.com/Victorpolm/bike-train-planner) and click **Open private website** near the top of the README. No download or local installation is needed.

## Run from Git on your computer

Install Git and Node.js 24, the version used for verification. Authenticate to GitHub with access to this private repository, then run:

```bash
git clone https://github.com/Victorpolm/bike-train-planner.git
cd bike-train-planner/prototype-v0
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Keep the terminal running while using the app; press Ctrl+C to stop it. The app needs internet access for map tiles, place lookup and transit schedules. Basic searches work without a key. To enable dated bicycle permission, set `OJP_API_KEY` in a local ignored `.env`; the Vite server handles OJP requests. Do not use a `VITE_` prefix.

For an existing clone with no uncommitted changes, run `git pull --ff-only` from the repository, then run the commands in `prototype-v0/` above. Keep any local changes before pulling.

To check the production build locally:

```bash
npm test
npm run build
npm run preview
```

Open the preview URL printed in the terminal, normally `http://localhost:4173`. Opening `index.html` directly in GitHub or from the filesystem does not run the application.

## Publishing changes

GitHub is the authoritative source. The hosted Site has its own source repository and publication history; pushing to GitHub alone does **not** republish it. Ask Codex to publish the latest `prototype-v0/` to the existing private Bike + Train Site after code changes.

`prototype-v0/.openai/hosting.json` identifies the existing Site. The build creates a Worker at `dist/server/index.js` with embedded frontend assets. Reuse this identity; do not create a replacement Site. Preserve owner-only access unless explicitly instructed otherwise. The file contains no authentication credentials.

Publishing must use the tested app source from the chosen GitHub revision, build its Worker and frontend output, push that exact source to the Site repository, and save/deploy the corresponding version. Confirm successful deployment before reporting an update. Do not commit dependencies, build output, tokens or local environment files.

The app uses real BRouter cycling paths and estimated routed durations; transit lines remain schematic and discovery is sampled. The source now has three independent permission comparisons, including an unrestricted reference that may prohibit bicycles. The OJP adapter provides dated permissions once the Site runtime secret is configured. Tickets and reservations appear separately; absent information remains unknown. No live bicycle-space or booking integration is implemented. See [current project state](PROJECT_STATE.md) and [results and map design](RESULTS_AND_MAP.md).

## Runtime secret

Production needs a secret named `OJP_API_KEY` in this existing Site's runtime environment. GitHub Actions has a separately stored key that passed live checks, but GitHub cannot return a stored secret value for automatic transfer. Never expose the key through a workflow artifact or the frontend. Configure it in the Site and deploy the saved version to apply the environment revision. The application checks `/api/ojp/status` before selecting its provider and falls back with an explicit warning when unconfigured.

## Last verified publication

Private **version 14** succeeded on **24 September 2026 at 18:01:48 UTC**, from Site source `c0283e036da14e004e5abeddb49f62cf23e67f90`. The saved version is `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_bf77857e0c108191b488f1368aabd82a`; deployment `appgdep_6ab5657782b8819192a1c538e28da1e3` reports `succeeded`. Owner-only access was preserved.

This publication contains the three comparisons, per-leg prerequisites, protected OJP backend and scoped TripInfo checks. Environment revision is **0**: live OJP website access is pending the separate Site runtime secret. GitHub Actions API access is independently verified.

120 application tests, 13 Python tests and the production build passed. The managed preview service was unavailable, so desktop/mobile browser QA could not be completed in this session. Older `SOURCE.md` and `project-documentation` files in Site history are dated publication snapshots; current documentation is authoritative here in GitHub.
