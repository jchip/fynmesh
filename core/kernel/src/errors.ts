/**
 * Kernel Error Module
 * Standardized error types for FynMesh Kernel with error codes
 */

/**
 * Error codes for kernel errors.
 *
 * A frozen object rather than a TS `enum`, for size: a *numeric* enum emits a
 * reverse map (`E[E.MODULE_NOT_FOUND = 1001] = "MODULE_NOT_FOUND"`), so every
 * member's name ships twice — 1,007 B across these 19 members. Nothing looks a
 * name up from a code, so that half was dead weight. (`const enum`, which would
 * inline instead, is unavailable here: `isolatedModules` is on.)
 *
 * The companion type alias keeps `KernelErrorCode` usable in type position
 * exactly as the enum was.
 */
export const KernelErrorCode = {
  // Module Loading Errors (1xxx)
  MODULE_NOT_FOUND: 1001,
  MODULE_LOAD_FAILED: 1002,
  EXPOSE_MODULE_NOT_FOUND: 1003,
  DEPENDENCY_NOT_FOUND: 1004,

  // Middleware Errors (2xxx)
  MIDDLEWARE_NOT_FOUND: 2001,
  MIDDLEWARE_SETUP_FAILED: 2002,
  MIDDLEWARE_APPLY_FAILED: 2003,
  MIDDLEWARE_FILTER_ERROR: 2004,

  // Bootstrap Errors (3xxx)
  BOOTSTRAP_FAILED: 3001,
  REGISTRY_RESOLVER_MISSING: 3002,

  // Manifest Errors (4xxx)
  MANIFEST_FETCH_FAILED: 4001,
  MANIFEST_PARSE_FAILED: 4002,

  // Federation Errors (5xxx)
  FEDERATION_NOT_LOADED: 5001,
  FEDERATION_ENTRY_FAILED: 5002,

  // FynBus Errors (6xxx)
  BUS_DISPOSED: 6001,
  BUS_INVALID_CHANNEL: 6002,
  BUS_HANDLER_EXISTS: 6003,
  BUS_REQUEST_TIMEOUT: 6004,
  BUS_REQUEST_ABORTED: 6005,
} as const;

export type KernelErrorCode = (typeof KernelErrorCode)[keyof typeof KernelErrorCode];

/**
 * Base error class for all kernel errors
 */
export class KernelError extends Error {
  readonly code: KernelErrorCode;
  readonly context?: Record<string, unknown>;
  readonly cause?: Error;

  constructor(
    code: KernelErrorCode,
    message: string,
    options?: {
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "KernelError";
    this.code = code;
    this.context = options?.context;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a formatted error message with context
   */
  toDetailedString(): string {
    let result = `[${this.name}:${this.code}] ${this.message}`;
    if (this.context) {
      result += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
    }
    if (this.cause) {
      result += `\nCaused by: ${this.cause.message}`;
    }
    return result;
  }
}

/**
 * Builds a KernelError subclass whose options bag becomes `context`.
 *
 * The five classes below were byte-for-byte the same shape — a constructor, a
 * `super()`, a hand-written literal copying each option onto `context`, and a
 * `this.name` assignment — differing only in the name and the option keys. That
 * is five constructors and five repacking literals in the bundle for behaviour
 * expressible once. The generic parameter keeps each class's option names
 * type-checked at call sites, so the collapse costs no type safety.
 *
 * Unlike the hand-written versions, `context` now holds only the keys actually
 * passed rather than every key with `undefined` values. Nothing observes the
 * difference: readers index single fields, and `toDetailedString`'s
 * JSON.stringify omits undefined either way.
 */
function defineErrorClass<TOptions extends Record<string, unknown>>(name: string) {
  return class extends KernelError {
    constructor(code: KernelErrorCode, message: string, options?: TOptions & { cause?: Error }) {
      const { cause, ...context } = options ?? ({} as TOptions & { cause?: Error });
      super(code, message, { context, cause });
      this.name = name;
    }
  };
}

/** Error for module loading failures */
export const ModuleLoadError = defineErrorClass<{
  fynAppName?: string;
  fynAppVersion?: string;
  exposeName?: string;
}>("ModuleLoadError");
export type ModuleLoadError = InstanceType<typeof ModuleLoadError>;

/** Error for middleware-related failures */
export const MiddlewareError = defineErrorClass<{
  middlewareName?: string;
  provider?: string;
  fynAppName?: string;
}>("MiddlewareError");
export type MiddlewareError = InstanceType<typeof MiddlewareError>;

/** Error for bootstrap failures */
export const BootstrapError = defineErrorClass<{
  fynAppName?: string;
  phase?: string;
}>("BootstrapError");
export type BootstrapError = InstanceType<typeof BootstrapError>;

/** Error for manifest resolution failures */
export const ManifestError = defineErrorClass<{
  manifestUrl?: string;
  packageName?: string;
}>("ManifestError");
export type ManifestError = InstanceType<typeof ManifestError>;

/** Error for federation-related failures */
export const FederationError = defineErrorClass<{
  entryUrl?: string;
}>("FederationError");
export type FederationError = InstanceType<typeof FederationError>;

/**
 * Error for FynBus messaging failures
 */
/**
 * Error or close enough to chain as a cause. Duck-typed rather than
 * `instanceof Error`: an AbortSignal reason may be a DOMException from
 * another realm (jsdom, iframe), where instanceof fails.
 */
function isErrorLike(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as { name?: unknown }).name === "string" &&
      typeof (value as { message?: unknown }).message === "string")
  );
}

export class FynBusError extends KernelError {
  constructor(
    code: KernelErrorCode,
    message: string,
    context?: Record<string, unknown>,
    cause?: unknown
  ) {
    super(code, message, {
      context,
      // KernelError chains Error causes; an AbortSignal reason can be any
      // value, so non-Error reasons are wrapped to keep the chain intact
      cause: cause === undefined || isErrorLike(cause) ? cause : new Error(String(cause)),
    });
    this.name = "FynBusError";
  }
}

/**
 * Result type for operations that can fail
 * Use this for recoverable errors where the caller should decide how to handle
 */
export type Result<T, E = KernelError> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Helper to create success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

/**
 * Helper to create error result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Check if a result is an error
 */
export function isError<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}

/**
 * Check if a result is success
 */
export function isOk<T, E>(result: Result<T, E>): result is { success: true; value: T } {
  return result.success;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.success) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.success) {
    return result.value;
  }
  return defaultValue;
}
