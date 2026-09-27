# FynMesh Development Roadmap

_Status reviewed 2026-09-26 against the source; see "Known gaps" for items that are
built but not switched on. This is the single roadmap; the older
`FRAMEWORK_ROADMAP.md` is in `archive/`._

## Current State (Completed)

- [x] Kernel with module loading via SystemJS federation
- [x] Middleware system with setup/apply/execute phases
- [x] Middleware execution override capability
- [x] Middleware version map with semver-range lookup (FYM-321)
- [x] Manifest resolution and bootstrap coordination
- [x] Multi-framework support (React, Vue, Marko, Preact, Solid, Svelte)
- [x] Multi-version module support
- [x] Error reporting with KernelError hierarchy
- [x] Shell layout middleware with multi-region support
- [x] React Context middleware
- [x] Design tokens middleware
- [x] FynBus inter-FynApp messaging (pub/sub + request/response + channels)
- [x] In-page federation inspector, deployed with the demo site
      (`docs/federation-inspector.min.js`; design: [`federation-inspector-design.md`](./federation-inspector-design.md))
- [x] Combined-bundle optimization (`federation-combine`) with pre-execution bundle maps
- [x] Embedded manifest (`__FYNAPP_MANIFEST__`) — a splice miss now fails the build (FYM-296)
- [x] **Published to npm** — `federation-js` 1.1.4, `@fynmesh/kernel` 1.1.5,
      `rollup-plugin-federation` 1.1.3, `create-fynapp` 1.1.7
- [~] Runtime telemetry & observability (KernelTelemetry: ring buffer, scopes, transports)
      — built, but no entry point passes a `TelemetryConfig`, so it is off in practice

---

## Near-Term Priorities (Next 1-3 Months)

### 1. **FynApp Lifecycle** ⭐ Priority 1
**Pain Point:** FynApps have initialize() and execute(), but no cleanup

