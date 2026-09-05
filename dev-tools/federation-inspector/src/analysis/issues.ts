/**
 * Derived diagnostics.
 *
 * Everything here is computed from the snapshot -- no instrumentation, no
 * cooperation from the page. That is what makes the tool useful on a
 * production build you did not prepare: the failure modes federation has are
 * structural, and structure is exactly what a snapshot preserves.
 *
 * Severity is about consequence, not certainty:
 *   error -- something is broken now (a module failed; a singleton is doubled)
 *   warn  -- something will break, or already produces wrong behaviour
 *   info  -- worth knowing, not necessarily wrong
 */

import type {
  FynAppNode,
  FynMeshNode,
  Issue,
  MiddlewareNode,
  MiddlewareUseNode,
  MiddlewareVersionNode,
  Snapshot,
} from "../core/model.js";
import type { Graph } from "./graph.js";
import { satisfies } from "./semver.js";


let counter = 0;
function nextId(code: string): string {
  return code + "-" + ++counter;
}

/**
 * Recompute every diagnostic for a snapshot.
 *
 * Idempotent, and it has to be: the live poll re-analyses the same snapshot
 * object, and `key.issues` is an accumulator written back into it. Appending
 * without clearing made a share's inline warnings multiply once per refresh --
 * the same "2 copies loaded" chip four times after two seconds.
 */
export function findIssues(snapshot: Snapshot, graph: Graph): Issue[] {
  counter = 0;
  const issues: Issue[] = [];

  for (const scope of snapshot.scopes) {
    for (const key of scope.keys) {
      key.issues = [];
    }
  }

  issues.push(...erroredModules(snapshot, graph));
  issues.push(...shareIssues(snapshot));
  issues.push(...duplicateUrls(snapshot));
  issues.push(...cycles(graph));
  issues.push(...pendingRegistrations(snapshot));
  issues.push(...unexecutedContainers(snapshot));
  issues.push(...orphans(snapshot));
  issues.push(...fynmeshIssues(snapshot));

  const rank = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // attach the share-scoped ones to their key, so the Shares view can show
  // the warning inline instead of only in the Issues list
  for (const issue of issues) {
    if (!issue.refs) {
      continue;
    }
    for (const scope of snapshot.scopes) {
      for (const key of scope.keys) {
        if (issue.refs.includes(scope.name + ":" + key.key)) {
          key.issues.push(issue);
        }
      }
    }
  }

  return issues;
}

function erroredModules(snapshot: Snapshot, graph: Graph): Issue[] {
  const issues: Issue[] = [];
  for (const m of snapshot.modules) {
    if (m.stage !== "errored" && !m.error) {
      continue;
    }
    // the blast radius: everything transitively depending on the failure
    const affected = new Set<string>();
    const queue = [m.id];
    while (queue.length) {
      for (const dep of graph.in.get(queue.pop()!) ?? []) {
        if (!affected.has(dep)) {
          affected.add(dep);
          queue.push(dep);
        }
      }
    }
    issues.push({
      id: nextId("module-errored"),
      severity: "error",
      code: "module-errored",
      title: `${short(m.id)} failed to load`,
      detail:
        (m.error?.message ?? "Module is in an errored state") +
        (affected.size
          ? `\n\n${affected.size} module${affected.size === 1 ? "" : "s"} depend${
              affected.size === 1 ? "s" : ""
            } on it and cannot run.`
          : ""),
      focus: "id:" + m.id,
      view: "modules",
      refs: [m.id, ...affected],
    });
  }
  return issues;
}

function shareIssues(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];

  for (const scope of snapshot.scopes) {
    for (const key of scope.keys) {
      const ref = scope.name + ":" + key.key;
      const loaded = key.versions.filter((v) => v.loaded || v.url);

      // The failure this whole framework exists to prevent: two live copies of
      // something declared singleton. Two Reacts, two contexts, invalid hook
      // call -- and nothing in the console says which two containers did it.
      if (key.singleton && loaded.length > 1) {
        issues.push({
          id: nextId("singleton-multiple-copies"),
          severity: "error",
          code: "singleton-multiple-copies",
          title: `${key.key} is a singleton but ${loaded.length} copies are loaded`,
          detail:
            `Scope "${scope.name}" has loaded ${loaded
              .map((v) => v.version)
              .join(" and ")}. Providers: ` +
            loaded
              .map(
                (v) =>
                  `${v.version} from ${
                    v.sources.map((s) => s.container + (s.version ? "@" + s.version : "")).join(", ") ||
                    "unknown"
                  }`
              )
              .join("; ") +
            ".\n\nA singleton with two copies means two module instances with " +
            "separate state. For a UI library this is the classic " +
            "two-copies-of-React failure.",
          focus: "share:" + key.key,
          view: "shares",
          refs: [ref, ...loaded.map((v) => v.url ?? v.version)],
        });
      } else if (!key.singleton && loaded.length > 1) {
        issues.push({
          id: nextId("share-multiple-copies"),
          severity: "info",
          code: "share-multiple-copies",
          title: `${key.key} has ${loaded.length} versions loaded side by side`,
          detail:
            `Scope "${scope.name}" carries ${loaded.map((v) => v.version).join(", ")}. ` +
            "This is legitimate for a non-singleton share, but each copy is a " +
            "separate module instance with separate state.",
          focus: "share:" + key.key,
          view: "shares",
          refs: [ref],
        });
      }

      // declared, never supplied: an import of it will go looking and fail
      for (const v of key.versions) {
        if (!v.url && !v.chunkId && v.sources.length) {
          issues.push({
            id: nextId("share-not-provided"),
            severity: "warn",
            code: "share-not-provided",
            title: `${key.key}@${v.version} is declared but no copy was provided`,
            detail:
              `${v.sources
                .map((s) => s.container + (s.version ? "@" + s.version : ""))
                .join(", ")} announced this version into scope "${scope.name}", ` +
              "but nothing supplied a module for it. An import will not resolve.",
            focus: "share:" + key.key,
            view: "shares",
            refs: [ref],
          });
        }
      }

      // a consumer whose own range excludes what it actually got
      for (const v of key.versions) {
        for (const consumer of v.consumers) {
          if (consumer.satisfied || !consumer.range) {
            continue;
          }
          issues.push({
            id: nextId("range-unsatisfied"),
            severity: "warn",
            code: "range-unsatisfied",
            title: `${consumer.container} asked for ${key.key}@${consumer.range} and got ${v.version}`,
            detail:
              `${consumer.container}${
                consumer.containerVersion ? "@" + consumer.containerVersion : ""
              } declares ${key.key} as "${consumer.range}", which ${v.version} ` +
              "does not satisfy. For a singleton this is expected -- federation " +
              "collapses the scope to one copy and warns -- but the container is " +
              "running against a version it did not ask for.",
            focus: "share:" + key.key,
            view: "shares",
            refs: [ref, consumer.container],
          });
        }
      }
    }
  }

  // a container declaration that resolved to nothing at all
  for (const c of snapshot.containers) {
    for (const v of c.versions) {
      for (const decl of v.consumes) {
        if (decl.resolved && !decl.resolved.version) {
          issues.push({
            id: nextId("share-unresolved"),
            severity: "warn",
            code: "share-unresolved",
            title: `${c.name}@${v.version} cannot resolve ${decl.key}`,
            detail:
              decl.resolved.reason ??
              `No version of "${decl.key}" satisfies ${decl.requestedRange ?? "its declaration"} ` +
                `in scope "${decl.shareScope}".`,
            focus: "container:" + c.name,
            view: "containers",
            refs: [decl.shareScope + ":" + decl.key, c.name],
          });
        }
      }
    }
  }

  return issues;
}

