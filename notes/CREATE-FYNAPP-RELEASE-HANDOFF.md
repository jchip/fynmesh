# create-fynapp Release Handoff

Date: 2026-07-10 (America/Los_Angeles)

## Current state

- Repository: `/Users/joel.chen/dev/fynmesh`
- Package: `dev-tools/create-fynapp`
- Working branch: `main`
- Integration: merge commit `bd4b828` preserves main parent `8974d47` and release parent `6c36c21`
- Branch status: clean after the local main integration
- Merge/push status: merged locally into `main`; not pushed
- Task project: `fynmesh-create-fynapp` (`CFA` prefix)
- Epic: `CFA-1`; public-release prerequisites are tracked by `CFA-20`, `CFA-25`, `CFA-33`,
  and `CFA-34`

The owner selected public npm distribution for core FynMesh framework packages only. Local sample
and demo packages remain unpublished. Repository-local setup and package checks pass. Public release
readiness still requires approved legal metadata, npm publisher access, and release
gates/publication for the core dependency packages listed below.

## Delivered changes

### CLI and generator

- Both published ESM bins load and execute under plain Node.
- Direct-execution guards use real paths and `pathToFileURL`, including paths containing spaces,
  `#`, and `%`.
- NixClap handlers read actual parsed options from `CommandNode.jsonMeta.opts`.
- Commandless creation works with fully specified options.
- `cfa check --no-build --dir <path>` is the supported output-inspection command.
- Generated app commands use streaming `fyn` child processes; npm execution and global
  `NODE_ENV` mutation were removed.
- Scaffolding advertises and accepts only the complete React template.
- Direct and prompted names/directories share format inspections.
- Target paths must remain under `demo/`; existing symlink escapes are rejected.
- The inert component-selection prompt and configuration field were removed.
- The React template no longer depends on the repository-only `fynapp-shell-mw` demo package.
- Public React scaffolds use standard `react`/`react-dom`; repository demos explicitly opt into the
  local `esm-react` adapters.

### Output integrity and contracts

- Output inspection removes stale `dist` before building.
- Malformed package metadata is rejected.
- Manifest name/version are matched to `package.json`.
- Local artifact terminology was changed from validation/verification language to `check` and
  `inspect` language. Inquirer's external `validate:` property remains unchanged.
- Agent contract documentation now matches the kernel lifecycle, bus, and suspend/resume APIs.
- The middleware consumer example declares its provider dependency.

### Package and release gates

- Development examples are excluded from the published artifact.
- Only `templates/react` is included; incomplete Vue and unused generic templates are excluded.
- The redundant ESM-incompatible `xrun-tasks.ts` loader was removed.
- TypeScript-aware ESLint is enabled in `xarc/check`.
- TypeDoc was upgraded for the resolved TypeScript version.
- Public configuration types are exported and included in generated API documentation.
- README and workflow documentation describe only supported commands and `fyn` flows.
- `install-cfa` uses `fyn` for build and global installation.
- Packaged guidance links curated examples at their durable repository location rather than paths
  excluded from the artifact.
- `@fynmesh/kernel` installs its public declaration dependency, advertises only ESM, and exposes a
  bundled root entrypoint that loads under plain Node.

## Commit ledger

