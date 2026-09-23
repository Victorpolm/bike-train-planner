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

Open the local URL printed by Vite, normally `http://localhost:5173`. Keep the terminal running while using the app; press Ctrl+C to stop it. The app needs internet access for map tiles, place lookup and transit schedules. No API keys or separate backend are required.

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

`prototype-v0/.openai/hosting.json` identifies the existing Site and its `dist` static output. Reuse this identity; do not create a replacement Site. Preserve owner-only access unless explicitly instructed otherwise. The file contains no authentication credentials.

Publishing must use the tested app source from the chosen GitHub revision, build its static output, push that exact source to the Site repository, and save/deploy the corresponding version. Confirm successful deployment before reporting an update. Do not commit dependencies, build output, tokens or local environment files.

The app uses real BRouter cycling paths and estimated routed durations; transit lines remain schematic and discovery is sampled. The source now has three independent permission comparisons, including an unrestricted reference that may prohibit bicycles. Individual bicycle permissions remain unverified by the current feed. No live bicycle-space or booking integration is implemented. See [current project state](PROJECT_STATE.md) and [results and map design](RESULTS_AND_MAP.md).

## Last verified publication

Version 13 succeeded on 21 September 2026 at 07:38 UTC. It precedes the three-comparison/TripInfo synchronization change. That source change has not been deployed: the Sites connector currently returns HTTP 400 `Invalid MCP request metadata`. Update this record only after a successful matching publication. A successful local build is not a deployment.