/**
 * The same file reachable under two ids.
 *
 * federation calls this "one file, one address" and warns about it at resolve
 * time; two ids for one url means the loader is entitled to make two records
 * and execute the file twice, which produces two instances of a module that
 * everyone believes is one.
 */
function duplicateUrls(snapshot: Snapshot): Issue[] {
  const byUrl = new Map<string, string[]>();
  for (const m of snapshot.modules) {
    if (!m.url || m.stage === "registered") {
      continue;
    }
    const list = byUrl.get(m.url);
    if (list) {
      list.push(m.id);
    } else {
      byUrl.set(m.url, [m.id]);
    }
  }

  const issues: Issue[] = [];
  for (const [url, ids] of byUrl) {
    if (ids.length < 2) {
      continue;
    }
    issues.push({
      id: nextId("duplicate-address"),
      severity: "warn",
      code: "duplicate-address",
      title: `${short(url)} is loaded under ${ids.length} ids`,
      detail:
        `Ids: ${ids.join(", ")}.\n\nOne file addressed two ways gets two load ` +
        "records and runs twice, so anything it holds -- module state, a " +
        "registry, a React context -- exists twice.",
      focus: "url:" + url,
      view: "modules",
      refs: ids,
    });
  }
  return issues;
}

function cycles(graph: Graph): Issue[] {
  return graph.cycles.map((component) => ({
    id: nextId("dependency-cycle"),
    severity: "warn" as const,
    code: "dependency-cycle",
    title: `Dependency cycle across ${component.length} module${component.length === 1 ? "" : "s"}`,
    detail:
      component.map(short).join(" -> ") +
      " -> " +
      short(component[0]) +
      "\n\nSystemJS handles cycles, but a module in one can observe a partially " +
      "initialised dependency depending on execution order.",
    focus: "id:" + component[0],
    view: "graph",
    refs: component,
  }));
}

function pendingRegistrations(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];
  for (const m of snapshot.modules) {
    if (!m.registration?.pending || m.stage !== "registered") {
      continue;
    }
    issues.push({
      id: nextId("registration-pending"),
      severity: "info",
      code: "registration-pending",
      title: `${short(m.id)} has an unconsumed registration`,
      detail:
        "A registration was handed to the loader for this id and nothing has " +
        "instantiated it. Normal for a chunk nothing has imported yet; a " +
        "symptom of a mismatched id if it was expected to load.",
      focus: "id:" + m.id,
      view: "modules",
      refs: [m.id],
    });
  }
  return issues;
}

function unexecutedContainers(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];
  for (const c of snapshot.containers) {
    for (const v of c.versions) {
      if (v.stage === "executed" || v.stage === "errored") {
        continue;
      }
      issues.push({
        id: nextId("container-not-executed"),
        severity: v.stage === "registered" ? "info" : "warn",
        code: "container-not-executed",
        title: `${c.name}@${v.version} has not finished loading (${v.stage})`,
        detail:
          v.stage === "registered"
            ? "The loader knows this container's entry but has not instantiated " +
              "it. Its exposes and shares are unavailable until it does."
            : `The container entry is at stage "${v.stage}". Anything importing ` +
              "from it is waiting.",
        focus: "container:" + c.name,
        view: "containers",
        refs: [c.name, v.entryId],
      });
    }
  }
  return issues;
}

function orphans(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];
  let count = 0;
  const ids: string[] = [];
  for (const m of snapshot.modules) {
    if (
      m.dependents.length === 0 &&
      m.deps.length === 0 &&
      m.kind !== "container-entry" &&
      m.kind !== "exposed" &&
      m.stage !== "registered"
    ) {
      count++;
      ids.push(m.id);
    }
  }
  if (count) {
    issues.push({
      id: nextId("orphan-modules"),
      severity: "info",
      code: "orphan-modules",
      title: `${count} module${count === 1 ? "" : "s"} with no dependencies and no dependents`,
      detail:
        "Loaded, but nothing in the graph connects to them: imported directly, " +
        "or left over from a load that was abandoned.\n\n" +
        ids.slice(0, 12).map(short).join("\n") +
        (ids.length > 12 ? `\n...and ${ids.length - 12} more` : ""),
      focus: "orphan:true",
      view: "modules",
      refs: ids,
    });
  }
  return issues;
}

function short(id: string): string {
  if (id.length <= 48) {
    return id;
  }
  const slash = id.lastIndexOf("/");
  return slash > 0 && id.length - slash < 44
    ? "…" + id.slice(slash)
    : id.slice(0, 24) + "…" + id.slice(-20);
}

/* ----------------------------------------------------------------- FynMesh */

/*
 * The kernel layer's diagnostics, derived from what the FynApps collection
 * already gathers -- no extra probe, and nothing here reads the page.
 *
 * These matter more than the count suggests. `core/kernel/rollup.config.ts`
 * compresses the browser kernel with terser `drop_console: true`, so every
 * warning the kernel writes about the conditions below exists only in
 * `fynmesh-browser-kernel.dev.js`. On a production page this list is the only
 * place an unsatisfied middleware range (FYM-321), a second registered version
 * (FYM-332) or two providers of one name (FYM-333) can surface at all.
 *
 * Three rules, learned the hard way and repeated here because breaking any one
 * of them is worse than not shipping the check:
 *
 * **Absent is not empty.** A check that had nothing to read says so, in
 * `fynmesh-checks-unavailable`, rather than passing quietly.
 *
 * **Do not cry wolf.** Every condition below is one the kernel itself treats as
 * wrong, or one it decides silently on the reader's behalf. Of the two checks
 * the design doc lists and FYM-325 withheld, one is here and one is still not:
 *
 * "Middleware with no consumers" stays absent, deliberately. A provider that
 * publishes a middleware nothing on this page has needed yet is not broken --
 * `fynapp-react-middleware::react-context` is in exactly that state on both demo
 * pages, and `basic-counter` is on the shell page while serving four FynApps
 * on the other. A row on every one of those teaches the reader to skip the
 * list.
 *
 * "Registered but never delivered" is here (FYM-357), narrowed to the one case
 * where non-delivery contradicts a stated intent: a version that declares an
 * `autoApplyScope` -- "apply me to every FynApp in this scope, declaration or
 * not" -- and that no FynApp on the page carries. It became checkable at all
 * only with FYM-347: `MiddlewareNode.consumers` counted declarations, so every
 * auto-applied middleware read as zero, and `fynapp-shell-mw::shell-layout` on
 * the shell page would have been reported while running in three FynApps.
 *
 * **Say what to do.** A row that only names a condition spends the reader's
 * attention without repaying it.
 */

/**
 * How long a FynApp may sit in `bootstrapping` before it is worth a row.
 *
 * Bootstrap on the demo completes inside a frame or two; ten seconds is past
 * any network fetch the loader is still waiting on and well into "this is not
 * going to finish". Measured against `snapshot.takenAt` rather than
 * `Date.now()` so a snapshot pasted into a bug report says the same thing
 * tomorrow as it did when it was taken.
 */
