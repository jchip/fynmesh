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

export function IssuesView(): JSX.Element {
  const issues = useComputed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) {
      return snapshot.value.issues;
    }
    return snapshot.value.issues.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.detail.toLowerCase().includes(q) ||
        i.code.includes(q)
    );
  });

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
