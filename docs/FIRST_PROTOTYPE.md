# First runnable prototype — preservation status

This document records an important historical artifact of the project: we had already moved beyond product discussion and mathematical modelling into a **first runnable implementation/prototype**.

## What is known with confidence

- We worked on a first implementation before this repository was created.
- The implementation was intended as an early web prototype, not a production system.
- Local setup involved Node/npm; during the earlier work, a Windows setup issue arose because Node and npm were not available on the machine.
- The implementation belonged to the same early MVP effort described elsewhere in this repository: get a simple bike + public-transport workflow running before building the final mathematical/algorithmic architecture.

## Source-code status

**The exact source files of that first prototype are not currently present in this repository and are not available in the files accessible to the current ChatGPT session.**

They have therefore **not been reconstructed from memory**. Reconstructing them and presenting the result as the original would destroy the historical value of preserving the actual first version.

When the original local project folder or archive is available, it should be imported verbatim under a historical path such as:

`prototype-v0/`

or, if development continues directly from it, placed in the normal application structure while preserving a git tag such as:

`v0-original-prototype`

## Why preserving v0 matters

The first implementation is useful even if technically poor. It records:

- what we originally thought was necessary to build;
- which parts were easy or difficult in practice;
- early architecture choices;
- early UI assumptions;
- dependencies and setup friction;
- the gap between the initial prototype and the later mathematical model;
- which ideas arose only after interacting with a concrete implementation.

Future work should not silently rewrite this history.

## Import procedure when source becomes available

1. Copy the original files without redesigning or cleaning them first.
2. Exclude only generated dependencies/build outputs such as `node_modules` if present.
3. Preserve the original package/dependency manifests (`package.json`, lock file, etc.).
4. Add a short `prototype-v0/README.md` describing how it was run and what worked.
5. Commit it as a historical import.
6. Tag the corresponding commit `v0-original-prototype` if appropriate.
7. Only after that should refactoring or migration begin in later commits.

## Relationship to other documentation

- `INITIAL_MATHEMATICAL_MODEL.md` preserves the initial mathematical reasoning.
- `ROUTING.md` contains the cleaner current routing formulation.
- This file exists to ensure the **actual first software version** is also treated as part of the project memory and is not forgotten.

## Open preservation task

**Import the exact original v0 source code once the local folder/archive is available.**