const STUCK_BOOTSTRAP_MS = 10_000;

function fynmeshIssues(snapshot: Snapshot): Issue[] {
  const fm = snapshot.fynmesh;
  if (!fm) {
    // No kernel on this page. Not "a healthy kernel" -- no kernel, and the
    // FynApps tab is hidden for the same reason.
    return [];
  }

  return [
    ...uncheckableFynMesh(snapshot),
    ...lifecycleIssues(snapshot),
    ...middlewareUseIssues(snapshot),
    ...registryAmbiguity(snapshot),
    ...middlewareReach(snapshot),
    ...manifestJoinIssues(snapshot),
  ];
}

/**
 * The checks that could not run, as one row rather than a silence.
 *
 * "No issues found" and "could not look" are different claims, and a list that
 * renders them identically is the defect this codebase keeps re-finding. One
 * row, listing what was skipped and why, so a quiet list can be trusted for
 * exactly what it covered.
 */
function uncheckableFynMesh(snapshot: Snapshot): Issue[] {
  const cap = snapshot.capability;
  const skipped: string[] = [];

  if (!cap.kernelLifecycle) {
    skipped.push(
      "bootstrap failures and stalled bootstraps — kernel.listFynAppStates() " +
        "could not be read, so no FynApp on this page has a status to test"
    );
  }
  if (!cap.kernelRunTime) {
    skipped.push(
      "middleware declarations, the bare-name registry key, and whether an " +
        "auto-applying middleware reached anything — kernel.runTime.apps could " +
        "not be read, so the FynApp rows carry no declarations to check and no " +
        "FynApp on this page carries a delivery record"
    );
  }
  if (!cap.kernelMiddleware) {
    skipped.push(
      "the middleware registry — duplicate versions, competing providers and " +
        "unsatisfied ranges all need kernel.runTime.middlewares, which could " +
        "not be read"
    );
  }
  if (!cap.manifest) {
    skipped.push(
      "the manifest joins — declared share providers and import-exposed " +
        "targets need __FYNAPP_MANIFEST__, and no container on this page carries one"
    );
  }
  // the reach check reports its own gaps: a middleware it declined to judge is
  // a missing row, and a missing row explains itself here or not at all
  skipped.push(...autoApplyReach(snapshot).skipped);

  if (!skipped.length) {
    return [];
  }

  return [
    {
      id: nextId("fynmesh-checks-unavailable"),
      severity: "info",
      code: "fynmesh-checks-unavailable",
      title: `${skipped.length} FynMesh check${
        skipped.length === 1 ? "" : "s"
      } could not run on this page`,
      detail:
        "These did not pass — they had nothing to read:\n\n" +
        skipped.map((s) => "• " + s).join("\n\n") +
        "\n\nEverything else in this list was checked normally. A silent " +
        "Issues list is only as strong as what it was able to look at.",
      view: "fynapps",
    },
  ];
}

/* ------------------------------------------------------------- lifecycle */

function lifecycleIssues(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];
  const fm = snapshot.fynmesh!;

  for (const app of fm.apps) {
    if (app.status === "failed") {
      issues.push({
        id: nextId("fynapp-bootstrap-failed"),
        severity: "error",
        code: "fynapp-bootstrap-failed",
        title: `${app.key} failed to bootstrap`,
        detail:
          (app.error?.message ??
            "The kernel recorded the failure but retained no error object.") +
          "\n\nIts FynUnits never ran: nothing this FynApp exposes is mounted. " +
          "The kernel isolates a failed FynApp instead of taking the page down, " +
          "so the rest of the page looks healthy and nothing else says this " +
          "happened." +
          (app.providesMiddleware.length
            ? `\n\nIt hosts ${app.providesMiddleware.join(
                ", "
              )} — check whether that registered before it failed, because any ` +
              "consumer that did not get it is stalled too."
            : "") +
          "\n\nThe error is retained only while the status is `failed`; a reload " +
          "loses it, so capture this snapshot before reloading.",
        focus: "app:" + app.name,
        view: "fynapps",
        refs: [app.key, app.name],
      });
      continue;
    }

    if (app.status !== "bootstrapping" || app.updatedAt === undefined) {
      continue;
    }
    const age = snapshot.takenAt - app.updatedAt;
    if (age <= STUCK_BOOTSTRAP_MS) {
      continue;
    }
    const missing = app.usesMiddleware.filter((u) => !u.registered);
    issues.push({
      id: nextId("fynapp-bootstrap-stalled"),
      severity: "warn",
      code: "fynapp-bootstrap-stalled",
      title: `${app.key} has been bootstrapping for ${Math.round(age / 1000)}s`,
      detail:
        "Its last lifecycle change was " +
        `${Math.round(age / 1000)}s before this snapshot was taken, and it has ` +
        "not reached `mounted`. A bootstrap that does not finish is almost " +
        "always waiting on middleware: a `setup()` that returned a promise " +
        "nothing resolves, or a provider FynApp that has not registered yet." +
        (missing.length
          ? `\n\nThis FynApp declares ${missing
              .map(useLabel)
              .join(", ")} and nothing is registered under ` +
            (missing.length === 1 ? "that name" : "those names") +
            " — start there."
          : "\n\nEvery middleware it declares is registered, so look at the " +
            "provider's `setup()` and at anything it awaits.") +
        "\n\nIf the app is visibly on screen and working, the lifecycle row is " +
        "stale rather than stalled — which is itself worth a kernel bug.",
      focus: "app:" + app.name,
      view: "fynapps",
      refs: [app.key, app.name],
    });
  }

  return issues;
}

/* ------------------------------------------------- middleware, per consumer */

function useLabel(use: MiddlewareUseNode): string {
  if (!use.name) {
    return use.raw ?? "an unreadable declaration";
  }
  return (use.provider ? use.provider + "::" : "") + use.name;
}

/**
 * What each FynApp asked for, against what the registry can give it.
 *
 * Every row here is a condition the kernel notices and then says nothing about
 * on a production page.
 */
function middlewareUseIssues(snapshot: Snapshot): Issue[] {
  const fm = snapshot.fynmesh!;
  const issues: Issue[] = [];
  const byRegKey = new Map<string, MiddlewareNode>(
    fm.middlewares.map((m) => [m.regKey, m])
  );

  for (const app of fm.apps) {
    for (const use of app.usesMiddleware) {
      if (!use.name) {
        issues.push(unreadableDeclaration(app, use));
        continue;
      }

      if (!use.registered) {
        issues.push({
          id: nextId("middleware-not-registered"),
          severity: "error",
          code: "middleware-not-registered",
          title: `${app.key} declares ${useLabel(use)} and nothing registers it`,
          detail:
            `Nothing in kernel.runTime.middlewares is named "${use.name}"` +
            (use.provider
              ? `, from ${use.provider} or from any other provider.`
              : ".") +
            "\n\nThe kernel hands back a dummy registration, so this FynApp's " +
            "`execute()` never runs — the unit is loaded and inert, which looks " +
            "on screen exactly like a component that renders nothing." +
            (use.provider
              ? `\n\nCheck that ${use.provider} is loaded as a FynApp on this page ` +
                "(the FynApps tab lists it, or does not), and that it exposes an " +
                "export named `__middleware__*` from a `./middleware*` or `./main` " +
                "expose — provision is by that naming convention, not by a call."
              : "\n\nThis declaration names no provider, so the kernel scanned " +
                "every registered middleware for the name and found none. Naming " +
                "the provider would at least make the intended source explicit.") +
            "\n\nThe kernel's own console.error for this is compiled out of the " +
            "production build.",
          focus: "app:" + app.name,
          view: "fynapps",
          refs: [app.key, app.name, use.provider ?? ""].filter(Boolean),
        });
        continue;
      }

      const ranged = rangeIssue(app, use, byRegKey);
      if (ranged) {
        issues.push(ranged);
      }
    }
  }

  return issues;
}