| Ticket | Commit | Result |
| --- | --- | --- |
| CFA-16 | `4c24fb7` | Exclude development examples from package |
| CFA-17 | `ffcaf86` | Enforce lint in prepublish gate |
| CFA-19 | `497f2ec` | Generate compatible, warning-free API docs |
| CFA-9 | `1a468a0` | Stream app commands through `fyn` |
| CFA-10 | `bd50b3d` | Reject stale or mismatched output |
| CFA-15 | `0e079d0` | Declare middleware example provider |
| CFA-13 | `5e54bc8` | Synchronize the agent contract |
| CFA-14 | `76327db` | Rename local artifact inspections |
| CFA-12 | `0e960ab` | Align release CLI documentation |
| CFA-21 | `b0ed170` | Port output regressions to `checkFynApp` |
| CFA-5 | `a544651` | Make ESM CLI artifacts executable |
| CFA-11 | `607c7a9` | Deliver parsed CLI options to handlers |
| CFA-18 | `6419e91` | Make CLI execution guards URL-safe |
| CFA-6 | `ad7d7e7` | Expose only complete framework templates |
| CFA-7 | `931aa2d` | Inspect create inputs and constrain target paths |
| CFA-8 | `377f34a` | Remove inert component prompts |
| CFA-22 | `70aaf3b` | Use inspection terms for create inputs |
| CFA-23 | `47101bc` | Exercise the renamed built `check` command |
| CFA-24 | `fecb4a2` | Publish only supported React templates |
| CFA-26 | `1b28a10` | Document the release handoff |
| CFA-27 | `d20c0c1` | Use `fyn` for global CLI installation |
| CFA-28 | `d7834e6` | Remove the demo dependency from the React template |
| CFA-29 | `ccb72a2` | Install the kernel declaration dependency |
| CFA-30 | `e997a79` | Remove the false CommonJS kernel export |
| CFA-31 | `f0df4d1` | Bundle the kernel public entrypoint |
| CFA-32 | `20d5371` | Fix packaged example references |
| CFA-36 | `cf50ce6` | Refresh the public release handoff |
| CFA-37 | `3edbeee` | Keep demo React adapters out of public scaffolds |

Audit tickets `CFA-2`, `CFA-3`, and `CFA-4` were completed and closed before implementation.

## Check evidence

The final combined prepublish run completed successfully:

- `fyn run prepublishOnly`
  - TypeScript build passed.
  - TypeDoc generated HTML without TypeDoc diagnostics.
  - ESLint passed.
  - Jest coverage run passed: 16 suites, 78 tests.
- `@fynmesh/kernel` build and artifact checks passed.
  - The public `dist/index.js` loaded under plain Node.
  - Vitest passed: 38 files, 575 tests.
- Root `fyn bootstrap` completed using the existing `rollup-federation` checkout without cloning or
  fetching it. Bootstrap-generated changes to 27 unrelated demo/misc lockfiles were discarded.
- Built-artifact regressions executed both bins with plain Node.
- Noninteractive React creation, unsupported-framework rejection, malformed-name rejection,
  traversal rejection, symlink-escape rejection, and `cfa check --no-build` passed.
- `pnpm pack --dry-run --json` was used only for artifact inspection because `fyn` has no pack
  command. The result contained runtime files, agent docs, skills, source, and React templates; it
  did not contain examples, `.temp` data, Vue templates, or generic templates.
- `git diff --check` passed during each ticket integration.

### Environment state

The direct checkout's `create-fynapp` dependencies were refreshed with `fyn install`; no lockfile
change resulted. The direct-checkout prepublish gate passes. Root bootstrap reports global `fyn`
2.1.3 while fynpo uses internal fyn 2.1.1, which rewrites unrelated lockfiles; inspect and discard
that churn unless a dependency change intentionally requires it.

## Remaining blockers

### CFA-20: rollup-plugin-federation source and publication

`create-fynapp` depends on `rollup-plugin-federation@^1.0.0` and maps it locally to
`../../rollup-federation/rollup-plugin-federation`. The co-located ignored repository is present,
clean, and sufficient for repository-local bootstrap/build work.

Observed state:

- The checkout's origin is the GitLab `jchip/rollup-federation` repository.
- Root bootstrap uses the existing checkout without cloning or fetching and completes successfully.
- The public npm registry returns 404 for `rollup-plugin-federation`.
- Its package declares `UNLICENSED`, has blank public metadata, and lacks a package-local license and
  a deterministic clean-source pack/publish gate.

The owner selected public npm distribution. `CFA-20` now requires preparing and publishing an
approved `rollup-plugin-federation@1.x` artifact before downstream consumers can install
`create-fynapp`. Publication itself remains unauthorized by this handoff.

### CFA-25: release policy and package metadata

