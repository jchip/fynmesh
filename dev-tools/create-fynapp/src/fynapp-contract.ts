/**
 * FynApp authoring contract — the type-anchored source of truth.
 *
 * This module re-exports, under stable author-facing names, exactly the
 * `@fynmesh/kernel` types a FynApp (and its middleware) must implement. It is
 * NOT new abstraction — it is a *contract surface*.
 *
 * WHY THIS FILE EXISTS: it is compiled as part of `create-fynapp`'s normal
 * build (`tsc`). If the kernel renames, removes, or changes the shape of any
 * type below, this file fails to compile — an automatic, zero-cost alarm that
 * the FynApp contract has drifted. When that happens, follow
 * `agent/MIGRATION.md`: update this file + `agent/CONTRACT.md`, then migrate
 * the fynapps.
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
