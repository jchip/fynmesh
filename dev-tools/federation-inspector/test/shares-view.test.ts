import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ComponentChildren, type VNode } from "preact";
import { emptySnapshot, type IssueSeverity } from "../src/core/model.js";
import { Chip } from "../src/ui/components/atoms.js";
import { query, snapshot, view } from "../src/ui/state.js";
import { SharesView } from "../src/ui/views/shares.js";

vi.mock("@preact/signals", async (importOriginal) => {
  const signals = await importOriginal<typeof import("@preact/signals")>();
  return { ...signals, useComputed: signals.computed };
});

function findChip(children: ComponentChildren): VNode | undefined {
  for (const child of [children].flat(Infinity)) {
    if (!child || typeof child !== "object") continue;
    const node = child as VNode;
    if (node.type === Chip) return node;
    const rendered = typeof node.type === "function"
      ? (node.type as (props: unknown) => VNode)(node.props)
      : node.props.children;
    const chip = findChip(rendered);
    if (chip) return chip;
  }
}

describe("Shares diagnostic badges", () => {
  beforeEach(() => {
    view.value = "shares";
    query.value = "";
    snapshot.value = emptySnapshot();
    snapshot.value.capability.shareStore = true;
  });

  it.each([
    ["info", "chip", "i"],
    ["warn", "chip warn", "!"],
    ["error", "chip err", "⚠"],
  ] as const)("renders %s with the appropriate tone and glyph", (severity: IssueSeverity, cls, glyph) => {
    snapshot.value.scopes = [{
      name: "default",
      keys: [{
        key: "esm-react", singleton: false, versions: [], loadedCount: 2,
        issues: [{
          id: "diagnostic", code: "share-multiple-copies", severity,
          title: "esm-react has 2 versions loaded side by side",
          detail: "Separate module instances are legitimate for a non-singleton share.",
        }],
      }],
    }];

    const chip = findChip(SharesView())!;
    expect(chip).toBeDefined();
    const badge = Chip(chip.props as Parameters<typeof Chip>[0]);
    expect(badge.props.class).toBe(cls);
    expect(badge.props.title).toContain("legitimate for a non-singleton");
    expect((chip.props.children as string[]).join("")).toBe(
      `${glyph} esm-react has 2 versions loaded side by side`
    );
  });
});
