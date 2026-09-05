/**
 * How a middleware declaration resolved, named and coloured in one place.
 *
 * Two views read the same resolution and are read by the same person in the
 * same minute. The Middleware view answers "who is on this middleware, and on
 * which version"; the FynApps view answers "what did my app ask for, and what
 * did it get". A reader who sees an amber consumer on one tab and clicks
 * through to a green row on the other has been told two different things about
 * one fact -- which is FYM-353, and is its own bug regardless of which of the
 * two colours is right.
 *
 * So the branch vocabulary lives here rather than in either view: the label, the
 * sentence explaining it, and the tone. A view renders these. It does not decide
 * them, the same rule `core/exposes.ts` follows for expose counts (FYM-348).
 *
 * The five branches are not five shades of "worked" and "did not work":
 *
 * - `exact` -- asked for a version by name and the registry had that key.
 * - `range` -- asked for a range and got the highest registered version in it.
 * - `default` -- asked for nothing, so it got whatever registered first. Not a
 *   worse answer than `exact`, but a *different claim*: nobody chose it.
 * - `fallback` -- asked for a range, nothing satisfied it, and the kernel
 *   handed over the default slot anyway. Delivery succeeded and the app is
 *   running a version it explicitly did not ask for.
 * - `unresolved` -- the middleware is registered, and which version this lands
 *   on could not be read at all. Not "nothing arrived": nothing is *known*.
 *
 * Flattening those into good/bad would lose the fact people come to this tool
 * for, so both views keep all five and only the tone collapses.
 */

import type {
  MiddlewareConsumerNode,
  MiddlewareResolution,
  MiddlewareUseNode,
} from "../core/model.js";

/** The branch, as one word in a chip. */
export const VIA_LABEL: Record<MiddlewareResolution, string> = {
  exact: "exact",
  range: "range",
  default: "default",
  fallback: "fallback",
  unresolved: "unresolved",
};

/** How a consumer's declaration landed on this version, in the kernel's own order. */
export const VIA_TITLE: Record<MiddlewareResolution, string> = {
  exact: "asked for this exact version, and the registry has that key",
  range: "declared a range, and this is the highest registered version satisfying it",
  default: "asked for no version, so it got the default slot — the first version registered",
  fallback:
    "declared a range that no registered version satisfies, so the kernel fell back to " +
    "the default slot: this FynApp is running a version it did not ask for",
  unresolved:
    "this middleware is registered but which version the declaration resolves to could " +
    "not be worked out — the registration behind the default slot could not be read",
};

/**
 * What an undeclared consumer is, said without guessing at a cause.
 *
 * `autoApplyScope` is the usual one, but a middleware may also write straight
 * into another FynApp's `middlewareContext` -- and the kernel records nothing
 * that separates the two, so neither is claimed.
 */
export const UNDECLARED_TITLE =
  "nothing in this FynApp's __middlewareMeta asks for this middleware, but its " +
  "middlewareContext carries an entry under the name — so it is running on it " +
  "without ever declaring it. That is what autoApplyScope does, and it is also " +
  "what a middleware writing straight into another FynApp's context does; the " +
  "kernel records no difference between the two.";

/**
 * The resolution branches that are a warning on their own (FYM-354).
 *
 * `fallback` is a consumer running a version it explicitly did not ask for;
 * `unresolved` is one whose version could not be worked out at all. Both used
 * to be drawn in the reassuring colour whenever the middleware was delivered --
 * and delivery is exactly what makes them easy to miss, because from the
 * outside everything appears to have worked.
 *
 * That is the wrong way round for these two in particular. The kernel's own
 * warning about a range nothing satisfies (FYM-321) is compiled out of the
 * browser build by terser's `drop_console: true`, so on a production page this
 * chip is the only surviving signal that it happened. Green removes the last
 * one, two inches from a tooltip saying the app is running a version it did not
 * ask for.
 */
const WARNING_BRANCHES: ReadonlySet<MiddlewareResolution> = new Set<MiddlewareResolution>([
  "fallback",
  "unresolved",
]);

/** The colour a resolution branch is drawn in, wherever it is drawn. */
export function resolutionTone(via: MiddlewareResolution): "ok" | "warn" {
  return WARNING_BRANCHES.has(via) ? "warn" : "ok";
}

/**
 * The colour one consumer chip is drawn in.
 *
 * Two independent reasons to warn, and delivery is only one of them: nothing
 * arrived, or what arrived was not what was asked for. An undeclared consumer
 * asked for nothing, so it can only ever fail the first test -- and it cannot,
 * since it exists only because delivery happened.
 */
export function consumerTone(consumer: MiddlewareConsumerNode): "ok" | "warn" {
  if (!consumer.delivered) {
    return "warn";
  }
  return consumer.route === "declared" && resolutionTone(consumer.via) === "warn" ? "warn" : "ok";
}

/**
 * Which branch a declaration took, seen from the consumer's own row.
 *
 * `undefined` where the kernel never ran the resolution: nothing is registered
 * under the name, so there was no version map to walk. That is a *third* state,
 * not `unresolved` -- "registered, and which version is unknowable" and "no such
 * middleware on this page" would otherwise print the same word for two problems
 * with different fixes. The unregistered row says so in its own chip.
 *
 * Where the middleware is registered, a missing `resolvedVia` *is* `unresolved`;
 * this mirrors the `?? "unresolved"` the collector applies when it files the
 * same declaration as a consumer, so the two views cannot drift apart.
 */
export function useResolution(use: MiddlewareUseNode): MiddlewareResolution | undefined {
  return use.registered ? use.resolvedVia ?? "unresolved" : undefined;
}

/**
 * How bad one `usesMiddleware` row is, all of its chips taken together.
 *
 * The FynApps row draws three separate facts -- registered, resolved, delivered
 * -- and this is the worst of them, which is what a collapsed row and a reader
 * glancing across tabs actually sees. It has to agree with `consumerTone` on the
 * same declaration, with one extra severity the Middleware view has no chip for:
 * an unregistered declaration never becomes a consumer over there at all, so
 * there is nothing to disagree with.
 */
export function useTone(use: MiddlewareUseNode): "ok" | "warn" | "err" {
  if (!use.registered) {
    return "err";
  }
  if (!use.delivered) {
    return "warn";
  }
  return resolutionTone(useResolution(use) ?? "unresolved");
}
