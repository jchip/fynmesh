# How to Create / Modify a FynApp

> **Moved.** The authoritative, kernel-anchored FynApp docs now live with the
> tooling in `dev-tools/create-fynapp/` so they stay in sync with the build
> helpers and the `@fynmesh/kernel` contract.

| I want to… | Read |
|------------|------|
| Understand the FynApp contract (FynUnit, rollup config, middleware, manifest) | [`dev-tools/create-fynapp/agent/CONTRACT.md`](../dev-tools/create-fynapp/agent/CONTRACT.md) |
| Create a new FynApp, or modify an existing one | [`dev-tools/create-fynapp/agent/GUIDE.md`](../dev-tools/create-fynapp/agent/GUIDE.md) |
| Update FynApps after a kernel API change | [`dev-tools/create-fynapp/agent/MIGRATION.md`](../dev-tools/create-fynapp/agent/MIGRATION.md) |
| Copy a working pattern | [`dev-tools/create-fynapp/examples/`](../dev-tools/create-fynapp/examples) |

**Coding agents:** the `/fynapp-modify` and `/fynapp-migrate-kernel` skills
(`.claude/skills/`) drive these workflows.

**Create quickly:** `create-fynapp --name my-fynapp --framework react`, then
register it in the demo server (see the GUIDE). **Check any change** with
`cd demo/<fynapp> && cfa check`.
