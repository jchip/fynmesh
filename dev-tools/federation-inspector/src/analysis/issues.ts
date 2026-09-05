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

import type { Issue, Snapshot } from "../core/model.js";
import type { Graph } from "./graph.js";


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
