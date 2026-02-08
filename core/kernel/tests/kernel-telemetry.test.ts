import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  KernelTelemetryImpl,
  ConsoleTelemetryTransport,
  noOpTelemetry,
} from "../src/kernel-telemetry.ts";
import type { TelemetryEntry, TelemetryTransport } from "../src/types.ts";

/**
 * Helper: create a mock transport that records all sent batches.
 */
function createMockTransport() {
  const batches: TelemetryEntry[][] = [];
  const transport: TelemetryTransport = {
    async send(batch) {
      batches.push(batch);
    },
  };
  return { transport, batches };
}

describe("KernelTelemetry", () => {
  // ---------------------------------------------------------------
  // 1. KernelTelemetryImpl.capture()
  // ---------------------------------------------------------------
  describe("KernelTelemetryImpl.capture()", () => {
    it("should capture an event entry with auto-filled timestamp", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      const before = Date.now();
      telemetry.capture({ type: "event", name: "app.loaded" });
      const after = Date.now();

      telemetry.flush();

      expect(batches).toHaveLength(1);
      const entry = batches[0][0];
      expect(entry.type).toBe("event");
      expect(entry.name).toBe("app.loaded");
      expect(entry.ts).toBeGreaterThanOrEqual(before);
      expect(entry.ts).toBeLessThanOrEqual(after);
    });

    it("should store entries in the buffer", () => {
      const { transport } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "a" });
      telemetry.capture({ type: "event", name: "b" });

      expect(telemetry.bufferSize).toBe(2);
    });

    it("should handle type 'event'", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "boot", data: { stage: "init" } });
      telemetry.flush();

      const entry = batches[0][0];
      expect(entry.type).toBe("event");
      expect(entry.data).toEqual({ stage: "init" });
    });

    it("should handle type 'metric' with a value", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "metric", name: "load_time", value: 42 });
      telemetry.flush();

      const entry = batches[0][0];
      expect(entry.type).toBe("metric");
      expect(entry.name).toBe("load_time");
      expect(entry.value).toBe(42);
    });

    it("should handle type 'error' with error payload", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({
        type: "error",
        name: "crash",
        error: { message: "Something broke", stack: "at line 1" },
      });
      telemetry.flush();

      const entry = batches[0][0];
      expect(entry.type).toBe("error");
      expect(entry.name).toBe("crash");
      expect(entry.error).toEqual({ message: "Something broke", stack: "at line 1" });
    });
  });

  // ---------------------------------------------------------------
  // 2. Ring buffer overflow
  // ---------------------------------------------------------------
  describe("ring buffer overflow", () => {
    it("should drop oldest entries when buffer reaches maxBufferSize", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport, maxBufferSize: 3 });

      telemetry.capture({ type: "event", name: "first" });
      telemetry.capture({ type: "event", name: "second" });
      telemetry.capture({ type: "event", name: "third" });

      // Buffer full — next capture should evict "first"
      telemetry.capture({ type: "event", name: "fourth" });

      expect(telemetry.bufferSize).toBe(3);

      telemetry.flush();

      const names = batches[0].map((e) => e.name);
      expect(names).toEqual(["second", "third", "fourth"]);
    });

    it("should continue accepting entries after overflow", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport, maxBufferSize: 2 });

      // Overflow multiple times
      telemetry.capture({ type: "event", name: "a" });
      telemetry.capture({ type: "event", name: "b" });
      telemetry.capture({ type: "event", name: "c" });
      telemetry.capture({ type: "event", name: "d" });
      telemetry.capture({ type: "event", name: "e" });

      expect(telemetry.bufferSize).toBe(2);

      telemetry.flush();

      const names = batches[0].map((e) => e.name);
      expect(names).toEqual(["d", "e"]);
    });
  });

  // ---------------------------------------------------------------
  // 3. scope()
  // ---------------------------------------------------------------
  describe("scope()", () => {
    it("should return a KernelTelemetry-compatible instance", () => {
      const telemetry = new KernelTelemetryImpl();
      const scoped = telemetry.scope("bootstrap");

      expect(typeof scoped.capture).toBe("function");
      expect(typeof scoped.scope).toBe("function");
      expect(typeof scoped.flush).toBe("function");
    });

    it("should prepend the prefix to entry names", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });
      const scoped = telemetry.scope("bootstrap");

      scoped.capture({ type: "event", name: "completed" });
      telemetry.flush();

      expect(batches[0][0].name).toBe("bootstrap.completed");
    });

    it("should support nested scopes", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });
      const nested = telemetry.scope("a").scope("b");

      nested.capture({ type: "event", name: "c" });
      telemetry.flush();

      expect(batches[0][0].name).toBe("a.b.c");
    });

    it("should delegate flush to the parent", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });
      const scoped = telemetry.scope("child");

      telemetry.capture({ type: "event", name: "parent-entry" });
      scoped.capture({ type: "event", name: "child-entry" });

      // Flushing via the scoped instance should drain the parent buffer
      scoped.flush();

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2);
      expect(telemetry.bufferSize).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // 4. flush()
  // ---------------------------------------------------------------
  describe("flush()", () => {
    it("should drain the buffer to the transport", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "x" });
      telemetry.capture({ type: "metric", name: "y", value: 10 });

      telemetry.flush();

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2);
    });

    it("should empty the buffer after flush", () => {
      const { transport } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "x" });
      telemetry.flush();

      expect(telemetry.bufferSize).toBe(0);
    });

    it("should do nothing when buffer is already empty", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.flush();

      expect(batches).toHaveLength(0);
    });

    it("should send all buffered entries as a single batch", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "one" });
      telemetry.capture({ type: "event", name: "two" });
      telemetry.capture({ type: "event", name: "three" });

      telemetry.flush();

      // Exactly one call to transport.send with all three entries
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
      expect(batches[0].map((e) => e.name)).toEqual(["one", "two", "three"]);
    });
  });

  // ---------------------------------------------------------------
  // 5. ConsoleTelemetryTransport
  // ---------------------------------------------------------------
  describe("ConsoleTelemetryTransport", () => {
    it("should call console.log with the batch", async () => {
      const transport = new ConsoleTelemetryTransport();
      const batch: TelemetryEntry[] = [
        { type: "event", name: "test", ts: 1000 },
      ];

      await transport.send(batch);

      // console.log is mocked in tests/setup.ts
      expect(console.log).toHaveBeenCalledWith("[telemetry]", batch);
    });
  });

  // ---------------------------------------------------------------
  // 6. noOpTelemetry
  // ---------------------------------------------------------------
  describe("noOpTelemetry", () => {
    it("capture() should not throw", () => {
      expect(() => {
        noOpTelemetry.capture({ type: "event", name: "noop" });
      }).not.toThrow();
    });

    it("scope() should return another noOp instance", () => {
      const scoped = noOpTelemetry.scope("anything");

      expect(typeof scoped.capture).toBe("function");
      expect(typeof scoped.scope).toBe("function");
      expect(typeof scoped.flush).toBe("function");

      // The returned instance is the same noOpTelemetry sentinel
      expect(scoped).toBe(noOpTelemetry);
    });

    it("flush() should not throw", () => {
      expect(() => {
        noOpTelemetry.flush();
      }).not.toThrow();
    });

    it("chained operations should not throw", () => {
      expect(() => {
        noOpTelemetry.scope("a").scope("b").capture({ type: "error", name: "oops" });
        noOpTelemetry.scope("a").flush();
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // 7. Custom transport
  // ---------------------------------------------------------------
  describe("custom transport", () => {
    it("should accept a custom transport via config", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "custom" });
      telemetry.flush();

      expect(batches).toHaveLength(1);
      expect(batches[0][0].name).toBe("custom");
    });

    it("should receive all entries in the batch on flush", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "a" });
      telemetry.capture({ type: "metric", name: "b", value: 99 });
      telemetry.capture({ type: "error", name: "c", error: { message: "fail" } });

      telemetry.flush();

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
      expect(batches[0][0].type).toBe("event");
      expect(batches[0][1].type).toBe("metric");
      expect(batches[0][2].type).toBe("error");
    });

    it("should receive separate batches for separate flushes", () => {
      const { transport, batches } = createMockTransport();
      const telemetry = new KernelTelemetryImpl({ transport });

      telemetry.capture({ type: "event", name: "first-batch" });
      telemetry.flush();

      telemetry.capture({ type: "event", name: "second-batch" });
      telemetry.flush();

      expect(batches).toHaveLength(2);
      expect(batches[0][0].name).toBe("first-batch");
      expect(batches[1][0].name).toBe("second-batch");
    });
  });

  // ---------------------------------------------------------------
  // 8. Default config
  // ---------------------------------------------------------------
  describe("default config", () => {
    it("should default maxBufferSize to 500", () => {
      const telemetry = new KernelTelemetryImpl();

      // Fill up to 500 without overflow
      for (let i = 0; i < 500; i++) {
        telemetry.capture({ type: "event", name: `e${i}` });
      }
      expect(telemetry.bufferSize).toBe(500);

      // 501st should trigger overflow, keeping size at 500
      telemetry.capture({ type: "event", name: "overflow" });
      expect(telemetry.bufferSize).toBe(500);
    });

    it("should default transport to ConsoleTelemetryTransport", () => {
      const telemetry = new KernelTelemetryImpl();

      telemetry.capture({ type: "event", name: "default-transport-test" });
      telemetry.flush();

      // console.log is mocked in setup.ts — verify it was called by the default transport
      expect(console.log).toHaveBeenCalledWith(
        "[telemetry]",
        expect.arrayContaining([
          expect.objectContaining({ type: "event", name: "default-transport-test" }),
        ])
      );
    });
  });
});