function unreadableDeclaration(app: FynAppNode, use: MiddlewareUseNode): Issue {
  const isString = use.form === "string" || use.form === "mw";
  return {
    id: nextId("middleware-declaration-unreadable"),
    severity: "error",
    code: "middleware-declaration-unreadable",
    title: `${app.key} has a middleware declaration the kernel cannot read`,
    detail:
      (isString
        ? `The declaration is the string form and does not parse: ${JSON.stringify(
            use.raw ?? ""
          )}. It has to be ` +
          '"-FYNAPP_MIDDLEWARE <package> <expose path> <semver>" — the tag, ' +
          "then two or three space-separated fields.\n\nA string the kernel " +
          "cannot parse is skipped in silence and the unit's `execute()` never runs."
        : "The `__middlewareMeta` entry is neither a string, a `{ mw, config }` " +
          "nor the `{ info, config }` object `useMiddleware()` produces.\n\nThe " +
          "middleware executor throws `unusableMiddlewareMeta` on this shape, " +
          "which fails the whole FynApp rather than just this declaration.") +
      "\n\nFix the `useMiddleware()` call in the FynUnit — this is a build-time " +
      "mistake in the consumer, not a runtime condition of the page.",
    focus: "app:" + app.name,
    view: "fynapps",
    refs: [app.key, app.name],
  };
}

/**
 * A declared range that resolved to the `default` slot anyway (FYM-321).
 *
 * The firing decision is not made here. `resolveVersion` in the FynMesh
 * collector is a line-for-line mirror of `MiddlewareManager.resolveFromVersionMap`,
 * and `resolvedVia === "fallback"` is its fourth branch: a range was asked for,
 * nothing satisfied it, and the lookup fell back. Re-deriving that with this
 * module's own `satisfies` would put a second opinion on screen, and the
 * Middleware view renders the collector's -- two views disagreeing about one
 * middleware is exactly the defect FYM-341 was.
 *
 * `satisfies` is still used, but only to choose the wording: a range the kernel
 * cannot parse at all reads differently from one it parsed and could not match.
 */
function rangeIssue(
  app: FynAppNode,
  use: MiddlewareUseNode,
  byRegKey: Map<string, MiddlewareNode>
): Issue | undefined {
  if (use.resolvedVia !== "fallback") {
    return undefined;
  }
  const range = use.range?.trim() ?? "";
  const got = use.resolvedVersion;
  const mw = use.resolvedRegKey ? byRegKey.get(use.resolvedRegKey) : undefined;
  const registered = mw?.versions.map((v) => v.version) ?? [];

  // the kernel's `isSupportedRange`, as far as it is knowable from here: it has
  // no hyphen ranges, and it probes the range against a parsed version the same
  // way. Where the two matchers could still disagree, the kernel is the one
  // that ran, and `resolvedVia` above already recorded what it did.
  const readable = !/\s-\s/.test(range) && satisfies("0.0.0", range) !== undefined;

  return {
    id: nextId("middleware-range-unsatisfied"),
    severity: "warn",
    code: "middleware-range-unsatisfied",
    title: readable
      ? `${app.key} asked for ${useLabel(use)}@${range} and got ${got ?? "the default"}`
      : `${app.key} declares ${useLabel(use)}@${range}, which is not a range the kernel can read`,
    detail:
      (readable
        ? `Registered: ${registered.join(", ") || "nothing readable"}. None satisfies ` +
          `"${range}", so the lookup falls back to the registry's \`default\` slot.`
        : `"${range}" is not a version range the kernel's matcher understands ` +
          `(registered: ${registered.join(", ") || "nothing readable"}), so it does ` +
          "not even try: the lookup falls back to the registry's `default` slot.") +
      `\n\n${app.key} is running ${got ?? "the first-registered version"} of ` +
      "this middleware, which is not the version it asked for. Whether that " +
      "breaks anything depends entirely on what changed between the two." +
      "\n\nEither load a provider version that satisfies the range, or correct " +
      "the range on the declaration. The kernel warns about this at lookup time, " +
      "but that warning is compiled out of the production build." +
      "\n\nThe Middleware tab shows the same resolution from the registry's side.",
    focus: use.name ? "mw:" + use.name : "app:" + app.name,
    view: "middleware",
    refs: [app.key, app.name, use.resolvedRegKey ?? ""].filter(Boolean),
  };
}

/* ------------------------------------------------ registry-level ambiguity */

function registryAmbiguity(snapshot: Snapshot): Issue[] {
  const fm = snapshot.fynmesh!;
  const issues: Issue[] = [];

  issues.push(...duplicateMiddlewareVersions(fm));
  issues.push(...competingProviders(fm));
  if (snapshot.capability.kernelRunTime) {
    issues.push(...ambiguousAppName(fm));
  }

  return issues;
}

/**
 * The consumers that asked for no version, and so resolved through `default`.
 *
 * Read off the collector's own per-version accounting rather than re-walked
 * from the FynApp declarations, so this row and the Middleware view are looking
 * at one list. `unpinnedConsumers` is included because a consumer that resolved
 * to the middleware but to none of its version rows is still a consumer of it.
 *
 * Declared consumers only. Since FYM-347 those lists also hold consumers that
 * declared nothing at all, and this row is about declarations that name no
 * version -- an auto-applied FynApp has no declaration to add a range to, so
 * counting it here would name an app the advice below cannot be acted on for.
 */
function versionlessConsumers(mw: MiddlewareNode): string[] {
  return [...mw.versions.flatMap((v) => v.consumers), ...mw.unpinnedConsumers]
    .filter((c) => c.route === "declared" && c.via === "default")
    .map((c) => c.app);
}

function duplicateMiddlewareVersions(fm: FynMeshNode): Issue[] {
  const issues: Issue[] = [];

  for (const mw of fm.middlewares) {
    if (mw.versions.length < 2) {
      continue;
    }
    const first = mw.defaultVersion;
    const affected = versionlessConsumers(mw);
    const hosts = mw.versions
      .map((v) => `${v.version} from ${v.hostApp}`)
      .join(", ");

    issues.push({
      id: nextId("middleware-multiple-versions"),
      severity: affected.length ? "warn" : "info",
      code: "middleware-multiple-versions",
      title: `${mw.regKey} has ${mw.versions.length} versions registered`,
      detail:
        `Registered: ${hosts}.\n\nA lookup that names no version resolves to ` +
        `the first version that registered${first ? ` (${first})` : ""} and keeps ` +
        "resolving there — the kernel sets the `default` slot once and never " +
        "re-points it, deliberately, so that two consumers asking for nothing " +
        "cannot get different middleware depending on when they mounted. The rule " +
        "is documented; the ambiguity is what this row is about." +
        (affected.length
          ? `\n\n${affected.join(", ")} ${
              affected.length === 1 ? "asks" : "ask"
            } for no version, so ${
              affected.length === 1 ? "it runs" : "they all run"
            } ${first ?? "the first-registered version"} whether or not that is ` +
            "the one they were built against. Declare a version range on those " +
            "declarations to choose deliberately."
          : "\n\nEvery consumer on this page declares a range, so nothing is " +
            "resolving through `default` today. A new consumer that declares " +
            `none would get ${first ?? "the first-registered version"}.`) +
        "\n\nThe kernel warns once, at registration, in the dev build only.",
      focus: "mw:" + mw.name,
      view: "middleware",
      refs: [mw.regKey, ...mw.versions.map((v) => v.hostApp)],
    });
  }

  return issues;
}

