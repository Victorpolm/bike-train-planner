# Dedicated ChatGPT Project setup

This is the recommended setup for a clean, self-contained ChatGPT environment for the Bike + Train Journey Planner.

## 1. Create the project

- Name: **Bike + Train Planner — Switzerland**
- Suggested icon: bicycle or train
- Suggested colour: green
- If offered during creation, select **project-only memory**. This keeps the project distinct from unrelated startup and political-ideas work.

OpenAI's current Projects interface keeps project chats, instructions and sources together. A ChatGPT Project does not itself expose an arbitrary folder on a computer, so the GitHub source and any required local folder must be connected explicitly.

## 2. Install the project instructions

Open the project's settings and paste the instruction block from:

`CHATGPT_PROJECT_SETTING.md`

Do not paste the entire repository into the instructions. The instructions should contain stable collaboration rules; evolving product and technical knowledge belongs in the repository.

## 3. Connect GitHub

Connect the GitHub app/source and grant access only to:

`Victorpolm/bike-train-planner`

Use `main` as the default authoritative branch. GitHub access is retrieved on demand; do not assume that a copied or uploaded file stays synchronized with the repository.

After connecting it, start a verification chat with:

> Open `Victorpolm/bike-train-planner` on `main`. Read `README.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `CHATGPT_PROJECT_SETTING.md`. Do not change anything. Tell me the current objective, the existing prototype, the three main technical uncertainties, and the next recommended experiment. Cite the repository files you used.

If ChatGPT cannot read the private repository, fix the GitHub authorization before doing project work. Do not compensate by relying on old chat memory.

## 4. Keep the new project clean

Do not move every historical conversation into the new project. The repository already consolidates the useful history, while old chats contain superseded assumptions and setup failures.

Move only a conversation when it contains evidence or an artifact not yet preserved in GitHub. Otherwise, start fresh.

Create separate chats for separate outcomes. Recommended initial chats:

1. **Verify and run prototype v0**
2. **Design adaptive station search**
3. **Define golden Swiss journeys**
4. **Audit bicycle-carriage data**
5. **Plan cyclist interviews**

## 5. Use the local code correctly

For local coding, clone the repository and open that folder as a local project in the ChatGPT desktop app or start Codex from that directory. This is separate from the ChatGPT Project's GitHub source.

```bash
git clone https://github.com/Victorpolm/bike-train-planner.git
cd bike-train-planner/prototype-v0
npm install
npm run dev
```

The v0 requirements and limitations are documented in `prototype-v0/README.md` and `docs/FIRST_PROTOTYPE.md`.

## 6. Repository roles

| Location | Purpose |
|---|---|
| `CHATGPT_PROJECT_SETTING.md` | Stable instructions pasted into the ChatGPT Project |
| `AGENTS.md` | Rules for Codex or other coding agents working in the repository |
| `README.md` | Entry point and document map |
| `docs/PROJECT_STATE.md` | Short current-state summary and next actions |
| `docs/DECISIONS.md` | Dated decisions and reversals |
| `docs/INITIAL_MATHEMATICAL_MODEL.md` | Historical origin of the graph and optimization model |
| `docs/ROUTING.md` | Current routing formulation and research direction |
| `docs/EXPERIMENTS.md` | Golden journeys, experiments and observed failures |
| `docs/RESEARCH_LOG.md` | External research questions and findings |
| `prototype-v0/` | Preserved first runnable implementation |

## 7. Routine for substantial sessions

At the beginning:

1. State the desired outcome.
2. Ask ChatGPT to inspect the current repository state.
3. Identify whether the task is research, decision, experiment, documentation or implementation.

At the end:

1. Verify tests/build or state exactly why verification was not possible.
2. Update the relevant durable documentation.
3. Record important failed approaches, not only successes.
4. Confirm the exact commit or files changed.
5. End with one concrete next step.

## 8. Immediate recommended sequence

1. Clone and run `prototype-v0` on the target computer.
2. Confirm its existing behaviour on three origin/destination pairs.
3. Turn those pairs into golden regression journeys in `docs/EXPERIMENTS.md`.
4. Refactor route generation, route metrics and ranking into separate layers.
5. Implement adaptive candidate-station expansion with an explicit maximum and fallback.
6. Only then replace straight-line cycling estimates with routed cycling times.

This order preserves the simple prototype while preventing it from becoming a dead end for future multicriteria routing.
