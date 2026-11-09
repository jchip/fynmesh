(function () {
  'use strict';

  function captureEvent(tel, name, data) {
    tel.capture({ type: "event", name, data });
  }
  const noOpTelemetry = {
    capture() {
    },
    capErr() {
    },
    scope() {
      return noOpTelemetry;
    },
    flush() {
    }
  };

  const MIDDLEWARE_EXPOSE_PREFIX = "./middleware";
  const MIDDLEWARE_EXPORT_PREFIX = "__middleware__";
  function isFynAppMiddlewareProvider(fynApp) {
    return Object.keys(fynApp.exposes).some((key) => key.startsWith(MIDDLEWARE_EXPOSE_PREFIX));
  }
  function getTargetMiddlewares(fynApp, autoApply) {
    if (!autoApply) return [];
    return isFynAppMiddlewareProvider(fynApp) ? autoApply.mw : autoApply.fynapp;
  }
  function findExecutionOverride(fynApp, fynUnit, autoApply) {
    return getTargetMiddlewares(fynApp, autoApply).find(
      (mwReg) => mwReg.mw.canOverrideExecution?.(fynApp, fynUnit)
    ) ?? null;
  }
  function createMiddlewareCallContext(mwReg, fynUnit, fynApp, runtime, kernel, config, status, info) {
    return {
      meta: {
        info: info ?? {
          name: mwReg.mw.name,
          provider: mwReg.hostFynApp.name,
          version: mwReg.hostFynApp.version
        },
        config: config ?? {}
      },
      fynUnit,
      fynApp,
      reg: mwReg,
      runtime,
      kernel,
      status: status ?? ""
    };
  }
  async function executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel) {
    console.debug(`\u{1F3AD} Middleware ${executionOverride.mw.name} is overriding execution for ${fynApp.name}`);
    const context = createMiddlewareCallContext(executionOverride, fynUnit, fynApp, runtime, kernel, {}, "ready");
    if (executionOverride.mw.overrideInitialize && fynUnit.initialize) {
      console.debug(`\u{1F3AD} Middleware overriding initialize for ${fynApp.name}`);
      const initResult = await executionOverride.mw.overrideInitialize(context);
      console.debug(`\u{1F3AD} Initialize result:`, initResult);
    }
    if (executionOverride.mw.overrideExecute && typeof fynUnit.execute === "function") {
      console.debug(`\u{1F3AD} Middleware overriding execute for ${fynApp.name}`);
      await executionOverride.mw.overrideExecute(context);
    }
  }
  async function parseMiddlewareString(middlewareStr, config, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency) {
    const parts = middlewareStr.trim().split(" ");
    if (parts.length < 3 || parts[0] !== "-FYNAPP_MIDDLEWARE") {
      return null;
    }
    const [, packageName, middlewarePath, semver] = parts;
    const middlewareName = middlewarePath.split("/").pop() || middlewarePath;
    console.debug("\u{1F50D} Middleware string - package:", packageName, "middleware:", middlewarePath, "semver:", semver || "any");
    if (loadMiddlewareFromDependency) {
      await loadMiddlewareFromDependency(packageName, middlewarePath);
    }
    const reg = getMiddleware(middlewareName, packageName, { version: semver });
    if (reg.regKey === "") {
      console.debug("\u274C No middleware found for", middlewareName, packageName);
      return null;
    }
    return createMiddlewareCallContext(reg, fynUnit, fynApp, runtime, kernel, config, "", {
      name: middlewareName,
      provider: packageName,
      version: semver || "*"
    });
  }

  const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;
  const parse = (version) => {
    const m = VERSION_RE.exec(version.trim());
    if (!m) {
      return void 0;
    }
    const specified = m[3] !== void 0 ? 3 : m[2] !== void 0 ? 2 : 1;
    return {
      parts: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)],
      specified,
      pre: m[4] ?? ""
    };
  };
  const comparePre = (a, b) => {
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const as = a.split(".");
    const bs = b.split(".");
    for (let i = 0; i < Math.max(as.length, bs.length); i++) {
      const x = as[i];
      const y = bs[i];
      if (x === void 0) return -1;
      if (y === void 0) return 1;
      const xn = /^\d+$/.test(x);
      const yn = /^\d+$/.test(y);
      if (xn && yn) {
        const d = Number(x) - Number(y);
        if (d !== 0) return d < 0 ? -1 : 1;
      } else if (xn !== yn) {
        return xn ? -1 : 1;
      } else if (x !== y) {
        return x < y ? -1 : 1;
      }
    }
    return 0;
  };
  const compareParsed = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.parts[i] !== b.parts[i]) {
        return a.parts[i] < b.parts[i] ? -1 : 1;
      }
    }
    return comparePre(a.pre, b.pre);
  };
  const compareVersions = (a, b) => {
    const pa = parse(a);
    const pb = parse(b);
    if (!pa && !pb) return 0;
    if (!pa) return -1;
    if (!pb) return 1;
    return compareParsed(pa, pb);
  };
  const isWildcard = (range) => {
    const r = range.trim();
    return r === "" || r === "*" || r === "x" || r === "X";
  };
  const caretLimit = (v) => {
    if (v.parts[0] !== 0) return [v.parts[0] + 1, 0, 0];
    if (v.parts[1] !== 0 || v.specified < 2) return [0, v.parts[1] + 1, 0];
    return [0, 0, v.parts[2] + 1];
  };
  const tildeLimit = (v) => {
    if (v.specified === 1) return [v.parts[0] + 1, 0, 0];
    return [v.parts[0], v.parts[1] + 1, 0];
  };
  const asBound = (parts) => ({
    parts,
    specified: 3,
    pre: ""
  });
  const PLACEHOLDER_RE = /^(x|X|\*)$/;
  const normalizeOperand = (raw) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return trimmed;
    }
    const [core, ...suffix] = trimmed.split(/(?=[-+])/);
    const segments = core.split(".");
    const kept = [];
    for (const segment of segments) {
      if (PLACEHOLDER_RE.test(segment)) {
        break;
      }
      kept.push(segment);
    }
    if (kept.length === 0) {
      return "*";
    }
    return kept.length === segments.length ? kept.join(".") + suffix.join("") : kept.join(".");
  };
  const COMPARATOR_RE = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/;
  const satisfiesComparator = (v, comparator) => {
    const raw = comparator.trim();
    if (isWildcard(raw)) {
      return true;
    }
    const m = COMPARATOR_RE.exec(raw);
    if (!m) {
      return void 0;
    }
    const op = m[1] ?? "=";
    const operandStr = normalizeOperand(m[2]);
    if (isWildcard(operandStr)) {
      return true;
    }
    const operand = parse(operandStr);
    if (!operand) {
      return void 0;
    }
    switch (op) {
      case "^":
        return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(caretLimit(operand))) < 0;
      case "~":
        return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(tildeLimit(operand))) < 0;
      case ">":
        return compareParsed(v, operand) > 0;
      case ">=":
        return compareParsed(v, operand) >= 0;
      case "<":
        return compareParsed(v, operand) < 0;
      case "<=":
        return compareParsed(v, operand) <= 0;
      default: {
        if (operand.specified === 3) {
          return compareParsed(v, operand) === 0;
        }
        const upper = operand.specified === 1 ? [operand.parts[0] + 1, 0, 0] : [operand.parts[0], operand.parts[1] + 1, 0];
        return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(upper)) < 0;
      }
    }
  };
  const alternatives = (range) => range.split("||").map((alt) => alt.trim().split(/\s+/).filter(Boolean)).map((parts) => parts.length === 0 ? ["*"] : parts);
  const isSupportedRange = (range) => {
    if (typeof range !== "string") {
      return false;
    }
    if (isWildcard(range)) {
      return true;
    }
    const probe = parse("0.0.0");
    return alternatives(range).every(
      (alt) => alt.every((comparator) => satisfiesComparator(probe, comparator) !== void 0)
    );
  };
  const satisfiesRange = (version, range) => {
    const v = parse(version);
    if (!v) {
      return false;
    }
    if (isWildcard(range)) {
      return true;
    }
    return alternatives(range).some(
      (alt) => alt.every((comparator) => satisfiesComparator(v, comparator) === true)
    );
  };
  const maxSatisfying = (versions, range) => {
    let best;
    for (const version of versions) {
      if (satisfiesRange(version, range) && (best === void 0 || compareVersions(version, best) > 0)) {
        best = version;
      }
    }
    return best;
  };

  const DummyMiddlewareReg = {
    regKey: ""
  };
  const MiddlewareManager = function(telemetry) {
    const tel = telemetry ?? noOpTelemetry;
    const scannedModules = /* @__PURE__ */ new Set();
    const ambiguousDefaultWarned = /* @__PURE__ */ new Set();
    let middlewares = {};
    let autoApply;
    const registerMiddleware = (mwReg) => {
      const { regKey, hostFynApp } = mwReg;
      const versionMap = middlewares[regKey] || /* @__PURE__ */ Object.create(null);
      if (versionMap[hostFynApp.version]) {
        console.debug(
          `\u26A0\uFE0F Middleware already registered: ${regKey}@${hostFynApp.version} - skipping duplicate registration`
        );
        return;
      }
      console.log(`\u{1F527} Registering mw: ${regKey}, autoApplyScope:`, mwReg.mw.autoApplyScope);
      versionMap[hostFynApp.version] = mwReg;
      if (!versionMap.default) {
        versionMap.default = mwReg;
      } else if (!ambiguousDefaultWarned.has(regKey)) {
        ambiguousDefaultWarned.add(regKey);
        const others = Object.keys(versionMap).filter(
          (key) => key !== "default" && key !== versionMap.default.hostFynApp.version
        );
        console.warn(
          `\u26A0\uFE0F Middleware '${regKey}' now has more than one version registered. A lookup that asks for no version resolves to the first version registered (${versionMap.default.hostFynApp.version}), not the highest; also registered: ${others.join(", ")}. Declare a version range on the middleware to choose deliberately.`
        );
      }
      middlewares[regKey] = versionMap;
      const autoApplyScope = mwReg.mw.autoApplyScope || [];
      if (autoApplyScope.length > 0) {
        if (!autoApply) {
          autoApply = { fynapp: [], mw: [] };
        }
        if (autoApplyScope.includes("all") || autoApplyScope.includes("fynapp")) {
          autoApply.fynapp.push(mwReg);
        }
        if (autoApplyScope.includes("all") || autoApplyScope.includes("middleware")) {
          autoApply.mw.push(mwReg);
        }
        console.debug(`\u{1F3AF} Registered auto-apply middleware for [${autoApplyScope.join(", ")}]: ${regKey}@${hostFynApp.version}`);
      } else {
        console.debug(`\u2705 Registered explicit-use mw: ${regKey}@${hostFynApp.version}`);
      }
      captureEvent(tel, "registered", { key: regKey, version: hostFynApp.version, autoApply: autoApplyScope.length > 0 });
    };
    const hasScannedModule = (scanCacheKey) => scannedModules.has(scanCacheKey);
    const resolveFromVersionMap = (versionMap, regKey, wanted) => {
      const fallback = versionMap.default;
      if (!wanted || wanted === "*" || wanted.trim() === "") {
        return fallback;
      }
      if (wanted !== "default" && versionMap[wanted]) {
        return versionMap[wanted];
      }
      const registered = Object.keys(versionMap).filter((key) => key !== "default");
      if (!isSupportedRange(wanted)) {
        console.warn(
          `\u26A0\uFE0F Middleware '${regKey}': '${wanted}' is not a version range this kernel can read (registered: ${registered.join(", ") || "none"}). Falling back to the default version (${fallback?.hostFynApp.version ?? "none"}).`
        );
        return fallback;
      }
      const best = maxSatisfying(registered, wanted);
      if (best) {
        return versionMap[best];
      }
      console.warn(
        `\u26A0\uFE0F Middleware version mismatch for '${regKey}': asked for '${wanted}', but the registered version(s) are ${registered.join(", ") || "none"}. Falling back to the default version (${fallback?.hostFynApp.version ?? "none"}), so this FynApp will run a version of the middleware it did not ask for.`
      );
      return fallback;
    };
    return {
      registerMiddleware,
      getMiddleware(name, provider, opts) {
        const wanted = opts?.version;
        if (provider) {
          const key = `${provider}::${name}`;
          const versionMap = middlewares[key];
          if (versionMap) {
            const mwReg = resolveFromVersionMap(versionMap, key, wanted);
            if (mwReg) {
              return mwReg;
            }
          }
        }
        const matches = [];
        for (const key of Object.keys(middlewares)) {
          if (key.endsWith(`::${name}`)) {
            matches.push(key);
          }
        }
        for (const key of matches) {
          const mwReg = resolveFromVersionMap(middlewares[key], key, wanted);
          if (mwReg) {
            if (matches.length > 1) {
              console.error(
                `\u274C Middleware '${name}' is registered by more than one provider (${matches.join(", ")}), and this lookup named no provider, so the kernel used '${key}'. Name the provider on the middleware declaration to pin which one runs.`
              );
            }
            return mwReg;
          }
        }
        return DummyMiddlewareReg;
      },
      getAutoApply: () => autoApply,
      scanAndRegisterMiddleware(fynApp, exposeName, exposedModule) {
        const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;
        if (hasScannedModule(scanCacheKey)) {
          console.debug(
            `\u23ED\uFE0F  Skipping middleware scan for '${exposeName}' - already scanned for`,
            fynApp.name,
            fynApp.version
          );
          return [];
        }
        scannedModules.add(scanCacheKey);
        const mwExports = [];
        for (const [exportName, exportValue] of Object.entries(exposedModule)) {
          if (exportName.startsWith(MIDDLEWARE_EXPORT_PREFIX)) {
            const mw = exportValue;
            const mwName = mw.name;
            registerMiddleware({
              regKey: `${fynApp.name}::${mwName}`,
              fullKey: `${fynApp.name}@${fynApp.version}::${mwName}`,
              hostFynApp: fynApp,
              exposeName,
              exportName,
              mw
            });
            mwExports.push(exportName);
          }
        }
        console.debug(
          `\u2705 Expose module '${exposeName}' loaded for`,
          fynApp.name,
          fynApp.version,
          mwExports.length > 0 ? "middlewares registered:" : "",
          mwExports.join(", ")
        );
        captureEvent(tel, "scan.completed", { app: fynApp.name, expose: exposeName, count: mwExports.length });
        return mwExports;
      },
      initializeFromRuntime(runtime) {
        if (runtime.middlewares) {
          middlewares = runtime.middlewares;
        }
        if (runtime.autoApply) {
          autoApply = runtime.autoApply;
        }
      },
      exportToRuntime: () => ({
        middlewares,
        autoApply
      }),
      clear() {
        middlewares = {};
        autoApply = void 0;
        scannedModules.clear();
        ambiguousDefaultWarned.clear();
      }
    };
  };

  const noOpFynUnit = {
    initialize: () => ({ status: "ready" }),
    execute: () => {
    }
  };

  var __defProp$1 = Object.defineProperty;
  var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
  const KernelErrorCode = {
    DEPENDENCY_NOT_FOUND: 1004,
    // Middleware Errors (2xxx)
    MIDDLEWARE_NOT_FOUND: 2001,
    MIDDLEWARE_SETUP_FAILED: 2002,
    MIDDLEWARE_APPLY_FAILED: 2003,
    MIDDLEWARE_FILTER_ERROR: 2004};
  class KernelError extends Error {
    constructor(code, message, options) {
      super(message);
      __publicField$1(this, "code");
      __publicField$1(this, "context");
      __publicField$1(this, "cause");
      this.name = "KernelError";
      this.code = code;
      this.context = options?.context;
      this.cause = options?.cause;
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }
    /**
     * Get a formatted error message with context
     */
    toDetailedString() {
      let result = `[${this.name}:${this.code}] ${this.message}`;
      if (this.context) {
        result += `
Context: ${JSON.stringify(this.context, null, 2)}`;
      }
      if (this.cause) {
        result += `
Caused by: ${this.cause.message}`;
      }
      return result;
    }
  }
  function defineErrorClass(name) {
    return class extends KernelError {
      constructor(code, message, options) {
        const { cause, ...context } = options ?? {};
        super(code, message, { context, cause });
        this.name = name;
      }
    };
  }
  const ModuleLoadError = defineErrorClass("ModuleLoadError");
  const MiddlewareError = defineErrorClass("MiddlewareError");
  function ok(value) {
    return { success: true, value };
  }
  function err(error) {
    return { success: false, error };
  }

  function deferKeyOf(ccs) {
    return ccs.map((c) => c.reg.fullKey).sort().join("|");
  }
  function middlewareFailure(code, summary, mwReg, fynApp, error) {
    const cause = error instanceof Error ? error : void 0;
    const mwError = new MiddlewareError(code, `${summary}: ${cause ? cause.message : String(error)}`, {
      middlewareName: mwReg.mw.name,
      provider: mwReg.hostFynApp.name,
      fynAppName: fynApp.name,
      cause
    });
    console.error(`\u274C ${mwError.message}`);
    return mwError;
  }
  const MiddlewareExecutor = function(telemetry) {
    const tel = telemetry ?? noOpTelemetry;
    const middlewareReady = /* @__PURE__ */ new Map();
    let deferInvoke = [];
    const initializedRuntimes = /* @__PURE__ */ new WeakSet();
    const markDeferResumeMode = (ccs, resumeMode) => {
      const key = deferKeyOf(ccs);
      for (const item of deferInvoke) {
        if (item.key === key) {
          item.resumeMode = resumeMode;
        }
      }
    };
    const setMiddlewareReady = (fullKey, share) => {
      middlewareReady.set(fullKey, share);
    };
    const checkSingleMiddlewareReady = (cc) => {
      if (middlewareReady.has(cc.reg.fullKey)) {
        cc.runtime.share = middlewareReady.get(cc.reg.fullKey);
        cc.status = "ready";
        return true;
      }
      return false;
    };
    const checkMiddlewareReady = (ccs) => {
      return ccs.map((cc) => checkSingleMiddlewareReady(cc)).every(Boolean);
    };
    const checkDeferCalls = (status, ccs) => {
      if (status === "defer") {
        if (checkMiddlewareReady(ccs)) {
          return "retry";
        }
        const incomingKey = deferKeyOf(ccs);
        const exists = deferInvoke.some((d) => d.key === incomingKey);
        if (!exists) {
          deferInvoke.push({
            callContexts: ccs,
            resumeMode: "full",
            key: incomingKey
          });
        }
        return "defer";
      }
      return "ready";
    };
    const processReadyMiddleware = (readyKey, share) => {
      setMiddlewareReady(readyKey, share);
      const resumes = [];
      const waiting = [];
      for (const group of deferInvoke) {
        const allReady = group.callContexts.map((deferCC) => {
          if (deferCC.reg.fullKey === readyKey) {
            deferCC.runtime.share = share;
            deferCC.status = "ready";
          }
          return deferCC.status === "ready" || deferCC.status === "skip";
        }).every(Boolean);
        (allReady ? resumes : waiting).push(group);
      }
      deferInvoke = waiting;
      return { resumes };
    };
    const validateRetryCount = (ccs, tries) => {
      if (tries > 1) {
        const mwError = new MiddlewareError(
          KernelErrorCode.MIDDLEWARE_SETUP_FAILED,
          `Middleware setup failed after 2 tries for ${ccs.map((cc) => cc.reg.regKey).join(", ")}`,
          {
            middlewareName: ccs[0]?.reg.mw.name,
            provider: ccs[0]?.reg.hostFynApp.name,
            fynAppName: ccs[0]?.fynApp.name
          }
        );
        console.error(`\u{1F6A8} ${mwError.message}`);
        throw mwError;
      }
    };
    const setupMiddlewares = async (ccs, signalReady) => {
      let middlewareSetupStatus = "ready";
      let hasDeferredMiddleware = false;
      for (const cc of ccs) {
        const { fynApp, reg } = cc;
        const mw = reg.mw;
        checkSingleMiddlewareReady(cc);
        if (mw.setup) {
          console.debug("\u{1F680} Invoking middleware", reg.regKey, "setup for", fynApp.name, fynApp.version);
          const result = await mw.setup(cc);
          captureEvent(tel, "setup.completed", { mw: reg.regKey, app: fynApp.name });
          if (result?.status === "ready" && !middlewareReady.has(cc.reg.fullKey)) {
            if (signalReady) {
              await signalReady(cc, result?.share);
            }
          }
          if (result?.status === "defer") {
            middlewareSetupStatus = "defer";
            hasDeferredMiddleware = true;
          }
          checkSingleMiddlewareReady(cc);
        }
      }
      return { middlewareSetupStatus, hasDeferredMiddleware };
    };
    const initializeFynUnit = async (ccs, fynUnit, fynApp, runtime, providerModeRegistrar, skipFynUnit) => {
      if (skipFynUnit || !fynUnit.initialize) {
        return { allowDegraded: false, initDeferStatus: "ready" };
      }
      if (initializedRuntimes.has(runtime)) {
        return { allowDegraded: false, initDeferStatus: "ready" };
      }
      console.debug("\u{1F680} Invoking unit.initialize for", fynApp.name, fynApp.version);
      const result = await fynUnit.initialize(runtime);
      initializedRuntimes.add(runtime);
      const allowDegraded = Boolean(result?.deferOk);
      if (result?.mode && providerModeRegistrar) {
        for (const cc of ccs) {
          providerModeRegistrar(fynApp.name, cc.reg.mw.name, result.mode);
        }
        console.debug(`\u{1F4DD} ${fynApp.name} registered as ${result.mode} for middleware(s)`);
      }
      const initDeferStatus = checkDeferCalls(result?.status, ccs);
      return { allowDegraded, initDeferStatus };
    };
    const applyReadyMiddlewares = async (ccs, fynApp) => {
      for (const cc of ccs) {
        if (cc.status !== "ready") continue;
        const mw = cc.reg.mw;
        if (!mw.apply) continue;
        console.debug("\u{1F680} Invoking middleware", cc.reg.regKey, "apply for", fynApp.name, fynApp.version);
        await mw.apply(cc);
      }
    };
    const executeWithOverride = async (fynUnit, fynApp, runtime, kernel, autoApply) => {
      const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply);
      let didExecute = false;
      if (executionOverride) {
        await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel);
        didExecute = true;
      } else if (fynUnit.execute) {
        console.debug("\u{1F680} Invoking unit.execute for", fynApp.name, fynApp.version);
        await fynUnit.execute(runtime);
        didExecute = true;
      }
      if (didExecute) {
        captureEvent(tel, "execute.completed", { app: fynApp.name, override: !!executionOverride });
      }
    };
    const callMiddlewares = async (ccs, options = {}, tries = 0) => {
      if (ccs.length === 0) {
        console.debug("\u26A0\uFE0F No middleware contexts to call, skipping middleware setup");
        return "ready";
      }
      if (tries === 0) {
        captureEvent(tel, "call.started", { count: ccs.length, app: ccs[0]?.fynApp?.name });
      }
      validateRetryCount(ccs, tries);
      const { middlewareSetupStatus, hasDeferredMiddleware } = await setupMiddlewares(ccs, options.signalReady);
      const fynUnit = ccs[0].fynUnit;
      const fynApp = ccs[0].fynApp;
      const runtime = ccs[0].runtime;
      const postSetupStatus = checkDeferCalls(middlewareSetupStatus, ccs);
      if (postSetupStatus === "retry") {
        return await callMiddlewares(ccs, options, tries + 1);
      }
      const { allowDegraded, initDeferStatus } = await initializeFynUnit(
        ccs,
        fynUnit,
        fynApp,
        runtime,
        options.providerModeRegistrar,
        options.skipFynUnit
      );
      if (initDeferStatus === "defer" && !allowDegraded) {
        captureEvent(tel, "call.deferred", { app: fynApp?.name });
        return "defer";
      }
      if (initDeferStatus === "retry") {
        return await callMiddlewares(ccs, options, tries + 1);
      }
      if (hasDeferredMiddleware && postSetupStatus === "defer" && !allowDegraded && !options.skipFynUnit) {
        captureEvent(tel, "call.deferred", { app: fynApp?.name });
        return "defer";
      }
      await applyReadyMiddlewares(ccs, fynApp);
      if (options.skipFynUnit) {
        return "ready";
      }
      if (allowDegraded && postSetupStatus === "defer") {
        markDeferResumeMode(ccs, "middleware_only");
      }
      await executeWithOverride(fynUnit, fynApp, runtime, ccs[0].kernel, options.autoApply);
      return "ready";
    };
    const unusableMiddlewareMeta = (fynApp, meta) => {
      const shape = meta && typeof meta === "object" ? Object.entries(meta).map(([k, v]) => `${k}: ${v === null ? "null" : typeof v}`).join(", ") : typeof meta;
      return new MiddlewareError(
        KernelErrorCode.MIDDLEWARE_NOT_FOUND,
        `${fynApp.name} declared a middleware the kernel cannot read: {${shape}}. \`mw\` must be the id string that rollup-plugin-federation writes for an import tagged \`with { type: "fynapp-middleware" }\`. Getting a Promise here means those import attributes were stripped before the plugin saw them - check that the build's TypeScript transform preserves them (create-fynapp's setupTypeScriptPlugins does).`,
        { fynAppName: fynApp.name }
      );
    };
    const useMiddlewareOnFynUnit = async (fynUnit, fynApp, kernel, createRuntime, getMiddleware, loadMiddlewareFromDependency, autoApply) => {
      if (!fynUnit.__middlewareMeta) {
        return "";
      }
      const runtime = createRuntime();
      console.debug("\u{1F50D} Processing middleware metadata:", fynUnit.__middlewareMeta);
      const ccs = [];
      for (const meta of fynUnit.__middlewareMeta) {
        console.debug("\u{1F50D} Processing meta item:", meta);
        let cc = null;
        if (typeof meta === "string") {
          cc = await parseMiddlewareString(
            meta,
            {},
            fynUnit,
            fynApp,
            kernel,
            runtime,
            getMiddleware,
            loadMiddlewareFromDependency
          );
        } else if (meta && typeof meta === "object") {
          console.debug("\u{1F50D} Object format meta:", meta);
          if (meta.mw && typeof meta.mw === "string") {
            cc = await parseMiddlewareString(
              meta.mw,
              meta.config || {},
              fynUnit,
              fynApp,
              kernel,
              runtime,
              getMiddleware,
              loadMiddlewareFromDependency
            );
          } else if (meta.info) {
            const info = meta.info;
            console.debug("\u{1F50D} Legacy format - name:", info.name, "provider:", info.provider);
            const reg = getMiddleware(info.name, info.provider, { version: info.version });
            if (reg.regKey === "") {
              console.debug("\u274C No middleware found for", info.name, info.provider);
              continue;
            }
            cc = {
              meta,
              fynUnit,
              fynApp,
              reg,
              kernel,
              runtime,
              status: ""
            };
          } else {
            throw unusableMiddlewareMeta(fynApp, meta);
          }
        } else {
          throw unusableMiddlewareMeta(fynApp, meta);
        }
        if (cc) {
          ccs.push(cc);
        } else {
          console.error(
            `\u26A0\uFE0F ${fynApp.name}: no middleware resolved for declaration`,
            meta,
            "- this FynApp will not execute unless another declaration resolves"
          );
        }
      }
      if (fynUnit.__middlewareMeta.length > 0 && ccs.length === 0) {
        console.error(
          `\u274C ${fynApp.name} declared ${fynUnit.__middlewareMeta.length} middleware(s) and resolved none, so its execute will not run and it will render nothing`
        );
      }
      console.debug("\u2705 Created", ccs.length, "middleware call contexts");
      return callMiddlewares(ccs, { autoApply });
    };
    const applyAutoScopeMiddlewares = async (fynApp, fynUnit, kernel, autoApply, createRuntime, signalReady) => {
      const errors = [];
      console.log(`\u{1F3AF} Auto-apply check for ${fynApp.name}: autoApply exists?`, !!autoApply);
      if (!autoApply) {
        console.log(`\u23ED\uFE0F No auto-apply middlewares registered yet for ${fynApp.name}`);
        return errors;
      }
      const targetMiddlewares = getTargetMiddlewares(fynApp, autoApply);
      for (const mwReg of targetMiddlewares) {
        if (mwReg.mw.shouldApply) {
          try {
            const shouldApply = mwReg.mw.shouldApply(fynApp);
            if (!shouldApply) {
              console.debug(`\u23ED\uFE0F Skipping middleware ${mwReg.regKey} for ${fynApp.name} (filtered out)`);
              continue;
            }
          } catch (error) {
            errors.push(
              middlewareFailure(
                KernelErrorCode.MIDDLEWARE_FILTER_ERROR,
                `Error in shouldApply for ${mwReg.regKey}`,
                mwReg,
                fynApp,
                error
              )
            );
            continue;
          }
        }
        console.debug(
          `\u{1F504} Auto-applying ${mwReg.mw.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`
        );
        const unit = fynUnit || noOpFynUnit;
        const context = createMiddlewareCallContext(mwReg, unit, fynApp, createRuntime(), kernel, {}, "ready");
        try {
          if (mwReg.mw.setup) {
            const result = await mwReg.mw.setup(context);
            if (result?.status === "ready" && signalReady) {
              await signalReady(context, result.share);
            }
          }
          if (mwReg.mw.apply) {
            await mwReg.mw.apply(context);
          }
        } catch (error) {
          tel.capErr(
            "auto_apply.failed",
            { mw: mwReg.regKey, app: fynApp.name },
            error
          );
          errors.push(
            middlewareFailure(
              KernelErrorCode.MIDDLEWARE_APPLY_FAILED,
              `Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}`,
              mwReg,
              fynApp,
              error
            )
          );
        }
      }
      return errors;
    };
    const clear = () => {
      middlewareReady.clear();
      deferInvoke = [];
    };
    return {
      middlewareReady,
      get deferInvoke() {
        return deferInvoke;
      },
      setMiddlewareReady,
      checkSingleMiddlewareReady,
      checkMiddlewareReady,
      checkDeferCalls,
      processReadyMiddleware,
      callMiddlewares,
      useMiddlewareOnFynUnit,
      applyAutoScopeMiddlewares,
      clear
    };
  };

  var __defProp = Object.defineProperty;
  var __typeError$1 = (msg) => {
    throw TypeError(msg);
  };
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
  var __accessCheck$1 = (obj, member, msg) => member.has(obj) || __typeError$1("Cannot " + msg);
  var __privateGet$1 = (obj, member, getter) => (__accessCheck$1(obj, member, "read from private field"), member.get(obj));
  var __privateAdd$1 = (obj, member, value) => member.has(obj) ? __typeError$1("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet$1 = (obj, member, value, setter) => (__accessCheck$1(obj, member, "write to private field"), member.set(obj, value), value);
  var _observers, _disposed;
  class ObservableState {
    constructor(initial) {
      __publicField(this, "value");
      __privateAdd$1(this, _observers, /* @__PURE__ */ new Set());
      __privateAdd$1(this, _disposed, false);
      this.value = initial;
    }
    /** Get current value */
    get() {
      if (__privateGet$1(this, _disposed)) {
        throw new Error("Cannot get value from disposed ObservableState");
      }
      return this.value;
    }
    /** Set new value and notify observers */
    set(value) {
      if (__privateGet$1(this, _disposed)) return;
      const prev = this.value;
      this.value = value;
      __privateGet$1(this, _observers).forEach((fn) => {
        try {
          fn(value, prev);
        } catch (e) {
          console.error("ObservableState observer error:", e);
        }
      });
    }
    /** Functional update */
    update(fn) {
      this.set(fn(this.value));
    }
    /** Subscribe to changes. Callback is called immediately with current value. Returns unsubscribe function. */
    subscribe(fn) {
      if (__privateGet$1(this, _disposed)) {
        throw new Error("Cannot subscribe to disposed ObservableState");
      }
      fn(this.value, void 0);
      __privateGet$1(this, _observers).add(fn);
      return () => __privateGet$1(this, _observers).delete(fn);
    }
    /** Dispose state and clear all observers */
    dispose() {
      __privateSet$1(this, _disposed, true);
      __privateGet$1(this, _observers).clear();
    }
  }
  _observers = new WeakMap();
  _disposed = new WeakMap();

  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);
  var _parent, _states, _pendingWaiters;
  const _MiddlewareStateRegistry = class _MiddlewareStateRegistry {
    constructor(parent) {
      __privateAdd(this, _parent);
      __privateAdd(this, _states, /* @__PURE__ */ new Map());
      __privateAdd(this, _pendingWaiters, /* @__PURE__ */ new Map());
      __privateSet(this, _parent, parent);
    }
    /**
     * Provide/register state in this scope.
     * @param key Unique key for this state
     * @param initial Initial value
     * @returns ObservableState for updates
     */
    provide(key, initial) {
      if (__privateGet(this, _states).has(key)) {
        return __privateGet(this, _states).get(key);
      }
      const state = new ObservableState(initial);
      __privateGet(this, _states).set(key, state);
      const waiters = __privateGet(this, _pendingWaiters).get(key);
      if (waiters) {
        waiters.forEach(({ resolve }) => resolve(state));
        __privateGet(this, _pendingWaiters).delete(key);
      }
      return state;
    }
    /**
     * Lookup state by key. Walks up hierarchy if not found locally.
     * @param key State key to find
     * @returns ObservableState or undefined if not found
     */
    lookup(key) {
      if (__privateGet(this, _states).has(key)) {
        return __privateGet(this, _states).get(key);
      }
      return __privateGet(this, _parent)?.lookup(key);
    }
    /**
     * Check if state exists in this scope or parent scopes.
     */
    has(key) {
      if (__privateGet(this, _states).has(key)) return true;
      return __privateGet(this, _parent)?.has(key) ?? false;
    }
    /**
     * Async wait for state to be provided.
     * @param key State key to wait for
     * @param timeout Timeout in ms (default 30000)
     * @returns Promise resolving to ObservableState
     */
    waitFor(key, timeout = 3e4) {
      const existing = this.lookup(key);
      if (existing) {
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve: (state) => {
            clearTimeout(timer);
            resolve(state);
          },
          reject
        };
        const timer = setTimeout(() => {
          const waiters2 = __privateGet(this, _pendingWaiters).get(key);
          const idx = waiters2?.indexOf(waiter) ?? -1;
          if (idx >= 0) {
            waiters2.splice(idx, 1);
            if (waiters2.length === 0) __privateGet(this, _pendingWaiters).delete(key);
          }
          reject(new Error(`Timeout waiting for state: ${key}`));
        }, timeout);
        const waiters = __privateGet(this, _pendingWaiters).get(key);
        if (waiters) {
          waiters.push(waiter);
        } else {
          __privateGet(this, _pendingWaiters).set(key, [waiter]);
        }
      });
    }
    /**
     * Remove state from this scope.
     * @param key State key to remove
     * @returns true if removed, false if not found
     */
    remove(key) {
      const state = __privateGet(this, _states).get(key);
      if (state) {
        state.dispose();
        __privateGet(this, _states).delete(key);
        return true;
      }
      return false;
    }
    /**
     * Clear all state in this scope.
     */
    clear() {
      __privateGet(this, _states).forEach((state) => state.dispose());
      __privateGet(this, _states).clear();
      __privateGet(this, _pendingWaiters).forEach((waiters, key) => {
        waiters.forEach(({ reject }) => reject(new Error(`Registry cleared while waiting for: ${key}`)));
      });
      __privateGet(this, _pendingWaiters).clear();
    }
    /**
     * Create a child scope that inherits from this registry.
     */
    createScope() {
      return new _MiddlewareStateRegistry(this);
    }
    /**
     * Get all keys in this scope (not including parent).
     */
    keys() {
      return Array.from(__privateGet(this, _states).keys());
    }
    /**
     * Get parent registry if exists.
     */
    getParent() {
      return __privateGet(this, _parent);
    }
  };
  _parent = new WeakMap();
  _states = new WeakMap();
  _pendingWaiters = new WeakMap();
  let MiddlewareStateRegistry = _MiddlewareStateRegistry;

  function install(kernel, hooks) {
    const k = kernel;
    k.mwMgr = new MiddlewareManager(hooks.tel.scope("middleware"));
    k.middlewareExecutor = new MiddlewareExecutor(hooks.tel.scope("executor"));
    k.mwMgr.initializeFromRuntime(hooks.rt());
    const globalRegistry = new MiddlewareStateRegistry();
    const regionRegistries = /* @__PURE__ */ new Map();
    const autoApply = () => k.mwMgr.getAutoApply();
    const signalReady = async (cc, share) => k.signalMiddlewareReady(cc, { share });
    k.registerMiddleware = (mwReg) => {
      k.mwMgr.registerMiddleware(mwReg);
      const exported = k.mwMgr.exportToRuntime();
      const rt = hooks.rt();
      rt.middlewares = exported.middlewares;
      rt.autoApply = exported.autoApply;
    };
    k.getMiddleware = (name, provider, opts) => k.mwMgr.getMiddleware(name, provider, opts);
    k.getMiddlewareRegistry = (scope) => {
      if (scope === "global") {
        return globalRegistry;
      }
      let registry = regionRegistries.get(scope.region);
      if (!registry) {
        registry = globalRegistry.createScope();
        regionRegistries.set(scope.region, registry);
      }
      return registry;
    };
    k.signalMiddlewareReady = async (cc, detail = {}) => {
      await k.emitAsync(
        new CustomEvent("MIDDLEWARE_READY", {
          detail: {
            name: detail.name || cc.reg.mw.name,
            status: detail.status || "ready",
            share: detail.share,
            cc
          }
        })
      );
    };
    k.events.on("MIDDLEWARE_READY", async (event) => {
      const { name, status, cc, share } = event.detail;
      const { resumes } = k.middlewareExecutor.processReadyMiddleware(cc.reg.fullKey, share || {});
      for (const resume of resumes) {
        await k.middlewareExecutor.callMiddlewares(resume.callContexts, {
          signalReady,
          providerModeRegistrar: hooks.providerMode,
          autoApply: hooks.rt().autoApply,
          skipFynUnit: resume.resumeMode === "middleware_only" ? true : void 0
        });
      }
      console.debug(
        `\u2705 Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`
      );
    });
    const loadMiddlewareFromDependency = k.loadMiddlewareFromDependency = async (packageName, middlewarePath) => {
      console.debug(`\u{1F4E6} Loading middleware from dependency: ${packageName}/${middlewarePath}`);
      const dependencyApp = hooks.findApp(packageName);
      if (!dependencyApp) {
        const error = new ModuleLoadError(
          KernelErrorCode.DEPENDENCY_NOT_FOUND,
          `Dependency package ${packageName} not found in runtime`,
          { fynAppName: packageName, exposeName: middlewarePath }
        );
        hooks.tel.scope("loader").capErr(
          "dependency.not_found",
          { package: packageName, path: middlewarePath },
          error
        );
        console.debug(`\u274C ${error.message}`);
        return err(error);
      }
      const lastSlashIndex = middlewarePath.lastIndexOf("/");
      const exposeModule = lastSlashIndex > 0 ? middlewarePath.substring(0, lastSlashIndex) : middlewarePath;
      const result = await hooks.loadExpose(dependencyApp, `./${exposeModule}`);
      return result.success ? ok(void 0) : err(result.error);
    };
    hooks.init.push((data) => k.mwMgr.initializeFromRuntime(data));
    hooks.exposeLoaded.push((fynApp, exposeName, exposedModule) => {
      k.mwMgr.scanAndRegisterMiddleware(fynApp, exposeName, exposedModule);
    });
    hooks.basicsLoaded.push(async (fynApp) => {
      const manifest = fynApp.entry.container.__FYNAPP_MANIFEST__ || null;
      const importExposed = manifest?.["import-exposed"];
      if (!importExposed || typeof importExposed !== "object") {
        return;
      }
      console.debug("\u{1F4E6} Loading middleware dependencies for", fynApp.name);
      const loadErrors = [];
      for (const [packageName, modules] of Object.entries(importExposed)) {
        if (!modules || typeof modules !== "object") continue;
        for (const [modulePath, moduleInfo] of Object.entries(modules)) {
          if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
            console.debug(`\u{1F4E6} Proactively loading mw: ${packageName}/${modulePath}`);
            const result = await loadMiddlewareFromDependency(packageName, modulePath);
            if (!result.success) {
              loadErrors.push(result.error);
            }
          }
        }
      }
      if (loadErrors.length > 0) {
        console.debug(
          `\u26A0\uFE0F ${loadErrors.length} middleware dependency load error(s) for ${fynApp.name}:`,
          loadErrors.map((e) => e.message)
        );
      }
    });
    hooks.beforeMain.push(async (fynApp) => {
      for (const exposeName of Object.keys(fynApp.entry.container.$E)) {
        if (exposeName.startsWith(MIDDLEWARE_EXPOSE_PREFIX)) {
          await hooks.loadExpose(fynApp, exposeName);
        }
      }
    });
    hooks.runUnit.push(async (fynApp, fynUnit) => {
      const createRuntime = () => hooks.runtimeFor(fynApp);
      const middlewareErrors = await k.middlewareExecutor.applyAutoScopeMiddlewares(
        fynApp,
        fynUnit,
        k,
        autoApply(),
        createRuntime,
        signalReady
      );
      if (middlewareErrors.length > 0) {
        console.warn(
          `\u26A0\uFE0F ${middlewareErrors.length} middleware error(s) during bootstrap of ${fynApp.name}:`,
          middlewareErrors.map((e) => e.toDetailedString())
        );
      }
      if (fynUnit.__middlewareMeta && fynUnit.__middlewareMeta.length > 0) {
        await k.middlewareExecutor.useMiddlewareOnFynUnit(
          fynUnit,
          fynApp,
          k,
          createRuntime,
          k.getMiddleware,
          async (packageName, middlewarePath) => {
            await loadMiddlewareFromDependency(packageName, middlewarePath);
          },
          autoApply()
        );
        return true;
      }
      const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply());
      if (executionOverride) {
        await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, createRuntime(), k);
        return true;
      }
      return false;
    });
  }
  const middlewareAddon = { name: "middleware", install };

  function installGlobal(addon) {
    const kernel = globalThis.fynMeshKernel;
    if (!kernel?.use) {
      throw new Error(
        `FynMesh add-on "${addon.name}" loaded before the kernel: load the core kernel bundle first`
      );
    }
    kernel.use(addon);
  }

  installGlobal(middlewareAddon);

})();
