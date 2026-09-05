/**
 * The Issues view: every derived diagnostic, worst first.
 *
 * Each row deep-links into the view that explains it, which is the point of
 * having the list at all -- an issue you cannot navigate to is a notification,
 * not a tool.
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type { Issue } from "../../core/model.js";
import { focusOn, query, snapshot } from "../state.js";

const SEV_GLYPH = { error: "!", warn: "!", info: "i" } as const;

/**
 * The Issues tab's filter.
 *
 * Exported because the count above the list has to be this list: a second
 * substring test kept in step by hand is how the Shares header came to read
 * "0 / 7" over two visible rows.
 *
 * It lives here and not beside `filterScopes` and `filterContainers` because
 * it is view-shaped, not grammar-shaped. An Issue has no stage, kind or
 * container of its own for a facet to select on -- it has three lines of prose
 * which already quote the container names, versions and ids by hand, so plain
 * text over that prose is the honest search and `container:fynapp-1` here is
 * literally what the reader typed.
 */
export function filterIssues(issues: Issue[], query: string): Issue[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return issues;
  }
  return issues.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.detail.toLowerCase().includes(q) ||
      i.code.includes(q)
  );
}

export function IssuesView(): JSX.Element {
  const issues = useComputed(() => filterIssues(snapshot.value.issues, query.value));

  if (!issues.value.length) {
    return (
      <div class="empty">
        {snapshot.value.issues.length
          ? "No issues match this filter."
          : "Nothing to report — no failed modules, no duplicated singletons, no unsatisfied ranges."}
      </div>
    );
  }

  return (
    <div class="scroll">
      {issues.value.map((issue) => (
        <IssueRow key={issue.id} issue={issue} />
      ))}
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }): JSX.Element {
  return (
    <div
      class="issue"
      role="button"
      tabIndex={0}
      onClick={() => focusOn(issue.view ?? "modules", issue.focus)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusOn(issue.view ?? "modules", issue.focus);
        }
      }}
    >
      <span class={"sev " + issue.severity} aria-label={issue.severity}>
        {SEV_GLYPH[issue.severity]}
      </span>
      <span class="txt">
        <span class="t">
          {issue.title}
          {/* a real space, so copying the row does not yield "…providedshare-not-provided" */}{" "}
          <span class="code">{issue.code}</span>
        </span>
        <span class="d">{issue.detail}</span>
      </span>
    </div>
  );
}
