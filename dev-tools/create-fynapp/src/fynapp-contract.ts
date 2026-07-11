/**
 * FynApp authoring contract — the type-anchored source of truth.
 *
 * This module re-exports the `@fynmesh/kernel` types a FynApp (and its
 * middleware) must implement. It is NOT a new abstraction — it is a contract
 * surface.
 *
 * WHY THIS FILE EXISTS: it is compiled as part of `create-fynapp`'s normal
 * build (`tsc`). The Pick aliases below also anchor the lifecycle and runtime
 * members described in `agent/CONTRACT.md`, so renaming or removing one fails
 * the build. TypeScript cannot flag newly added members; review kernel API
 * changes for additions and semantics as described in `agent/MIGRATION.md`.
 *
 * The prose contract an LLM agent reads is `agent/CONTRACT.md`; this file is
 * what keeps that prose honest.
 */

import type {
  // The main-module contract a FynApp's `./main` export implements.
  FynUnit,
  FynUnitRuntime,
  FynApp,
  // The consumer declaration attached by useMiddleware.
  MiddlewareUseMeta,
  MiddlewareInfo,
  // The middleware-provider contract + the context its phases receive.
  FynAppMiddleware,
  FynAppMiddlewareCallContext,
} from "@fynmesh/kernel";

// Value-level anchors: these must exist as runtime exports too.
import { useMiddleware, noOpFynUnit } from "@fynmesh/kernel";

export type {
  FynUnit,
  FynUnitRuntime,
  FynApp,
  MiddlewareUseMeta,
  MiddlewareInfo,
  FynAppMiddleware,
  FynAppMiddlewareCallContext,
};

export { useMiddleware, noOpFynUnit };

/** Kernel members explicitly covered by the authoring contract. */
export type FynUnitRuntimeContract = Pick<FynUnitRuntime, "fynApp" | "middlewareContext" | "bus">;
export type FynUnitLifecycleContract = Pick<FynUnit, "initialize" | "execute" | "shutdown" | "suspend" | "resume">;

/**
 * The shape a FynApp's entry module (`src/main.ts`) must export as `main`.
 * Always a {@link FynUnit}: a class implementing it, a plain object with at
 * least `execute`, or the result of `useMiddleware([...], unit)`.
 */
export type FynAppMain = FynUnit;

/**
 * A single consumer middleware declaration. At runtime the supported form is
 * `{ middleware: import("pkg/middleware/x/x", { with: { type: "fynapp-middleware" } }), config }`.
 * The kernel resolves the dynamic federation import; `config` is passed to the
 * provider verbatim as `cc.meta.config`.
 */
export type MiddlewareUse<ConfigT = unknown> = MiddlewareUseMeta<ConfigT>;