/**
 * One middleware name, two providers (FYM-333).
 *
 * The collision set comes from the collector's `nameCollisions`, so this row and
 * the Middleware view agree by construction rather than by two matching walks.
 * One issue per name, not per provider: emitted against the lowest regKey in the
 * set, because there is no "the wrong one" -- the collision is a property of the
 * name.
 *
 * It only bites a declaration that did not pin a provider. That is the path
 * where the kernel scans the registry and takes the first match, and
 * `pinnedProvider` on each consumer is the collector's record of which path it
 * took -- not a guess made here. A consumer that declared nothing (FYM-347)
 * never went near that path, so it is skipped rather than counted as one more
 * app resolving by name.
 */
function competingProviders(fm: FynMeshNode): Issue[] {
  const byRegKey = new Map(fm.middlewares.map((m) => [m.regKey, m]));
  const issues: Issue[] = [];

  for (const mw of fm.middlewares) {
    if (!mw.nameCollisions.length) {
      continue;
    }
    // one row per name: the lowest regKey in the set speaks for all of them
    if (mw.nameCollisions.some((k) => k < mw.regKey)) {
      continue;
    }
    const group = [mw, ...mw.nameCollisions.map((k) => byRegKey.get(k))].filter(
      (m): m is MiddlewareNode => !!m
    );

    const unpinned: string[] = [];
    for (const node of group) {
      for (const c of [
        ...node.versions.flatMap((v) => v.consumers),
        ...node.unpinnedConsumers,
      ]) {
        if (c.route === "declared" && !c.pinnedProvider) {
          unpinned.push(`${c.app} did not pin a provider and resolved to ${node.regKey}`);
        }
      }
    }

    issues.push({
      id: nextId("middleware-provider-ambiguous"),
      severity: unpinned.length ? "warn" : "info",
      code: "middleware-provider-ambiguous",
      title: `"${mw.name}" is registered by ${group.length} providers`,
      detail:
        `Registered under ${group.map((p) => p.regKey).join(" and ")}.` +
        "\n\nA declaration that names its provider is unaffected — the kernel " +
        "looks the exact `provider::name` key up first. One that does not makes " +
        "the kernel scan the registry and take the first match, which is " +
        "registration order: the choice gets made for the consumer, by load order." +
        (unpinned.length
          ? "\n\n" +
            unpinned.join("\n") +
            "\n\nName the provider on those declarations to pin which one runs."
          : "\n\nEvery declaration on this page names its provider, so nothing " +
            "is resolving by scan today. This is a trap set for the next " +
            "consumer that leaves the provider off.") +
        "\n\nThe kernel reports this, in the dev build only.",
      focus: "mw:" + mw.name,
      view: "middleware",
      refs: group.map((p) => p.regKey),
    });
  }

  return issues;
}

/**
 * Two versions of one FynApp name, and a bare registry key that points at one.
 *
 * The opposite rule to the middleware registry's, which is exactly why it is
 * worth spelling out: `FynAppRegistry.add` writes `apps[name] = fynApp`
 * unconditionally, so the bare key is re-pointed by every registration and ends
 * up on whichever instance registered LAST — while a middleware's `default`
 * slot keeps the first. Two adjacent registries, two opposite tie-breaks.
 */
function ambiguousAppName(fm: FynMeshNode): Issue[] {
  const byName = new Map<string, FynAppNode[]>();
  for (const app of fm.apps) {
    const list = byName.get(app.name);
    if (list) {
      list.push(app);
    } else {
      byName.set(app.name, [app]);
    }
  }

  const issues: Issue[] = [];
  for (const [name, apps] of byName) {
    if (apps.length < 2) {
      continue;
    }
    const winner = apps.find((a) => a.isDefaultForName);

    issues.push({
      id: nextId("fynapp-name-ambiguous"),
      severity: "info",
      code: "fynapp-name-ambiguous",
      title: `${apps.length} versions of ${name} are registered under one name`,
      detail:
        `Live: ${apps.map((a) => a.version).join(", ")}.\n\n` +
        "The kernel files every FynApp under both `name@version` and the bare " +
        "`name`, and the bare key is overwritten on each registration — so a " +
        "lookup by name alone (`loadFynAppsByName`, a middleware declaration " +
        "naming a provider with no version) gets " +
        (winner
          ? `${winner.version}, the one that registered last.`
          : "whichever registered last, which this snapshot cannot identify " +
            "because no instance holds the bare key.") +
        "\n\nNote this is the opposite of the middleware registry, where the " +
        "`default` slot keeps the FIRST version registered. Two registries, two " +
        "tie-breaks; do not carry an assumption from one to the other." +
        "\n\nRunning two versions side by side is supported and often deliberate. " +
        "Qualify by-name lookups with a version where the distinction matters.",
      focus: "app:" + name,
      view: "fynapps",
      refs: apps.map((a) => a.key),
    });
  }

  return issues;
}

/* ------------------------------------------------ auto-apply that reached nobody */

/**
 * The auto-applying versions of a middleware: the ones that asked to be
 * delivered without being declared.
 *
 * The same predicate `collectors/fynmesh.ts` uses to decide which version an
 * undeclared consumer is filed under, so the check below and the consumer lists
 * it reads cannot be looking at two different sets of versions.
 */
function autoApplyingVersions(mw: MiddlewareNode): MiddlewareVersionNode[] {
  return mw.versions.filter((v) => v.autoApplyScope?.length);
}

/**
 * The two buckets the kernel sorts FynApps into when it auto-applies.
 *
 * `middlewareManager.register` files an auto-applying middleware into a
 * `fynapp` list, an `mw` list, or both, and at execute time
 * `getTargetMiddlewares` hands a FynApp exactly one of those lists --
 * `isFynAppMiddlewareProvider(fynApp) ? autoApply.mw : autoApply.fynapp`. So
 * "in scope" is not a preference, it is which of two lists a FynApp can ever be
 * offered, and a middleware scoped to a bucket that is empty on this page
 * reached nobody by arithmetic rather than by failing.
 */
type AutoApplyBucket = "fynapp" | "middleware";

/**
 * The kernel's own test for the `mw` bucket, over the same value.
 *
 * `isFynAppMiddlewareProvider` reads `Object.keys(fynApp.exposes)`, and
 * `importedExposes` is exactly that array -- not `declaredExposes`, which is
 * what the build published and which the kernel never consults here.
 */
const MIDDLEWARE_EXPOSE_PREFIX = "./middleware";

function bucketOf(app: FynAppNode): AutoApplyBucket {
  return app.importedExposes.some((name) => name.startsWith(MIDDLEWARE_EXPOSE_PREFIX))
    ? "middleware"
    : "fynapp";
}

