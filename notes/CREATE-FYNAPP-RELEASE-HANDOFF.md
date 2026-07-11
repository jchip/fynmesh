# create-fynapp Release Handoff

Date: 2026-07-10 (America/Los_Angeles)

## Current state

- Repository: `/Users/joel.chen/dev/fynmesh`
- Package: `dev-tools/create-fynapp`
- Working branch: `codex/create-fynapp-release`
- Base branch: `main` at `cf7558c`
- Branch status: clean, 19 ticket-prefixed commits ahead of `main`
- Merge/push status: not merged and not pushed
- Task project: `fynmesh-create-fynapp` (`CFA` prefix)
- Epic: `CFA-1`, blocked only by `CFA-20` and `CFA-25`

The implementation and package checks are complete. Release readiness still requires an external
dependency source and an owner decision about distribution metadata.

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

Audit tickets `CFA-2`, `CFA-3`, and `CFA-4` were completed and closed before implementation.

## Check evidence

The final combined prepublish run completed successfully:

- `fyn run prepublishOnly`
  - TypeScript build passed.
  - TypeDoc generated HTML without TypeDoc diagnostics.
  - ESLint passed.
  - Jest coverage run passed: 16 suites, 73 tests.
- Built-artifact regressions executed both bins with plain Node.
- Noninteractive React creation, unsupported-framework rejection, malformed-name rejection,
  traversal rejection, symlink-escape rejection, and `cfa check --no-build` passed.
- `pnpm pack --dry-run --json` was used only for artifact inspection because `fyn` has no pack
  command. The result contained runtime files, agent docs, skills, source, and React templates; it
  did not contain examples, `.temp` data, Vue templates, or generic templates.
- `git diff --check` passed during each ticket integration.

### Environment caveat

The final prepublish run occurred in the integration worktree using the refreshed dependency tree
created while updating `fyn-lock.yaml`. The branch is now checked out directly in `fynmesh`, but
its existing `dev-tools/create-fynapp/node_modules` predates the new ESLint and TypeDoc entries.
Refresh dependencies after resolving `CFA-20`, then rerun the gate from the direct checkout.

## Remaining blockers

### CFA-20: rollup-plugin-federation source and publication

`create-fynapp` depends on `rollup-plugin-federation@^1.0.0` and maps it locally to
`../../rollup-federation/rollup-plugin-federation`. The co-located repository is absent and ignored
by `fynmesh`.

Observed state:

- Root scripts expect to clone `https://github.com/jchip/rollup-federation.git`.
- HTTPS access requests credentials.
- Standard and configured `github.com-jchip` SSH identities report repository not found.
- The configured package registry returns 404 for `rollup-plugin-federation`.
- An installed copy exists under `node_modules`, but it is `UNLICENSED`; do not vendor it by
  inference or treat installed output as authoritative source.

Continuation requires one of these owner-provided outcomes:

1. Restore/provide the correct source repository and update `clone-fed` if its URL changed.
2. Publish `rollup-plugin-federation@1.x` to the registry consumers will use.
3. Provide another approved, durable package source.

### CFA-25: release policy and package metadata

`dev-tools/create-fynapp/package.json` still declares `UNLICENSED` and has blank homepage,
repository URL, and author fields. The repository root contains Apache-2.0, but the package's
explicit `UNLICENSED` value must not be silently overridden.

An owner must choose either:

1. Private/internal release: retain `UNLICENSED` and provide any required private registry
   metadata.
2. Public release: approve the package license and canonical repository, homepage, and author
   values.

## Continuation sequence

1. Resolve `CFA-25` and commit the approved package metadata with a `CFA-25:` prefix.
2. Resolve `CFA-20` by restoring or publishing `rollup-plugin-federation`; update source/registry
   references only if the owner supplies the authoritative location.
3. From the repository root, run the documented federation/bootstrap setup in tmux. A normal clean
   setup is `fyn bootstrap`, which invokes `fyn install-federation`.
4. From `dev-tools/create-fynapp`, refresh dependencies with `fyn install` and inspect any
   `fyn-lock.yaml` changes before committing.
5. Rerun `fyn run prepublishOnly` and the artifact dry-run inspection.
6. Confirm `git status --short` is clean and review `git diff main...HEAD`.
7. Close `CFA-20` and `CFA-25`, then close `CFA-1` only when both blockers and all release checks
   are complete.
8. Merge and push according to the owner's requested branch workflow. Do not publish, version, or
   tag as part of this handoff unless separately authorized.

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

Those files are supplemental; this handoff is the durable continuation source in `fynmesh`.

## Temporary branch/worktree cleanup

The integration worktree was removed after moving `codex/create-fynapp-release` into the direct
`fynmesh` checkout. Additional isolated ticket worktrees/branches under
`/Users/joel.chen/dev/fynpo/.temp/worktrees/` may be removed after the release branch is merged;
their commits have already been integrated. The tracked `fynpo` worktree remains unchanged.