`dev-tools/create-fynapp/package.json` still declares `UNLICENSED` and has blank homepage,
repository URL, and author fields. The repository root contains Apache-2.0, but the package's
explicit `UNLICENSED` value must not be silently overridden.

Public release mode is selected. An owner still must supply the exact SPDX license, author, and
homepage and approve repository metadata. Repository evidence supports
`git+https://github.com/jchip/fynmesh.git` with directory `dev-tools/create-fynapp`, but the explicit
`UNLICENSED` value must not be changed by inference. Each separately published package also needs
its approved package-local license text.

### Framework dependency release gates

- `CFA-33`: prepare `federation-js` for public npm before `@fynmesh/kernel`.
- `CFA-34`: prepare `rollup-wrap-plugin` for public npm before `create-fynapp`.
- `CFA-35` is `wont_do`: `esm-react` and `esm-react-dom` are local demo packages, not public release
  prerequisites. `fynapp-shell-mw` is also demo-only.
- Core package names checked during this continuation returned 404 from the public npm registry.
  Publisher access, name/scope ownership, and release provenance policy remain external
  prerequisites.

## Continuation sequence

1. Obtain the exact owner/legal values for `CFA-25` and the dependency packages.
2. Prepare the core leaf packages and their clean artifact gates: `federation-js`,
   `rollup-plugin-federation`, and `rollup-wrap-plugin`.
3. After `federation-js` is public, prepare `@fynmesh/kernel`.
4. Publish `create-fynapp` only after its runtime dependencies and every generated-template
   dependency are public and a clean generated-app install/build passes without local overrides.
5. Rerun root `fyn bootstrap`, both package gates, artifact dry runs, and the clean downstream smoke
   check; inspect and discard unrelated lockfile churn.
6. Confirm `git status --short` is clean and review `git diff main...HEAD`.
7. Close the release-preparation tickets and `CFA-1` only when all public prerequisites and checks
   are complete.
8. Merge and push according to the owner's requested branch workflow. Do not publish, version, or
   tag unless separately authorized.

## Integration cautions

- Keep scaffolding support limited to React until another framework has complete source templates
  and built end-to-end coverage. The rollup config factory's broader manual configuration types do
  not imply generator support.
- Preserve `checkFynApp`, `runCheck`, and `cfa check`; do not restore the removed local
  validation/verification terminology.
- Preserve `getCommandOptions(...)` wrappers and the positive default-true `build` option so
  `--no-build` maps to `false`.
- Preserve realpath plus `pathToFileURL` direct-execution guards.
- Continue using `fyn`/`nvx`; do not add npm/npx workflows.
- Keep examples out of the package allowlist and keep the template allowlist at `templates/react`.

## Supporting audit summaries

The original audit and implementation summaries are in ignored scratch storage:

- `/Users/joel.chen/dev/fynpo/.temp/create-fynapp-code-audit.md`
- `/Users/joel.chen/dev/fynpo/.temp/create-fynapp-workflow-audit.md`
- `/Users/joel.chen/dev/fynpo/.temp/create-fynapp-package-audit.md`
- `/Users/joel.chen/dev/fynpo/.temp/create-fynapp-cli-fixes.md`
- `/Users/joel.chen/dev/fynpo/.temp/create-fynapp-release-doc-fixes.md`
- `/Users/joel.chen/dev/fynmesh/.temp/subagent-cfa20.md`
- `/Users/joel.chen/dev/fynmesh/.temp/subagent-cfa25.md`
- `/Users/joel.chen/dev/fynmesh/.temp/subagent-release-actions.md`

Those files are supplemental; this handoff is the durable continuation source in `fynmesh`.

## Temporary branch/worktree cleanup

The integration worktree was removed after moving `codex/create-fynapp-release` into the direct
`fynmesh` checkout. Additional isolated ticket worktrees/branches under
`/Users/joel.chen/dev/fynpo/.temp/worktrees/` may be removed after the release branch is merged;
their commits have already been integrated. The tracked `fynpo` worktree remains unchanged.