/**
 * The buckets this middleware would be offered to.
 *
 * `MiddlewareNode.autoApply` is the kernel's own answer and is preferred over
 * any reading of the scope strings: the collector takes it from
 * `runTime.autoApply.fynapp` / `.mw`, which is the very pair of lists
 * `getTargetMiddlewares` chooses between. It is absent on a kernel with neither
 * that field nor `mwMgr.getAutoApply()`, and only then is the registration rule
 * re-applied here to the declared scopes.
 *
 * That rule: `all` selects both, `fynapp` and `middleware` select one, and
 * anything else selects neither. The last is not a lenient reading but the
 * literal one -- registration tests `includes("all") || includes("fynapp")` and
 * then `includes("all") || includes("middleware")`, so a misspelt scope is filed
 * into no list and auto-applied to nothing. Both paths therefore agree that an
 * empty result is a true statement about the page.
 */
function targetBuckets(
  mw: MiddlewareNode,
  versions: MiddlewareVersionNode[]
): Set<AutoApplyBucket> {
  const buckets = new Set<AutoApplyBucket>();
  if (mw.autoApply) {
    for (const bucket of mw.autoApply) {
      buckets.add(bucket === "mw" ? "middleware" : "fynapp");
    }
    return buckets;
  }
  for (const scope of versions.flatMap((v) => v.autoApplyScope ?? [])) {
    if (scope === "all" || scope === "fynapp") {
      buckets.add("fynapp");
    }
    if (scope === "all" || scope === "middleware") {
      buckets.add("middleware");
    }
  }
  return buckets;
}

/**
 * The FynApps this page is still coming up on, by `lifecycleIssues`' own clock.
 *
 * Deliberately the exact complement of the `fynapp-bootstrap-stalled` predicate
 * below `STUCK_BOOTSTRAP_MS`, and that symmetry is the whole design: "still
 * loading" and "stuck" are the two readings of one status, this file already
 * draws the line between them in one place, and a second, differently-placed
 * line would mean a FynApp that is simultaneously stalled enough to report and
 * fresh enough to withhold a check.
 *
 * The line matters most in the direction nobody looks: a page where something
 * never finishes bootstrapping would otherwise withhold the reach check for as
 * long as the tab stays open, which is permanent blindness dressed as patience.
 * Past the threshold the FynApp gets its own row and stops being a reason to
 * wait.
 *
 * A `bootstrapping` row with no `updatedAt` counts as still loading. There is
 * nothing to age it against, `lifecycleIssues` will not call it stalled either,
 * and this file has no basis for calling the page settled -- but the caller
 * says so out loud rather than going quiet, so an indefinite wait is at least a
 * visible one.
 */
function stillBootstrapping(snapshot: Snapshot, apps: FynAppNode[]): FynAppNode[] {
  return apps.filter((app) => {
    if (app.status !== "bootstrapping") {
      return false;
    }
    if (app.updatedAt === undefined) {
      return true;
    }
    return snapshot.takenAt - app.updatedAt <= STUCK_BOOTSTRAP_MS;
  });
}

function bootstrappingFor(snapshot: Snapshot, app: FynAppNode): string {
  if (app.updatedAt === undefined) {
    return `${app.key} is still bootstrapping and the kernel kept no timestamp to age that against`;
  }
  const seconds = (snapshot.takenAt - app.updatedAt) / 1000;
  return `${app.key} has been bootstrapping for ${seconds.toFixed(1)}s`;
}

/**
 * Which auto-applying middlewares reached nothing, and which cannot be judged.
 *
 * One walk behind two rows. `unreached` becomes the diagnostic; `skipped`
 * becomes lines in `fynmesh-checks-unavailable`, because a check that quietly
 * declines is indistinguishable from one that passed -- and here the decline is
 * the interesting half: it means the consumers may exist and be unattributable
 * rather than absent.
 *
 * The third decline is time (FYM-360). Every auto-applying middleware passes
 * through "registered and delivered to nobody" on its way up, because the
 * kernel registers it while its host FynApp bootstraps and applies it during
 * each FynApp's bootstrap afterwards. Injected at document-start on the shell
 * demo -- the position `standalone.ts` recommends and the one an extension
 * panel has -- `fynapp-shell-mw::shell-layout` registers ~29ms into the load
 * with its own host `bootstrapping` (9ms old) and holding the bootstrap lock,
 * and the check reports it; 3ms later, at the next macrotask, the row is gone.
 * The demo pages load the bundle last and so cannot reach that instant at all,
 * which is why FYM-357 shipped without this guard and why it is here now.
 */
interface ReachVerdict {
  /** auto-applies, has FynApps it could have reached, and reached none of them */
  unreached: Array<{ mw: MiddlewareNode; inScope: number; registered: number }>;
  /** ones this would have reported, and why it did not */
  skipped: string[];
}

function autoApplyReach(snapshot: Snapshot): ReachVerdict {
  const verdict: ReachVerdict = { unreached: [], skipped: [] };
  const fm = snapshot.fynmesh;
  if (!fm || !snapshot.capability.kernelRunTime) {
    // With no readable `runTime.apps` every middleware has zero consumers and
    // every auto-applying one would be reported. The capability row above
    // already names that surface; this adds nothing to it.
    return verdict;
  }

  const candidates = fm.middlewares.filter(
    (mw) => autoApplyingVersions(mw).length > 0 && !mw.consumers.length
  );
  if (!candidates.length) {
    return verdict;
  }

  // Registry rows only. `fynmesh.apps` is the registry unioned with the
  // lifecycle table, and a row known only from the lifecycle table is a
  // shutdown app: it carries no exposes and no `middlewareDelivered`, and an
  // empty list there means unreadable rather than empty. Counting those as
  // FynApps a middleware failed to reach would report a middleware for not
  // reaching apps that are gone.
  const registered = fm.apps.filter((app) => app.inRegistry);
  if (!registered.length) {
    // `runTime.apps` readable and empty, which `cap.kernelRunTime` cannot
    // distinguish from a page mid-load. Nothing was in scope, so nothing was
    // missed.
    verdict.skipped.push(
      `whether ${candidates.length} auto-applying middleware${
        candidates.length === 1 ? "" : "s"
      } reached anything — ${candidates.map((mw) => mw.regKey).join(", ")} ${
        candidates.length === 1 ? "auto-applies" : "auto-apply"
      }, but kernel.runTime.apps is readable and holds no FynApp, so there was ` +
        "nothing on this page to reach"
    );
    return verdict;
  }

  // FYM-360: the page has not finished loading, and on a page that is loading
  // this check is guaranteed to be true of a healthy middleware for a moment.
  const loading = stillBootstrapping(snapshot, registered);
  if (loading.length) {
    verdict.skipped.push(
      `whether ${candidates.map((mw) => mw.regKey).join(", ")} reached ` +
        `anything — ${candidates.length === 1 ? "it auto-applies" : "they auto-apply"} and no ` +
        `FynApp on this page carries ${candidates.length === 1 ? "it" : "them"} yet, but ` +
        `${loading.map((app) => bootstrappingFor(snapshot, app)).join(", ")}. The kernel ` +
        "auto-applies a middleware to a FynApp as part of that FynApp's bootstrap, so a " +
        "FynApp that has not finished bootstrapping has not been offered it yet and a " +
        `middleware that has just registered has reached nobody every time. ` +
        "That is a not-yet-final answer rather than a finding — take another snapshot once " +
        `the page has settled. A FynApp still bootstrapping ${
          STUCK_BOOTSTRAP_MS / 1000
        }s after its last lifecycle change is reported as stalled instead, and stops ` +
        "withholding this check: one wedged FynApp is not a reason to stop looking at the " +
        "rest of the page for as long as it stays open"
    );
    return verdict;
  }

  for (const mw of candidates) {
    if (mw.nameCollisions.length) {
      // FYM-333: the collector attributes an undeclared delivery by matching a
      // `middlewareContext` key against the registry, and a name two providers
      // register matches both. Rather than guess a provider it files nothing,
      // so this middleware's consumer list is short by construction and a
      // no-consumers reading of it would be a guess dressed as a finding.
      verdict.skipped.push(
        `whether ${mw.regKey} reached anything — it auto-applies and no FynApp ` +
          `on this page carries it, but "${mw.name}" is also registered by ` +
          `${mw.nameCollisions.join(" and ")}, and a delivery recorded under a ` +
          "name two providers share cannot be attributed to either of them. Its " +
          "consumers may be unattributable rather than absent, so it is not " +
          "reported as unreached. Name the provider on the colliding " +
          "registrations to make this checkable"
      );
      continue;
    }

    const buckets = targetBuckets(mw, autoApplyingVersions(mw));
    const inScope = registered.filter((app) => buckets.has(bucketOf(app))).length;
    if (!inScope) {
      // The scope is the middleware's own statement of who it is for, and this
      // page has nobody in it. Reaching nobody is then the correct outcome, not
      // a finding -- but it is still the answer to a question the reader asked,
      // so it is said rather than swallowed.
      const scopes = [...new Set(autoApplyingVersions(mw).flatMap((v) => v.autoApplyScope ?? []))];
      verdict.skipped.push(
        `whether ${mw.regKey} reached anything — its autoApplyScope is ` +
          `${scopes.join(", ")}, and none of the ${registered.length} FynApp${
            registered.length === 1 ? "" : "s"
          } the kernel has registered is in that scope, so reaching none of them ` +
          "is the correct outcome rather than a finding"
      );
      continue;
    }

    verdict.unreached.push({ mw, inScope, registered: registered.length });
  }

  return verdict;
}

