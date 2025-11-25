# Execution Override Architecture

## Overview

The FynMesh kernel provides an execution override mechanism that allows middleware to intercept and control the execution of FynUnit's `initialize()` and `execute()` methods. This is crucial for middleware that needs to manage the execution environment, rendering context, or provide wrapper functionality around FynApp execution.

**Status: ✅ IMPLEMENTED** - The execution override system now works for all FynUnits, including those using `useMiddleware()`.

## Problem Statement (Resolved)

### Previous Issue (2024-11-24)

The kernel previously had two separate execution paths for FynUnits:

1. **Regular FynUnits** (via `invokeFynUnit`): Supported execution overrides
2. **useMiddleware FynUnits** (via `useMiddlewareOnFynUnit`): Did NOT support execution overrides

This created an architectural inconsistency where middleware like `shell-layout` couldn't intercept execution for FynApps using the `useMiddleware()` API.

### Resolution (2024-11-25)

The execution lifecycle was redesigned to:
1. **Simplify to 2 paths**: Function vs object with `__middlewareMeta`
2. **Unified override support**: Both paths now check for execution overrides
3. **First-come-first-serve priority**: First middleware with `canOverrideExecution() === true` wins

## Core Concepts

### Execution Override Interface

Middleware can implement three optional methods to control FynUnit execution:

```typescript
export interface FynAppMiddleware {
  name: string;

  // Determine if this middleware should override execution for a FynApp
  canOverrideExecution?(fynUnit: FynUnit, fynApp: FynApp): boolean;

  // Override the initialize phase
  overrideInitialize?(context: FynAppMiddlewareCallContext): Promise<{ status: string; mode?: string }>;

  // Override the execute phase
  overrideExecute?(context: FynAppMiddlewareCallContext): Promise<any>;

  // Regular middleware methods
  setup?(context: FynAppMiddlewareCallContext): Promise<{ status: string }>;
  apply?(context: FynAppMiddlewareCallContext): Promise<void> | void;
}
```

### Auto-Apply Middleware

Middleware can be configured to automatically apply to FynApps without explicit dependency declaration:

```typescript
export interface FynAppMiddleware {
  // Scope for automatic application
  autoApplyScope?: ("all" | "fynapp" | "middleware")[];

  // Optional filter for fine-grained control
  shouldApply?(fynApp: FynApp): boolean;
}
```

## Current Execution Flow (After Redesign)

### Path 1: Simple Function

```
kernel-core.ts:bootstrapFynApp()
  └── Wrap as { execute: fn }
      └── Execute with auto-apply middleware only
```

### Path 2: FynUnit Object (with or without __middlewareMeta)

```
kernel-core.ts:bootstrapFynApp()
  ├── Load middleware dependencies (if __middlewareMeta)
  ├── For each middleware:
  │   ├── setup()
  │   └── apply()
  ├── findExecutionOverride()   // ✅ Always checks for overrides
  ├── if (override found)
  │   ├── overrideInitialize()
  │   └── overrideExecute()
  └── else
      ├── fynUnit.initialize()
      └── fynUnit.execute()
```

## Use Cases

### Shell Layout Middleware

The shell-layout middleware uses execution overrides to:

1. Intercept FynApp execution
2. Check if FynApp returns a shell-specific result type
3. Manage rendering within the shell UI container
4. Coordinate multi-region layouts

```typescript
class ShellLayoutMiddleware implements FynAppMiddleware {
  canOverrideExecution(fynUnit: FynUnit, fynApp: FynApp): boolean {
    // Override execution for FynApps when shell is available
    return !!this.shellContainer && fynApp.name !== 'fynapp-shell-mw';
  }

  async overrideExecute(context: FynAppMiddlewareCallContext): Promise<void> {
    // Execute FynUnit with shell context
    const result = await context.fynUnit.execute(context.runtime);

    // Handle shell-specific result types
    switch (result?.type) {
      case 'react-component':
        this.renderReactComponent(result.component, result.props);
        break;
      case 'render-function':
        result.render(this.getContainer(context.fynApp));
        break;
      case 'self-managed':
        this.trackSelfManagedApp(context.fynApp.name, result);
        break;
    }
  }
}
```

## Implementation (Completed)

### Design Goals (Achieved)

1. ✅ **Consistency**: All FynUnits support execution overrides regardless of how they're invoked
2. ✅ **Minimal Changes**: Clean refactoring with backward compatibility aliases
3. ✅ **Backward Compatibility**: `FynModule`/`FynModuleRuntime` aliases maintained
4. ✅ **Performance**: Minimal overhead for the override check

### Implementation Summary

The execution lifecycle was redesigned with these key changes:

1. **Renamed types**: `FynModule` → `FynUnit`, `FynModuleRuntime` → `FynUnitRuntime`
2. **Simplified to 2 paths**: Simple function vs object with `execute` method
3. **Unified override support**: `findExecutionOverride()` called for all FynUnits
4. **First-come-first-serve**: First middleware with `canOverrideExecution() === true` wins
5. **UI types extracted**: Shell-specific result types moved to shell middleware
6. **Error isolation**: Failed FynApps don't crash the system

### Files Changed

- `core/kernel/src/types.ts` - Renamed types, removed UI-specific types
- `core/kernel/src/kernel-core.ts` - Simplified execution paths, added validation
- `core/kernel/src/modules/module-loader.ts` - Renamed `invokeFynModule` → `invokeFynUnit`
- `core/kernel/src/modules/middleware-executor.ts` - Updated context references
- `demo/fynapp-shell-mw/src/middleware/shell-layout.ts` - Added shell-specific result types

## Test Results (2024-11-25)

### Test Cases Verified

1. ✅ **Simple FynUnit + Override**: Works correctly
2. ✅ **useMiddleware FynUnit + Override**: Works correctly
3. ✅ **FynUnit without Override**: Direct execution works
4. ✅ **Multiple Overrides**: First-come-first-serve works
5. ✅ **Shell Integration**: All FynApps (1-8) render correctly in shell

### Behavior Confirmed

- All FynApps render in shell UI (main demo + shell.html)
- Shell middleware intercepts execution for all FynApps
- Cross-app communication works (shared counter syncs between FynApps)
- No console errors

## Security Considerations

- Execution overrides should only be allowed for auto-apply middleware
- FynApps cannot override their own execution (prevent circular dependencies)
- Override middleware must be loaded and registered before FynApp execution

## Performance Impact

- One additional check per FynModule execution
- Negligible impact: Simple array iteration to find override
- No impact when no override middleware is present

## References

- [Execution Lifecycle Redesign](../../.design/execution-lifecycle-redesign.md) - Full design document
- [FynApp Middleware Architecture](./fynapp-middleware-architecture.md)
- Shell Layout Middleware: `/demo/fynapp-shell-mw/src/middleware/shell-layout.ts`
- Kernel Core: `/core/kernel/src/kernel-core.ts`
- Module Loader: `/core/kernel/src/modules/module-loader.ts`
- Middleware Executor: `/core/kernel/src/modules/middleware-executor.ts`

---

**Document Status**: ✅ IMPLEMENTED & TESTED
**Last Updated**: 2024-11-25