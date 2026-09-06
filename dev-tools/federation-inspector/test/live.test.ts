import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAdapter } from "../src/adapters/live.js";
import { FakeLoader, type FakeRecord } from "./fixture.js";

describe("live failure diagnostics", () => {
  let adapter: LiveAdapter;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    adapter?.dispose();
    vi.useRealTimers();
  });

  it.each([false, true])("reports a rejection without registry growth (secondary=%s)", async (secondary) => {
    const record: FakeRecord = { id: "https://app.test/async.js", d: [], e: () => {} };
    const loader = new FakeLoader().addRecord(record, "linked");
    adapter = new LiveAdapter({
      loader: secondary ? new FakeLoader() : loader,
      loaders: secondary ? [loader] : [],
      pollMs: 500,
    });
    expect((await adapter.current()).modules[0].stage).toBe("linked");
    const updates = vi.fn();
    adapter.subscribe(updates);
    vi.advanceTimersByTime(1000);
    expect(updates).not.toHaveBeenCalled();

    record.f = true;
    record.er = 0;
    loader.addRecord(record, "errored");
    vi.advanceTimersByTime(500);

    expect(updates).toHaveBeenCalledTimes(1);
    const snapshot = await adapter.current();
    expect(snapshot.modules[0]).toMatchObject({ stage: "errored", error: { message: "0" } });
    expect(snapshot.issues.some((issue) => issue.severity === "error")).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(updates).toHaveBeenCalledTimes(1);
  });

  it("detects a different failed module even when failure counts stay equal", async () => {
    const first: FakeRecord = { id: "https://app.test/first.js", f: true, er: "first" };
    const second: FakeRecord = { id: "https://app.test/second.js" };
    const loader = new FakeLoader().addRecord(first, "errored").addRecord(second);
    adapter = new LiveAdapter({ loader, pollMs: 500 });
    await adapter.current();
    const updates = vi.fn();
    adapter.subscribe(updates);
    first.f = false;
    second.f = true;
    second.er = "second";
    loader.addRecord(first).addRecord(second, "errored");
    vi.advanceTimersByTime(500);
    expect(updates).toHaveBeenCalledTimes(1);
    expect((await adapter.current()).modules.filter((m) => m.stage === "errored").map((m) => m.id))
      .toEqual([second.id]);
  });

  it("holds failures while paused and reports them on resume", async () => {
    const record: FakeRecord = { id: "https://app.test/paused.js" };
    const loader = new FakeLoader().addRecord(record);
    adapter = new LiveAdapter({ loader, pollMs: 500 });
    await adapter.current();
    const updates = vi.fn();
    adapter.subscribe(updates);
    adapter.setLive(false);
    record.f = true;
    record.er = "failed while paused";
    loader.addRecord(record, "errored");
    vi.advanceTimersByTime(1000);
    expect(updates).not.toHaveBeenCalled();
    adapter.setLive(true);
    expect(updates).toHaveBeenCalledTimes(1);
    expect((await adapter.current()).modules[0].stage).toBe("errored");
  });
});