/**
 * A middleware that asked to be applied to everything, and that nothing shows.
 *
 * Deliberately not "a middleware with no consumers", which is the check the
 * design doc names and which stays unwritten: a provider publishing something
 * nothing on this page has needed yet is a normal page, not a broken one. What
 * makes this narrower condition worth a row is `autoApplyScope`. It is a stated
 * intent -- the kernel applies such a middleware to every FynApp in the scope as
 * it loads, declaration or not -- and a stated intent that nothing on the page
 * reflects is worth the reader's attention in a way that an unused registration
 * is not.
 *
 * The scope is taken literally, not as a slogan: a middleware scoped to a
 * bucket no FynApp on this page is in reached nobody by arithmetic, and is
 * declined above rather than reported. What is left is a middleware with FynApps
 * it could have been applied to and no trace on any of them.
 *
 * `info`, not `warn`, and the distinction is the whole design of this row.
 * `warn` here would claim wrong behaviour, and the evidence does not support
 * that: the kernel writes nothing into `middlewareContext` itself, so delivery
 * is only ever observable when the middleware chooses to leave a trace. A
 * middleware whose entire effect is an execution override or a DOM side effect
 * applies perfectly and looks exactly like one that never ran, and a
 * `shouldApply` that filtered every FynApp out is a supported, deliberate
 * outcome that looks like both. The row says which of those it cannot tell
 * apart, and what to look at to tell them apart, rather than picking one.
 */
function middlewareReach(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];

  for (const { mw, inScope, registered } of autoApplyReach(snapshot).unreached) {
    const auto = autoApplyingVersions(mw);
    const scopes = [...new Set(auto.flatMap((v) => v.autoApplyScope ?? []))];
    const hooks = [...new Set(auto.flatMap((v) => v.overrideHooks))];

    issues.push({
      id: nextId("middleware-auto-apply-undelivered"),
      severity: "info",
      code: "middleware-auto-apply-undelivered",
      title: `${mw.regKey} auto-applies, and no FynApp on this page carries it`,
      detail:
        `Its autoApplyScope is ${scopes.join(", ")}, which asks the kernel to ` +
        "apply it to every FynApp in that scope as each one loads — no " +
        `declaration needed, and none exists. ${inScope} of the ${registered} ` +
        `FynApp${registered === 1 ? "" : "s"} the kernel has registered ${
          inScope === 1 ? "is" : "are"
        } in that scope, and ${
          inScope === 1
            ? "it neither declares this middleware nor carries"
            : "none of them declares this middleware or carries"
        } an entry under "${mw.name}" in its middlewareContext.` +
        "\n\nThat is not proof it never ran, and this row is deliberately not " +
        "claiming it did not. The kernel calls `setup` and `apply`; what lands " +
        "in a FynApp's `middlewareContext` is written by the middleware itself. " +
        "So a middleware whose whole effect is a side effect — an execution " +
        "override, a stylesheet, a global — applies correctly and leaves exactly " +
        "this trace, and so does a `shouldApply` that returned false for every " +
        "FynApp on the page, which is a deliberate outcome rather than a failure." +
        (hooks.length
          ? `\n\nIt implements ${hooks.join(", ")}, so at least part of what it ` +
            "does needs no context entry — which is the likeliest reading of " +
            "this row."
          : "") +
        "\n\nWhat to check, in the order that settles it fastest: whether its " +
        `\`shouldApply\` excludes ${
          inScope === 1 ? "that FynApp" : "all " + inScope + " of them"
        }, which is the one filter a snapshot cannot see; and whether its ` +
        "`setup` or `apply` writes into `context.fynApp.middlewareContext` at " +
        "all. If it hands something to the FynApps it applies to, it is handing " +
        "it to none of them and every FynApp here is running without it. If it " +
        "only has side effects, nothing is wrong and this is what that looks " +
        "like from a snapshot." +
        "\n\nThe kernel logs each auto-apply as it happens, in the dev build " +
        "only; nothing records afterwards which FynApps it reached.",
      focus: "mw:" + mw.name,
      view: "middleware",
      refs: [...new Set([mw.regKey, ...auto.map((v) => v.hostApp)])],
    });
  }

  return issues;
}

/* ---------------------------------------------------------- manifest joins */

/**
 * What the build declared about other FynApps, against what is on the page.
 *
 * The manifest is the only record of intent anywhere in the system: which
 * FynApp was supposed to provide a share, and which one an `import-exposed`
 * target was meant to come from. Nothing at runtime checks either.
 *
 * The distinction that keeps these honest -- and the reason FYM-341 happened --
 * is between "not a FynApp" and "not on this page". A container that carries a
 * manifest but was never loaded through `loadFynApp` is still a perfectly good
 * federated library and still provides its shares; saying it is missing would
 * contradict the Containers view on screen. Only a name with neither a FynApp
 * nor a container behind it is actually absent.
 */
