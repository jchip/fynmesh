import type { FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";
import { FYNOPS_SHELL_API } from "../api";
import { createShellApi } from "../shell-state";

/**
 * Hands every FynApp loaded after the shell its FynOpsShellApi.
 *
 * Auto-applied, so a feature declares nothing: the kernel runs `apply` during
 * the feature's bootstrap, before its `execute()`, on the same
 * `middlewareContext` the feature's runtime reads.
 */
class FynOpsShellMiddleware implements FynAppMiddleware {
  name = "fynops-shell";
  autoApplyScope: FynAppMiddleware["autoApplyScope"] = ["fynapp"];

  apply(cc: FynAppMiddlewareCallContext): void {
    cc.runtime.middlewareContext.set(FYNOPS_SHELL_API, createShellApi(cc.fynApp.name));
  }
}

export const __middleware__FynOpsShell = new FynOpsShellMiddleware();
