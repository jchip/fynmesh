/**
 * FynBus compile-time type-contract tests (FYM-141)
 *
 * Pins the generics surface of the FynBus API (FYM-17-forward-compatible):
 * emit<T> / on<T> / once<T> payload typing, request<TRes, TReq> /
 * handle<TReq, TRes> RPC typing, unknown (never any) defaults, Unsubscribe,
 * FynBusMeta readability, and channel() recursion.
 *
 * expectTypeOf assertions are checked by the TypeScript compiler and are
 * no-ops at runtime, so this file also passes as a normal vitest run. Type
 * expressions that would have runtime side effects (e.g. an unanswered
 * request() parking a 10s timer) are wrapped in never-invoked functions.
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import { FynBusRoot, FynBusFacade } from "../src/fyn-bus.js";
import type {
  FynBus,
  FynBusMeta,
  BusHandler,
  RequestHandler,
  Unsubscribe,
  SubscribeOptions,
  RequestOptions,
} from "../src/fyn-bus.js";

function createBus(): FynBus {
  return new FynBusRoot().forApp("type-app", "1.0.0");
}

describe("FynBus type contracts", () => {
  it("emit<T> constrains the payload parameter to T | undefined", () => {
    const bus = createBus();

    expectTypeOf(bus.emit).parameter(0).toBeString();
    expectTypeOf(bus.emit<{ n: number }>).parameter(1).toEqualTypeOf<{ n: number } | undefined>();
    expectTypeOf(bus.emit<{ n: number }>).returns.toBeVoid();
    expectTypeOf(bus.emit<string>).parameter(1).not.toEqualTypeOf<number | undefined>();

    // and a matching payload is accepted at runtime (no subscribers: no-op)
    bus.emit<{ n: number }>("typed", { n: 1 });
  });

  it("emit payload defaults to unknown, not any", () => {
    const bus = createBus();
    type DefaultPayload = Parameters<typeof bus.emit>[1];

    expectTypeOf<DefaultPayload>().toBeUnknown();
    expectTypeOf<DefaultPayload>().not.toBeAny();
  });

  it("on<T> infers the handler payload as T and meta as FynBusMeta", () => {
    const bus = createBus();

    const unsub = bus.on<{ count: number }>("counter", (payload, meta) => {
      expectTypeOf(payload).toEqualTypeOf<{ count: number }>();
      expectTypeOf(meta).toEqualTypeOf<FynBusMeta>();
    });
    expectTypeOf(unsub).toEqualTypeOf<Unsubscribe>();
    expectTypeOf(bus.on<string>).parameter(1).toEqualTypeOf<BusHandler<string>>();
    unsub();
  });

  it("on handler payload defaults to unknown (forces narrowing before use)", () => {
    const bus = createBus();

    const unsub = bus.on("untyped", (payload) => {
      expectTypeOf(payload).toBeUnknown();
      expectTypeOf(payload).not.toBeAny();
    });
    expectTypeOf(bus.on).parameter(2).toEqualTypeOf<SubscribeOptions | undefined>();
    unsub();
  });

  it("once<T> shares the on<T> contract and returns Unsubscribe", () => {
    const bus = createBus();

    expectTypeOf(bus.once<string>).parameter(1).toEqualTypeOf<BusHandler<string>>();
    expectTypeOf(bus.once).returns.toEqualTypeOf<Unsubscribe>();
    expectTypeOf(bus.once).returns.toEqualTypeOf<() => void>();
    expectTypeOf(bus.once).parameter(2).toEqualTypeOf<SubscribeOptions | undefined>();
  });

  it("request<TRes, TReq> types the payload and resolves to Promise<TRes>", () => {
    const bus = createBus();

    expectTypeOf(bus.request<number, { q: string }>)
      .parameter(1)
      .toEqualTypeOf<{ q: string } | undefined>();
    expectTypeOf(bus.request<number, { q: string }>).returns.toEqualTypeOf<Promise<number>>();
    expectTypeOf(bus.request).returns.toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(bus.request).parameter(2).toEqualTypeOf<RequestOptions | undefined>();

    // Type-only: never invoked, so no parked request/timer is created
    const _resolveShape = (b: FynBus) => {
      expectTypeOf(b.request<{ total: number }>("quote")).resolves.toEqualTypeOf<{
        total: number;
      }>();
    };
    expectTypeOf(_resolveShape).toBeFunction();
  });

  it("handle<TReq, TRes> types the handler signature and allows sync or async results", async () => {
    const root = new FynBusRoot();
    const provider = root.forApp("provider-t", "1.0.0");
    const consumer = root.forApp("consumer-t", "1.0.0");

    const unsub = provider.handle<{ a: number; b: number }, number>("sum", (payload, meta) => {
      expectTypeOf(payload).toEqualTypeOf<{ a: number; b: number }>();
      expectTypeOf(meta).toEqualTypeOf<FynBusMeta>();
      return payload.a + payload.b;
    });
    expectTypeOf(unsub).toEqualTypeOf<Unsubscribe>();
    expectTypeOf(provider.handle<number, string>)
      .parameter(1)
      .toEqualTypeOf<RequestHandler<number, string>>();

    // An async handler satisfies RequestHandler<TReq, TRes>
    const asyncHandler: RequestHandler<number, string> = async (n) => `v${n}`;
    expectTypeOf(asyncHandler).returns.toEqualTypeOf<string | Promise<string>>();

    // The typed round trip also works at runtime
    await expect(consumer.request<number>("sum", { a: 2, b: 3 })).resolves.toBe(5);
    unsub();
  });

  it("handle request payload defaults to unknown", () => {
    const bus = createBus();

    const unsub = bus.handle("default-req", (payload) => {
      expectTypeOf(payload).toBeUnknown();
      expectTypeOf(payload).not.toBeAny();
      return null;
    });
    unsub();
  });

  it("Unsubscribe is exactly () => void", () => {
    expectTypeOf<Unsubscribe>().toEqualTypeOf<() => void>();
  });

  it("FynBusMeta exposes string fields and reads through a Readonly view", () => {
    expectTypeOf<FynBusMeta["topic"]>().toBeString();
    expectTypeOf<FynBusMeta["source"]>().toBeString();
    expectTypeOf<FynBusMeta["channel"]>().toBeString();

    // The platform freezes meta at runtime; reading code can hold it behind
    // Readonly<FynBusMeta> without any cast.
    expectTypeOf<FynBusMeta>().toExtend<Readonly<FynBusMeta>>();
    const _readonlyRead = (meta: FynBusMeta) => {
      const view: Readonly<FynBusMeta> = meta;
      expectTypeOf(view.topic).toBeString();
    };
    expectTypeOf(_readonlyRead).toBeFunction();
  });

  it("channel() returns the full FynBus surface, recursively", () => {
    const bus = createBus();

    expectTypeOf(bus.channel).returns.toEqualTypeOf<FynBus>();
    const cart = bus.channel("cart");
    expectTypeOf(cart).toEqualTypeOf<FynBus>();
    expectTypeOf(cart.channel).returns.toEqualTypeOf<FynBus>();

    // Root factories hand out FynBus-compatible facades
    const root = new FynBusRoot();
    expectTypeOf(root.forKernel).returns.toEqualTypeOf<FynBus>();
    expectTypeOf(root.forApp).returns.toEqualTypeOf<FynBusFacade>();
    expectTypeOf(FynBusFacade.prototype).toExtend<FynBus>();
  });

  it("BusHandler and option types match the documented surface", () => {
    expectTypeOf<BusHandler<number>>().toEqualTypeOf<
      (payload: number, meta: FynBusMeta) => void
    >();
    expectTypeOf<Parameters<BusHandler>[0]>().toBeUnknown();
    expectTypeOf<SubscribeOptions>().toEqualTypeOf<{ self?: boolean; signal?: AbortSignal }>();
    expectTypeOf<RequestOptions>().toEqualTypeOf<{ timeout?: number }>();
  });
});