function manifestJoinIssues(snapshot: Snapshot): Issue[] {
  const fm = snapshot.fynmesh!;
  const issues: Issue[] = [];
  const appNames = new Set(fm.apps.map((a) => a.name));
  const containerNames = new Set(snapshot.containers.map((c) => c.name));

  for (const container of snapshot.containers) {
    for (const version of container.versions) {
      const manifest = version.manifest;
      if (!manifest) {
        continue;
      }
      const from = `${container.name}@${version.version}`;

      const providers = manifest["shared-providers"];
      if (providers && typeof providers === "object") {
        for (const [provider, decl] of Object.entries(providers)) {
          if (appNames.has(provider) || containerNames.has(provider)) {
            continue;
          }
          const keys = Array.isArray(decl?.provides) ? decl.provides : [];
          issues.push({
            id: nextId("fynmesh-provider-absent"),
            severity: "warn",
            code: "fynmesh-provider-absent",
            title: `${from} expects ${provider} to provide ${
              keys.length ? keys.join(", ") : "its shares"
            }, and it is not on this page`,
            detail:
              `${from} was built against ${provider}${
                decl?.semver ? "@" + decl.semver : ""
              }, and nothing of that name is loaded — neither a FynApp nor a ` +
              "federation container." +
              (keys.length
                ? `\n\nWhatever ${from} is running for ${keys.join(
                    " and "
                  )} came from somewhere else, or from nowhere: check the Shares ` +
                  "tab for which container actually supplied " +
                  (keys.length === 1 ? "that key" : "those keys") + "."
                : "") +
              "\n\nThis is a build-time expectation with no runtime check behind " +
              "it — nothing in the kernel or in federation verifies it, which is " +
              "why it can be wrong and silent at the same time.",
            focus: "container:" + container.name,
            view: "containers",
            refs: [container.name, provider],
          });
        }
      }

      const imports = manifest["import-exposed"];
      if (imports && typeof imports === "object") {
        for (const [target, entries] of Object.entries(imports)) {
          if (appNames.has(target) || containerNames.has(target)) {
            continue;
          }
          const names = entries && typeof entries === "object" ? Object.keys(entries) : [];
          issues.push({
            id: nextId("fynmesh-import-target-absent"),
            severity: "warn",
            code: "fynmesh-import-target-absent",
            title: `${from} imports from ${target}, which is not on this page`,
            detail:
              `${from} imports ${
                names.length ? names.join(", ") : "exposed modules"
              } from ${target}, and nothing of that name is loaded.` +
              "\n\nAn import of one of those resolves to nothing. If any of them " +
              "is a middleware, the consumer's `execute()` never runs and the " +
              "unit sits loaded and inert." +
              `\n\nEither load ${target} before the FynApps that import from it, ` +
              "or drop the import from the build.",
            focus: "container:" + container.name,
            view: "containers",
            refs: [container.name, target],
          });
        }
      }
    }
  }

  issues.push(...providerSourceMismatch(snapshot));
  if (snapshot.capability.kernelRunTime) {
    issues.push(...manifestNotFynApp(snapshot, appNames));
  }

  return issues;
}

/**
 * The manifest names a provider; the share store names someone else.
 *
 * Deliberately narrow. `sources` records who *announced* a version, which is not
 * the same event as supplying it, and a key with several loaded versions has no
 * single answer to "where did the copy come from" — so this fires only where
 * exactly one copy is loaded and the declared provider announced no part of it.
 * Anything looser would put this view back in the business of contradicting the
 * Shares tab, which is what FYM-341 was.
 */
function providerSourceMismatch(snapshot: Snapshot): Issue[] {
  const fm = snapshot.fynmesh!;
  const issues: Issue[] = [];
  const appNames = new Set(fm.apps.map((a) => a.name));
  const containerNames = new Set(snapshot.containers.map((c) => c.name));

  for (const container of snapshot.containers) {
    for (const version of container.versions) {
      const providers = version.manifest?.["shared-providers"];
      if (!providers || typeof providers !== "object") {
        continue;
      }
      for (const [provider, decl] of Object.entries(providers)) {
        // an absent provider is already reported, with better words, above
        if (!appNames.has(provider) && !containerNames.has(provider)) {
          continue;
        }
        for (const key of Array.isArray(decl?.provides) ? decl.provides : []) {
          for (const scope of snapshot.scopes) {
            const share = scope.keys.find((k) => k.key === key);
            if (!share) {
              continue;
            }
            const loaded = share.versions.filter((v) => v.loaded || v.url);
            if (loaded.length !== 1 || !loaded[0].sources.length) {
              continue;
            }
            if (loaded[0].sources.some((s) => s.container === provider)) {
              continue;
            }
            issues.push({
              id: nextId("fynmesh-provider-mismatch"),
              severity: "warn",
              code: "fynmesh-provider-mismatch",
              title: `${container.name}@${version.version} expects ${key} from ${provider}, but the loaded copy comes from ${loaded[0].sources
                .map((s) => s.container)
                .join(", ")}`,
              detail:
                `${container.name}@${version.version} declares ${provider}${
                  decl?.semver ? "@" + decl.semver : ""
                } as the provider of ${key}. Scope "${scope.name}" holds one ` +
                `loaded copy, ${key}@${loaded[0].version}, announced by ` +
                `${loaded[0].sources
                  .map((s) => s.container + (s.version ? "@" + s.version : ""))
                  .join(", ")} — ${provider} is not among them.` +
                `\n\n${provider} is on this page, so this is not a missing ` +
                "dependency: it is a share that resolved to a different " +
                "container's copy. For a UI library that means this FynApp is " +
                "running against module instances its provider does not own." +
                "\n\nThe Shares tab shows the same key from the other side; if " +
                "the two disagree, trust the Shares tab and file the difference.",
              focus: "share:" + key,
              view: "shares",
              refs: [scope.name + ":" + key, container.name, provider],
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Containers built as FynApps that the kernel never loaded as FynApps.
 *
 * One aggregated row, not one per container: on a page that composes libraries
 * this is a normal and common shape, and a row each would bury the diagnostics
 * that mean something. Info, and worded as a fact rather than a fault.
 */
function manifestNotFynApp(snapshot: Snapshot, appNames: Set<string>): Issue[] {
  const names: string[] = [];
  for (const container of snapshot.containers) {
    if (appNames.has(container.name)) {
      continue;
    }
    if (container.versions.some((v) => v.manifest) && !names.includes(container.name)) {
      names.push(container.name);
    }
  }
  if (!names.length) {
    return [];
  }

  return [
    {
      id: nextId("container-not-fynapp"),
      severity: "info",
      code: "container-not-fynapp",
      title: `${names.length} container${
        names.length === 1 ? "" : "s"
      } carr${names.length === 1 ? "ies" : "y"} a FynApp manifest but ${
        names.length === 1 ? "was" : "were"
      } not loaded as FynApps`,
      detail:
        names.join(", ") +
        "\n\nThe rollup plugin emits `__FYNAPP_MANIFEST__` for every container " +
        "it builds, and these are absent from `kernel.runTime.apps` — so they " +
        "are on this page as plain federated libraries: no bootstrap, no " +
        "FynUnit, and no middleware registration from them." +
        "\n\nNormal for a shared-library FynApp that exists to provide shares. " +
        "A problem only if you expected one of these to mount, in which case " +
        "nothing called `loadFynApp` for it.",
      focus: "container:" + names[0],
      view: "containers",
      refs: names,
    },
  ];
}
