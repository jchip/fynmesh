/**
 * Kernel Error Module
 * Standardized error types for FynMesh Kernel with error codes
 */

/**
 * Error codes for kernel errors
 */
export enum KernelErrorCode {
  // Module Loading Errors (1xxx)
  MODULE_NOT_FOUND = 1001,
  MODULE_LOAD_FAILED = 1002,
  EXPOSE_MODULE_NOT_FOUND = 1003,
  DEPENDENCY_NOT_FOUND = 1004,

  // Middleware Errors (2xxx)
  MIDDLEWARE_NOT_FOUND = 2001,
  MIDDLEWARE_SETUP_FAILED = 2002,
  MIDDLEWARE_APPLY_FAILED = 2003,
  MIDDLEWARE_FILTER_ERROR = 2004,

  // Bootstrap Errors (3xxx)
  BOOTSTRAP_FAILED = 3001,
  REGISTRY_RESOLVER_MISSING = 3002,

  // Manifest Errors (4xxx)
  MANIFEST_FETCH_FAILED = 4001,
  MANIFEST_PARSE_FAILED = 4002,

  // Federation Errors (5xxx)
  FEDERATION_NOT_LOADED = 5001,
  FEDERATION_ENTRY_FAILED = 5002,
}

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
 * Error for module loading failures
 */
export class ModuleLoadError extends KernelError {
  constructor(
    code: KernelErrorCode,
    message: string,
    options?: {
      fynAppName?: string;
      fynAppVersion?: string;
      exposeName?: string;
      cause?: Error;
    }
  ) {
    super(code, message, {
      context: {
        fynAppName: options?.fynAppName,
        fynAppVersion: options?.fynAppVersion,
        exposeName: options?.exposeName,
      },
      cause: options?.cause,
    });
    this.name = "ModuleLoadError";
  }
}

/**
 * Error for middleware-related failures
 */
export class MiddlewareError extends KernelError {
  constructor(
    code: KernelErrorCode,
    message: string,
    options?: {
      middlewareName?: string;
      provider?: string;
      fynAppName?: string;
      cause?: Error;
    }
  ) {
    super(code, message, {
      context: {
        middlewareName: options?.middlewareName,
        provider: options?.provider,
        fynAppName: options?.fynAppName,
      },
      cause: options?.cause,
    });
    this.name = "MiddlewareError";
  }
}

/**
 * Error for bootstrap failures
 */
export class BootstrapError extends KernelError {
  constructor(
    code: KernelErrorCode,
    message: string,
    options?: {
      fynAppName?: string;
      phase?: string;
      cause?: Error;
    }
  ) {
    super(code, message, {
      context: {
        fynAppName: options?.fynAppName,
        phase: options?.phase,
      },
      cause: options?.cause,
    });
    this.name = "BootstrapError";
  }
}

/**
 * Error for manifest resolution failures
 */
export class ManifestError extends KernelError {
  constructor(
    code: KernelErrorCode,
    message: string,
    options?: {
      manifestUrl?: string;
      packageName?: string;
      cause?: Error;
    }
  ) {
    super(code, message, {
      context: {
        manifestUrl: options?.manifestUrl,
        packageName: options?.packageName,
      },
      cause: options?.cause,
    });
    this.name = "ManifestError";
  }
}

/**
 * Error for federation-related failures
 */
export class FederationError extends KernelError {
  constructor(
    code: KernelErrorCode,
    message: string,
    options?: {
      entryUrl?: string;
      cause?: Error;
    }
  ) {
    super(code, message, {
      context: {
        entryUrl: options?.entryUrl,
      },
      cause: options?.cause,
    });
    this.name = "FederationError";
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