- [x] Add `shutdown()` lifecycle hook to FynUnit interface
- [x] Add `shutdownFynApp()` to kernel with `FYNAPP_SHUTDOWN` event
- [x] Lifecycle events (`FYNAPP_BOOTSTRAPPED`, `FYNAPP_BOOTSTRAP_FAILED`, `FYNAPP_BOOTSTRAP_TIMEOUT`, `FYNAPP_SHUTDOWN`)
- [x] Add `suspend()` / `resume()` for background FynApps (FYM-9; `FYNAPP_SUSPENDED`/`FYNAPP_RESUMED`)
- [x] Implement mount tracking in kernel (FYM-10; `getFynAppState`/`listFynAppStates`)
- [x] Add error boundary per FynApp (isolate failures) (FYM-11; failed state recorded, siblings unaffected)
- [ ] HMR support for development (FYM-12; won't do—intentionally out of scope)

### 2. **Inter-FynApp Communication (FynBus)** ✅ Shipped (epic FYM-2, FYM-13–18)
**Was:** FynApps could only communicate via middleware context (indirect). Now via `core/kernel/src/fyn-bus.ts` (design: [`FYNBUS_DESIGN.md`](./FYNBUS_DESIGN.md)).

- [x] Design FynBus event bus API
- [x] Implement pub/sub messaging (emit, on, once)
- [x] Add request/response pattern (RPC-like)
- [x] Channel scoping and namespacing (FYM-16; flat channel isolation)
- [x] Per-call generic payload types (shared topic contracts remain open as FYM-17)
- [x] Demo: Two FynApps communicating via events (`demo/fynapp-1`, `shared-demo-utils/fynbus-hooks.ts`)

### 3. **Developer Experience & Tooling** ⭐ Priority 3

#### create-fynapp Improvements
- [x] Complete all framework templates — `react`, `react18`, `vue`, `preact`, `solid`,
      `svelte`, `marko`, `vanilla` (+ `_generic`) all present in `templates/`
- [ ] Replace string templating with proper template engine
- [ ] Add `cfa dev` command with built-in dev server + HMR
- [ ] Add `cfa add middleware` command
- [ ] Test framework scaffolding (Vitest)
- [ ] Config schema validation

#### DevTools & Debugging
- [ ] Dev overlay showing FynApp boundaries and names
- [ ] Console integration (prefix logs with FynApp name)
- [x] Error overlay with stack traces (FYM-29; development browser bundle)
- [ ] Keep diagnostics in production — `drop_console: true` strips the error codes and
      inspector diagnostics exactly where they are hardest to reproduce

#### Chrome Extension — cancelled (FYM-31 `wont_do`)
Superseded by the in-page federation inspector, which needs no install and no
cooperation from the page. What shipped there instead, as views under
`dev-tools/federation-inspector/src/ui/views/`:

- [x] FynApp panel (`fynapps`) and container list (`containers`)
- [x] Federation inspector — modules (`modules`) and sharing (`shares`)
- [x] Dependency graph visualization (`graph`)
- [x] Middleware viewer (`middleware`)
- [x] Diagnostics (`issues`) and raw snapshot (`raw`) — no extension equivalent
- [ ] Event monitor (FynBus stream)
- [ ] Performance tab

### 4. **Performance & Optimization** ⭐ Priority 4
- [ ] Lazy region loading (Intersection Observer)
- [x] Preload hints in manifest (`shared-providers`, `import-exposed`, `requires`)
- [x] Runtime entry-file preloading, on by default at depth 1 — see the preload gap below
- [x] Combined bundles (`federation-combine`) — folds a dist's small chunks together and
      publishes `federation.bundles.json` so a host can preload the carrier, not the member
- [x] Immutable cache headers for content-hashed chunks (`_headers`), with the
      non-hashed artifacts deliberately excluded
- [x] Perf Lab: an analytics suite in `/shell?perf=raw|combined|hints` with a live
      metrics panel. Deployed; on the live site combine + hints cut time to ready by
      72%. See [`PERF-LAB-DESIGN.md`](./PERF-LAB-DESIGN.md)
- [ ] Perf Lab follow-ups: verify dev mode, link it from the features page
- [ ] Performance event emission
- [ ] Bundle analysis tooling

#### Preload gap: automatic, but shallow

The runtime preload is automatic but small. The big win (−69% cold start in
[`SHELL_LOAD_PERF.md`](./SHELL_LOAD_PERF.md)) comes from build-time HTML hints. Those
live only in the demo (`demo/demo-server/scripts/shell-preload.mts`), with a
hand-written chunk list per app. A FynMesh user gets none of it for free.

Design: [`PRELOAD-AUTO-DESIGN.md`](./PRELOAD-AUTO-DESIGN.md). Today's runtime hints save
close to nothing: a dependency's hint lands right before its import, and siblings are
hinted one subtree at a time. The Perf Lab measured it: the suite's entries load in
strict sequence with runtime hints alone.

- [ ] **Plugin: emit `expose-chunks` in the manifest.** Each expose's static import
      closure, from the `bundle` in `generateBundle`. Lazy chunks stay out on their own,
      so no hand-written startup lists. Test over a real build.
- [ ] **Kernel: hint from the manifest.** Hint every dependency's entry at once, and the
      `expose-chunks` of `./config`, `./main` and any `import-exposed` expose. Do the same
      on the `loadFynApp(url)` path. Keep execution serial so share picks stay deterministic.
- [ ] **Kernel: preload priority.** Set `fetchpriority` from `priorityByDepth`, or delete
      the option.
- [ ] **Plugin: `preloadTags()` helper.** Build-time HTML hints from `fynapp.manifest.json`
      and `federation.bundles.json`. Move `shell-preload.mts` onto it.
- [ ] **Measure, then add the plate.** Shell cold start with no hints, runtime only, HTML
      only, and both. Record in `SHELL_LOAD_PERF.md`.

#### Combined bundles: remaining work

- [ ] **Let apps opt in from their own build.** An app can run `federation-combine` in
      its own build script, and `combine-demo` then leaves it alone. `fynapp-bundled`
      and the Perf Lab apps do this. create-fynapp scaffolds never run it, and the
      rollup plugin has no option for it.
- [ ] **Use startup groups as the preload source.** An explicit `startup` group is
      one file the host can preload. That pairs with the hint generator above.
      Today the groups are hand-listed for `fynapp-react-19` and `fynapp-analytics-charts`.
- [ ] **Revisit the default policy.** A 2 KB raw threshold groups little outside apps
      with many small exposes (`fynapp-1`, `fynapp-1-b`). `measure: "brotli"` exists but
      is not the default.

---

## Medium-Term Priorities

### 5. **Platform Middleware**
- [ ] Auth middleware (session, tokens, protected routes)
- [ ] API middleware (HTTP client, token injection)
- [ ] Global state middleware (cross-FynApp state)
- [ ] Router middleware (URL mapping, deep linking)

### 6. **Dependency Resolution**
- [x] Runtime dependency graph with topological sort (`buildGraph`, `topoBatches`)
- [x] Entry-file preloading with depth tracking (not yet chunk-level; see the preload gap)
- [x] Circular dependency detection (warning + best-effort loading)
- [x] federation.json generation (`emitFederationJson`, on by default)

### 7. **Observability & APM**
- [ ] Structured logging with correlation IDs
- [ ] Performance metrics collection
- [ ] Distributed tracing across FynApps
- [ ] Integration with DataDog, New Relic

### 8. **Security & Governance**
- [ ] CSP integration
- [ ] Module signature verification
- [ ] Multi-tenant isolation
- [ ] Enterprise SSO integration

---

## Long-Term Priorities

### 9. **CI/CD & Production**
- [ ] Automated build pipelines
- [ ] Progressive rollout / canary deployments
- [ ] Multi-environment orchestration

### 10. **Mobile & PWA**
- [ ] Mobile-optimized loading
- [ ] Service worker integration
- [ ] Offline capabilities

### 11. **Server-Side Rendering**
- [ ] SSR architecture for federated FynApps
- [ ] Client-side hydration
- [ ] SEO optimization

### 12. **Internationalization**
- [ ] Federated translation management
- [ ] Cross-FynApp locale coordination
- [ ] RTL support

### 13. **Accessibility**
- [ ] WCAG compliance framework
- [ ] Screen reader coordination
- [ ] Automated a11y testing

### 14. **Experimentation**
- [ ] A/B testing framework
- [ ] Feature flag management
- [ ] Progressive rollout

---

## Known gaps

Verified against the source on 2026-09-26. These are not roadmap items so much as
things that already exist and do not do what their presence implies — the kind that
cost the most time when discovered from a symptom.

- **No config system.** `KernelConfig` (`types.ts`, fields `baseUrl` / `debug` /
  `bootstrapTimeout`) is imported by `kernel-core.ts` and read by nothing. Anything
  configurable today is configured some other way.
- **Telemetry is off.** ~25 capture points exist, but `browser.ts`, `browser-dev.ts`
  and `node.ts` pass no `TelemetryConfig`, so nothing is collected. Pure wiring.
- **`eager` does nothing.** Accepted on the share config and emitted into the
  container, read by nothing — documented as such at `federation-js/src/types.ts`.
  It is a build-time concern the runtime cannot act on.
- **Deferred middleware never times out.** `modules/middleware-executor.ts` has no
  `setTimeout` anywhere: a provider that never arrives parks the waiting group
  indefinitely, with no error and no diagnostic.
- **One manifest read has no fallback.** `module-loader.ts` step 6 reads
  `__FYNAPP_MANIFEST__` straight off the container to register middleware from
  `import-exposed`. Absent, the block is skipped in silence and the failure surfaces
  later at a consumer. See [`BUILD-ARTIFACTS.md`](./BUILD-ARTIFACTS.md).
- **Preload priority is config that does nothing.** `PreloadStrategy.priorityByDepth`
  and `priority` are accepted, and `types.ts:559-563` says they pick `modulepreload` or
  `prefetch` with a `fetchpriority`. `browser-kernel.ts` always emits a plain
  `preload as="script"` and never reads them.
- **The JSON artifacts are unversioned.** No `schemaVersion` on any of them, and the
  packages are now published — so a shape change is someone else's breakage.

---

## Implementation Principles

- **Enterprise-First**: Prioritize large-scale enterprise needs
- **Federation-Native**: Leverage Module Federation capabilities
- **ES Modules Only**: Modern, standardized module architecture
- **Extensible Design**: Build for middleware and plugin ecosystems
- **Error-Resilient**: Graceful degradation built into every component
- **Developer Experience**: Tools and utilities for seamless adoption
