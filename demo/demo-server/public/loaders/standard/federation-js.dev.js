(function (exports) {
  'use strict';

  // @ts-nocheck
  /*
    MIT License http://www.opensource.org/licenses/mit-license.php
    Author Tobias Koppers @sokra
  */
  /**
   * @param {string} str version string
   * @returns {(string|number|undefined|[])[]} parsed version
   */
  const parseVersion = (str) => {
      var splitAndConvert = function (str) {
          return str.split(".").map(function (item) {
              // eslint-disable-next-line eqeqeq
              return +item == item ? +item : item;
          });
      };
      var match = /^([^-+]+)?(?:-([^+]+))?(?:\+(.+))?$/.exec(str);
      var ver = match[1]
          ? splitAndConvert(match[1])
          : [];
      if (match[2]) {
          ver.length++;
          ver.push.apply(ver, splitAndConvert(match[2]));
      }
      if (match[3]) {
          ver.push([]);
          ver.push.apply(ver, splitAndConvert(match[3]));
      }
      return ver;
  };
  /* eslint-enable eqeqeq */
  /**
   * A single comparator, with its operator folded in: `^19.0.0`, `>=1.2`, `1.x`, `*`.
   */
  const COMPARATOR = /^(?:[v=]|[<>]=?|\^|~)?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  /** An operator that npm allows to stand apart from its version: `>= 1.2.3`. */
  const BARE_OPERATOR = /^(?:[v=]|[<>]=?|\^|~)$/;
  /**
   * Is `str` a semver range, as opposed to some other kind of dependency spec?
   *
   * `parseRange` is total - it never throws, and for a non-range string it returns
   * a range that simply satisfies nothing. That makes a `file:`/`workspace:`/
   * `link:`/`npm:` spec, a dist-tag like `latest`, or a git URL indistinguishable
   * at the call site from a range that genuinely excludes every provider, and the
   * mismatch is reported against a "required version" the author never wrote.
   * Callers that accept arbitrary package.json dependency specs use this to tell
   * the two apart before treating a string as a range.
   *
   * Deliberately conservative: anything not recognised is reported as "not a
   * range", so a caller falls back to a range it does trust rather than silently
   * widening resolution.
   *
   * @param str - the string to test
   * @returns true when every comparator in every `||` clause parses as semver
   */
  const isValidRange = (str) => {
      if (!str) {
          return false;
      }
      return str.split("||").every((clause) => {
          // hyphen ranges ("1.2.3 - 2.3.4") keep their bounds as ordinary comparators
          const tokens = clause
              .trim()
              .split(/\s+/)
              .filter((token) => token && token !== "-");
          return (tokens.length > 0 &&
              tokens.every((token) => COMPARATOR.test(token) || BARE_OPERATOR.test(token)) &&
              tokens.some((token) => COMPARATOR.test(token)));
      });
  };
  /**
   * @param {string} str range string
   * @returns {SemVerRange} parsed range
   */
  const parseRange = (str) => {
      const splitAndConvert = (str) => {
          return str
              .split(".")
              .map((item) => (item !== "NaN" && `${+item}` === item ? +item : item));
      };
      // see https://docs.npmjs.com/misc/semver#range-grammar for grammar
      const parsePartial = (str) => {
          const match = /^([^-+]+)?(?:-([^+]+))?(?:\+(.+))?$/.exec(str);
          /** @type {(string|number|undefined|[])[]} */
          const ver = match[1] ? [0, ...splitAndConvert(match[1])] : [0];
          if (match[2]) {
              ver.length++;
              ver.push.apply(ver, splitAndConvert(match[2]));
          }
          // remove trailing any matchers
          let last = ver[ver.length - 1];
          while (ver.length &&
              (last === undefined || /^[*xX]$/.test(/** @type {string} */ last))) {
              ver.pop();
              last = ver[ver.length - 1];
          }
          return ver;
      };
      const toFixed = (range) => {
          if (range.length === 1) {
              // Special case for "*" is "x.x.x" instead of "="
              return [0];
          }
          else if (range.length === 2) {
              // Special case for "1" is "1.x.x" instead of "=1"
              return [1, ...range.slice(1)];
          }
          else if (range.length === 3) {
              // Special case for "1.2" is "1.2.x" instead of "=1.2"
              return [2, ...range.slice(1)];
          }
          else {
              return [range.length, ...range.slice(1)];
          }
      };
      const negate = (range) => {
          return [-range[0] - 1, ...range.slice(1)];
      };
      const parseSimple = (str) => {
          // simple       ::= primitive | partial | tilde | caret
          // primitive    ::= ( '<' | '>' | '>=' | '<=' | '=' | '!' ) ( ' ' ) * partial
          // tilde        ::= '~' ( ' ' ) * partial
          // caret        ::= '^' ( ' ' ) * partial
          const match = /^(\^|~|<=|<|>=|>|=|v|!)/.exec(str);
          const start = match ? match[0] : "";
          const remainder = parsePartial(start.length ? str.slice(start.length).trim() : str.trim());
          switch (start) {
              case "^":
                  if (remainder.length > 1 && remainder[1] === 0) {
                      if (remainder.length > 2 && remainder[2] === 0) {
                          return [3, ...remainder.slice(1)];
                      }
                      return [2, ...remainder.slice(1)];
                  }
                  return [1, ...remainder.slice(1)];
              case "~":
                  return [2, ...remainder.slice(1)];
              case ">=":
                  return remainder;
              case "=":
              case "v":
              case "":
                  return toFixed(remainder);
              case "<":
                  return negate(remainder);
              case ">": {
                  // and( >=, not( = ) ) => >=, =, not, and
                  const fixed = toFixed(remainder);
                  // eslint-disable-next-line no-sparse-arrays
                  return [, fixed, 0, remainder, 2];
              }
              case "<=":
                  // or( <, = ) => <, =, or
                  // eslint-disable-next-line no-sparse-arrays
                  return [, toFixed(remainder), negate(remainder), 1];
              case "!": {
                  // not =
                  const fixed = toFixed(remainder);
                  // eslint-disable-next-line no-sparse-arrays
                  return [, fixed, 0];
              }
              default:
                  throw new Error("Unexpected start value");
          }
      };
      const combine = (items, fn) => {
          if (items.length === 1)
              return items[0];
          const arr = [];
          for (const item of items.slice().reverse()) {
              if (0 in item) {
                  arr.push(item);
              }
              else {
                  arr.push(...item.slice(1));
              }
          }
          // eslint-disable-next-line no-sparse-arrays
          return [, ...arr, ...items.slice(1).map(() => fn)];
      };
      const parseRange = (str) => {
          // range      ::= hyphen | simple ( ' ' ( ' ' ) * simple ) * | ''
          // hyphen     ::= partial ( ' ' ) * ' - ' ( ' ' ) * partial
          const items = str.split(/\s+-\s+/);
          if (items.length === 1) {
              const items = str
                  .trim()
                  .split(/(?<=[-0-9A-Za-z])\s+/g)
                  .map(parseSimple);
              return combine(items, 2);
          }
          const a = parsePartial(items[0]);
          const b = parsePartial(items[1]);
          // >=a <=b => and( >=a, or( <b, =b ) ) => >=a, <b, =b, or, and
          // eslint-disable-next-line no-sparse-arrays
          return [, toFixed(b), negate(b), 1, a, 2];
      };
      const parseLogicalOr = (str) => {
          // range-set  ::= range ( logical-or range ) *
          // logical-or ::= ( ' ' ) * '||' ( ' ' ) *
          const items = str.split(/\s*\|\|\s*/).map(parseRange);
          return combine(items, 1);
      };
      return parseLogicalOr(str);
  };
  /* eslint-enable eqeqeq */
  /* eslint-disable eqeqeq */
  /**
   * @param {SemVerRange} range version range
   * @param {string} version the version
   * @returns {boolean} if version satisfy the range
   */
  const satisfy = (range, version) => {
      if (0 in range) {
          version = parseVersion(version);
          var fixCount = /** @type {number} */ range[0];
          // when negated is set it swill set for < instead of >=
          var negated = fixCount < 0;
          if (negated)
              fixCount = -fixCount - 1;
          for (var i = 0, j = 1, isEqual = true;; j++, i++) {
              // cspell:word nequal nequ
              // when isEqual = true:
              // range         version: EOA/object  undefined  number    string
              // EOA                    equal       block      big-ver   big-ver
              // undefined              bigger      next       big-ver   big-ver
              // number                 smaller     block      cmp       big-cmp
              // fixed number           smaller     block      cmp-fix   differ
              // string                 smaller     block      differ    cmp
              // fixed string           smaller     block      small-cmp cmp-fix
              // when isEqual = false:
              // range         version: EOA/object  undefined  number    string
              // EOA                    nequal      block      next-ver  next-ver
              // undefined              nequal      block      next-ver  next-ver
              // number                 nequal      block      next      next
              // fixed number           nequal      block      next      next   (this never happens)
              // string                 nequal      block      next      next
              // fixed string           nequal      block      next      next   (this never happens)
              // EOA end of array
              // equal (version is equal range):
              //   when !negated: return true,
              //   when negated: return false
              // bigger (version is bigger as range):
              //   when fixed: return false,
              //   when !negated: return true,
              //   when negated: return false,
              // smaller (version is smaller as range):
              //   when !negated: return false,
              //   when negated: return true
              // nequal (version is not equal range (> resp <)): return true
              // block (version is in different prerelease area): return false
              // differ (version is different from fixed range (string vs. number)): return false
              // next: continues to the next items
              // next-ver: when fixed: return false, continues to the next item only for the version, sets isEqual=false
              // big-ver: when fixed || negated: return false, continues to the next item only for the version, sets isEqual=false
              // next-nequ: continues to the next items, sets isEqual=false
              // cmp (negated === false): version < range => return false, version > range => next-nequ, else => next
              // cmp (negated === true): version > range => return false, version < range => next-nequ, else => next
              // cmp-fix: version == range => next, else => return false
              // big-cmp: when negated => return false, else => next-nequ
              // small-cmp: when negated => next-nequ, else => return false
              var rangeType = j < range.length ? (typeof range[j])[0] : "";
              var versionValue;
              var versionType;
              // Handles first column in both tables (end of version or object)
              if (i >= version.length ||
                  ((versionValue = version[i]),
                      (versionType = (typeof versionValue)[0]) == "o")) {
                  // Handles nequal
                  if (!isEqual)
                      return true;
                  // Handles bigger
                  if (rangeType == "u")
                      return j > fixCount && !negated;
                  // Handles equal and smaller: (range === EOA) XOR negated
                  return (rangeType == "") != negated; // equal + smaller
              }
              // Handles second column in both tables (version = undefined)
              if (versionType == "u") {
                  if (!isEqual || rangeType != "u") {
                      return false;
                  }
              }
              // switch between first and second table
              else if (isEqual) {
                  // Handle diagonal
                  if (rangeType == versionType) {
                      if (j <= fixCount) {
                          // Handles "cmp-fix" cases
                          if (versionValue != range[j]) {
                              return false;
                          }
                      }
                      else {
                          // Handles "cmp" cases
                          if (negated ? versionValue > range[j] : versionValue < range[j]) {
                              return false;
                          }
                          if (versionValue != range[j])
                              isEqual = false;
                      }
                  }
                  // Handle big-ver
                  else if (rangeType != "s" && rangeType != "n") {
                      if (negated || j <= fixCount)
                          return false;
                      isEqual = false;
                      j--;
                  }
                  // Handle differ, big-cmp and small-cmp
                  else if (j <= fixCount || versionType < rangeType != negated) {
                      return false;
                  }
                  else {
                      isEqual = false;
                  }
              }
              else {
                  // Handles all "next-ver" cases in the second table
                  if (rangeType != "s" && rangeType != "n") {
                      isEqual = false;
                      j--;
                  }
                  // next is applied by default
              }
          }
      }
      /** @type {(boolean | number)[]} */
      var stack = [];
      var p = stack.pop.bind(stack);
      // eslint-disable-next-line no-redeclare
      for (var i = 1; i < range.length; i++) {
          var item = /** @type {SemVerRange | 0 | 1 | 2} */ range[i];
          stack.push(item == 1
              ? p() | p()
              : item == 2
                  ? p() & p()
                  : item
                      ? satisfy(item, version)
                      : !p());
      }
      return !!p();
  };

  const hasDocument = typeof document !== "undefined";
  /**
   *
   * @returns
   */
  function getLastScript() {
      if (hasDocument && document.readyState === "loading") {
          const scripts = document.querySelectorAll("script[src]");
          const lastScript = scripts[scripts.length - 1];
          return lastScript;
      }
      return undefined;
  }
  /**
   *
   * @returns
   */
  function getCurrentScript() {
      return hasDocument && (document.currentScript || getLastScript());
  }
  /**
   *
   * @param id
   * @returns
   */
  function startsWithDotSlash(id) {
      return id && id.startsWith("./");
  }
  /**
   * Push `elem` into the array at `obj[k]`, creating the array if needed.
   *
   * @param obj
   * @param k
   * @param elem
   * @param isDup - predicate identifying an existing entry as a duplicate of
   *   `elem`. Required whenever `elem` is a freshly built object, since the
   *   default check is reference equality and would never match.
   * @returns true if the element was added
   */
  function addElementToArrayInObject(obj, k, elem, isDup) {
      const arr = obj[k] || (obj[k] = []);
      const dup = isDup ? arr.some(isDup) : arr.includes(elem);
      if (dup) {
          return false;
      }
      arr.push(elem);
      return true;
  }
  /**
   *
   * @param obj
   * @returns first key of the object
   */
  function firstObjectKey(obj) {
      return Object.keys(obj)[0];
  }
  /**
   *
   * @param name
   * @returns container id
   */
  function containerNameToId(name) {
      const containerSigPrefix = "__mf_container_";
      if (name.startsWith(containerSigPrefix)) {
          return name;
      }
      return containerSigPrefix + name;
  }
  /**
   *
   * @param T
   * @returns new object
   */
  function createObject() {
      return Object.create(null);
  }

  /**
   * Federation Container class
   */
  class Container {
      /**
       *
       * @param id
       * @param name
       * @param scopeName
       * @param version - version of the container
       * @param federation
       */
      constructor(id, name, scopeName, version = "0.0.0", federation) {
          this.scope = scopeName;
          this.id = id;
          this.name = name;
          this.version = version;
          /*@__MANGLE_PROP__*/
          this.Fed = federation || globalThis.Federation;
          this.$SC = createObject();
          this.$E = createObject();
      }
      /**
       * Gets the version of this container
       * @returns The container version
       */
      getVersion() {
          return this.version;
      }
      /**
       *
       * @param dep
       * @param declare
       * @param metas
       * @returns
       */
      register(dep, declare, metas) {
          this.Fed._checkPendingRegs(this.name);
          return this.Fed.register(this.id, dep, declare, metas, undefined, this);
      }
      /**
       * add share
       */
      _S(key, options, shared) {
          const scope = options.shareScope || this.scope;
          let _sm = this.$SC[key];
          if (!_sm) {
              _sm = this.$SC[key] = {
                  options,
                  rvm: createObject(),
                  versions: createObject(),
              };
          }
          for (const _s of shared) {
              // first entry is chunk bundle and version
              const [_bundle, version] = _s[0];
              if (version) {
                  _sm.versions[version] = { id: _bundle.id };
                  // import === false means consume only shared, do not add it
                  // to the global share scope since this container cannot provide it
                  if (options.import !== false) {
                      this.Fed._S(scope, key, version, _bundle.id, this.name, this.version);
                  }
              }
              const maps = _s.slice(1);
              const _rvm = _sm.rvm;
              for (const _m of maps) {
                  _rvm[_m[0]] = _m[1];
              }
          }
      }
      /**
       * add expose
       */
      _E(key, chunkId) {
          this.$E[key] = chunkId.id;
      }
      /**
       *
       * @param name
       * @returns
       */
      _mfGet(name) {
          const id = this.$E[name] || name;
          const parentUrl = this.Fed.getUrlForId(this.id, this.version);
          return this.Fed.import(id, parentUrl).then((_m) => {
              return () => _m;
          });
      }
      /**
       *
       */
      _mfInit(shareScope) {
          if (this.$SS) {
              console.warn(`container`, this.id, `already initialized`);
              return undefined;
          }
          return (this.$SS = this.Fed._mfInitScope(this.scope, shareScope));
      }
  }

  const _global = globalThis;
  /**
   *
   */
  class FederationJS {
      /**
       *
       * @param System
       */
      constructor(_System) {
          const S = /*@__MANGLE_PROP__*/ (this._System = _System || _global.System);
          const systemJSPrototype = S.constructor.prototype;
          /*@__MANGLE_PROP__*/
          this.sysResolve = systemJSPrototype.resolve;
          /*@__MANGLE_PROP__*/
          this.sysRegister = systemJSPrototype.register;
          /*@__MANGLE_PROP__*/
          this.sysInstantiate = systemJSPrototype.instantiate;
          this.$iU = createObject();
          this.$uI = createObject();
          this.$pC = createObject();
          this.$C = createObject();
          const federation = this;
          systemJSPrototype.resolve = function (id, parentURL, meta) {
              const rd = federation.getRegDefForId(id);
              if (rd) {
                  // module already available and registered with its definitions
                  // so just return the id to do lookup, and not url for fetching
                  if (rd.def) {
                      return id;
                  }
                  console.debug("resolve with id " + id + " to url", id, rd.url, "parentURL", parentURL, "meta", meta);
                  if (rd.url) {
                      return rd.url;
                  }
              }
              const r = federation.resolve(id, parentURL, meta);
              return r;
          };
          systemJSPrototype.instantiate = function (url, _parentURL, _meta) {
              const rd = federation.getRegDefForId(url);
              const def = rd && rd.def;
              if (def) {
                  if (def !== 1) {
                      rd.def = 1;
                      return def;
                  }
                  console.error("reg def already used for", url);
              }
              return federation.sysInstantiate.apply(federation._System, arguments);
          };
          this.$B = createObject();
          this.$SS = createObject();
          this.sharedModuleCache = new Map();
      }
      /**
       * Try to find a container that has the exposed id
       *
       * In the case where some code import an exposed module with the id like "./main", and if
       * that module has other dependencies, then SystemJS will load those using the exposed id
       * as parentURL, in the "./main" form, and this will confused the entire system because
       * SystemJS can't find resolve to a full URL.  So we try to assume that the id is an exposed
       * module, and search all containers that has that exposed id.
       *
       * @param id
       * @returns
       */
      /*@__MANGLE_PROP__*/
      searchContainerForExposedId(id) {
          for (const containerId in this.$C) {
              const containerMap = this.$C[containerId];
              for (const ver in containerMap) {
                  if (ver !== "_") {
                      const container = containerMap[ver];
                      for (const exp in container.$E) {
                          if (container.$E[exp] === id) {
                              return container;
                          }
                      }
                  }
              }
          }
      }
      /**
       * Check if an import specifier is a bare specifier
       * Bare specifiers are:
       * 1. Package names: 'react', 'lodash'
       * 2. Scoped packages: '@scope/package'
       * 3. Package paths: 'package/sub/path'
       * NOT URLs (contain ://) or relative paths (start with ./ or ../)
       *
       * @param id - The import specifier to check
       * @returns true if it's a bare specifier
       */
      /*@__MANGLE_PROP__*/
      isBareSpecifier(id) {
          return !id.includes('://') &&
              !id.startsWith('./') &&
              !id.startsWith('../') &&
              !id.startsWith('/');
      }
      /**
       * Search all share scopes and containers for a shared module
       * Returns information about providers and consumers of the module
       *
       * @param id - The module specifier to search for
       * @returns Information about providers and consumers
       */
      /*@__MANGLE_PROP__*/
      findSharedModuleInAllScopes(id, scopeName) {
          const result = {
              found: false,
              providers: [],
              consumers: []
          };
          // A container is served only by its own share scope - a scope is a
          // boundary, not a hint (FYM-172). `scopeName` is omitted only when there is
          // no container context to take a scope from, and then every scope is fair
          // game because there is nothing to isolate against.
          const searchScopes = scopeName
              ? this.$SS[scopeName]
                  ? [scopeName]
                  : []
              : Object.keys(this.$SS);
          // Search the share scopes ($SS) in range
          for (const sName of searchScopes) {
              const scope = this.$SS[sName];
              if (scope[id]) {
                  result.found = true;
                  // Collect all available versions in this scope
                  for (const version in scope[id]) {
                      const shareInfo = scope[id][version];
                      if (shareInfo.sources) {
                          for (const source of shareInfo.sources) {
                              result.providers.push({
                                  scope: sName,
                                  version: version,
                                  container: source.container,
                                  url: shareInfo.url
                              });
                          }
                      }
                  }
              }
          }
          // Search containers' $SC to find consumers. Scoped the same way, so a
          // module known only to a foreign scope is not claimed by this one - it
          // stays unknown and falls through to SystemJS as any other module would.
          for (const containerId in this.$C) {
              const containerMap = this.$C[containerId];
              for (const ver in containerMap) {
                  if (ver !== "_") {
                      const container = containerMap[ver];
                      if (scopeName && container.scope !== scopeName) {
                          continue;
                      }
                      if (container.$SC[id]) {
                          const shareConfig = container.$SC[id];
                          // If import === false, it's consume-only
                          if (shareConfig.options.import === false) {
                              result.consumers.push({
                                  container: container.name,
                                  version: container.version,
                                  semver: shareConfig.options.semver
                              });
                          }
                          result.found = true;
                      }
                  }
              }
          }
          return result;
      }
      /**
       * Cached version of findSharedModuleInAllScopes
       *
       * The answer depends on the asking scope, so the scope is part of the key -
       * a single entry per id would let whichever scope asked first decide for
       * every other scope, undoing the isolation the search itself applies.
       *
       * @param id - The module specifier to search for
       * @param scopeName - The asking container's scope, if any
       * @returns Information about providers and consumers
       */
      /*@__MANGLE_PROP__*/
      findSharedModuleInAllScopesCached(id, scopeName) {
          const cacheKey = scopeName ? scopeName + " " + id : id;
          let result = this.sharedModuleCache.get(cacheKey);
          if (!result) {
              result = this.findSharedModuleInAllScopes(id, scopeName);
              this.sharedModuleCache.set(cacheKey, result);
          }
          return result;
      }
      /**
       * Drop the shared module lookup cache.
       *
       * Containers, share sources and resolved share urls all arrive
       * asynchronously as entry scripts load. Any of them changes the answer
       * findSharedModuleInAllScopes gives, so every mutation must invalidate -
       * a stale miss here surfaces as a spurious SharedModuleNoProviderError.
       */
      /*@__MANGLE_PROP__*/
      invalidateSharedModuleCache() {
          this.sharedModuleCache.size && this.sharedModuleCache.clear();
      }
      /**
       * Create an error for version mismatch in shared modules
       */
      /*@__MANGLE_PROP__*/
      createVersionMismatchError(id, semver, sharedInfo) {
          const availableVersions = sharedInfo.providers
              .map(p => `${p.container}@${p.version}`)
              .join(', ');
          const error = new Error(`Cannot resolve shared module '${id}' - version mismatch\n` +
              `  Required version: ${semver || 'any'}\n` +
              `  Available providers: ${availableVersions}\n` +
              `  Consumers: ${sharedInfo.consumers.map(c => c.container).join(', ')}\n` +
              `  Solution: Ensure a provider with compatible version is loaded`);
          error.name = 'SharedModuleVersionMismatchError';
          return error;
      }
      /**
       * Create an error for missing provider in shared modules
       */
      /*@__MANGLE_PROP__*/
      createNoProviderError(id, sharedInfo) {
          const consumers = sharedInfo.consumers
              .map(c => `${c.container} (requires ${c.semver || 'any'})`)
              .join(', ');
          const error = new Error(`Cannot resolve shared module '${id}' - no provider loaded\n` +
              `  Module is configured as shared in: ${consumers}\n` +
              `  Solution: Load a provider container that exports '${id}'\n` +
              `  Note: Check the 'shared-providers' in your manifest for hints`);
          error.name = 'SharedModuleNoProviderError';
          return error;
      }
      /**
       *
       * @param id
       * @param parentURL
       * @param meta
       * @returns
       */
      resolve(id, parentURL, meta) {
          console.debug("## resolve - id", id, "parentURL", parentURL, "meta", meta);
          const federation = this;
          const { id: parentId, version: parentVersion } = federation.getIdForUrl(parentURL) || {};
          let container = parentId && federation._mfGetContainer(parentId, parentVersion);
          // SystemJS is trying load dependencies of an exposed module with the id like "./main"
          // We have to find the container that might exposed that id and use it to form the full
          // parentURL.
          if (!container && startsWithDotSlash(parentURL)) {
              container = this.searchContainerForExposedId(parentURL);
              if (container) {
                  console.debug(" >> found container for exposed id", parentURL, container);
                  parentURL = federation.sysResolve.call(federation._System, parentURL, container.url, meta);
              }
          }
          // Check if this is a bare specifier and handle shared module detection
          if (this.isBareSpecifier(id)) {
              console.debug("Bare specifier detected:", id);
              // Establish container context first - its scope bounds the search below.
              // The binding also carries the importer dirs bundled into this chunk,
              // which is what makes the importer-declared ranges (rvm) available here.
              let bareMapData;
              if (!container) {
                  const binded = federation.getBindForId(parentId || parentURL);
                  if (binded) {
                      container = federation._mfGetContainer(binded.container, binded.containerVersion);
                      bareMapData = binded.mapData;
                  }
              }
              // Search for this shared module, confined to the container's own scope
              const sharedInfo = this.findSharedModuleInAllScopesCached(id, container && container.scope);
              if (sharedInfo.found) {
                  console.debug(`Shared module '${id}' found in federation`);
                  // Now resolve the shared module
                  if (container) {
                      // We have container context - get the required version
                      const semvers = federation.matchRvm(id, container, bareMapData);
                      console.debug(`Resolving shared module '${id}' with container context`, "\n  container:", container.name, "\n  semver:", semvers, "\n  providers:", sharedInfo.providers);
                      // Try to find matching version in providers. Prefer a provider that
                      // already has a url - a satisfying provider without one cannot short
                      // circuit resolution, so keep scanning rather than breaking on it.
                      let foundMatch = false;
                      for (const provider of sharedInfo.providers) {
                          if (federation.satisfiesAll(semvers, provider.version)) {
                              console.debug(`Found matching provider: ${provider.container}@${provider.version}`);
                              foundMatch = true;
                              if (provider.url) {
                                  federation.addIdUrlMap(id, provider.url);
                                  return provider.url;
                              }
                          }
                      }
                      // No matching provider found - determine the appropriate error
                      if (!foundMatch) {
                          if (sharedInfo.providers.length === 0) {
                              // No providers at all - throw no provider error
                              throw this.createNoProviderError(id, sharedInfo);
                          }
                          // Every range is individually satisfiable but no single version
                          // satisfies them all: the chunk bundled importers whose declared
                          // requirements conflict, so no resolution can be correct here.
                          if (semvers.length > 1) {
                              const satisfiable = semvers.filter((range) => sharedInfo.providers.some((p) => satisfy(parseRange(range), p.version)));
                              if (satisfiable.length > 1) {
                                  console.warn(`Shared module '${id}' - no single version satisfies every range ` +
                                      `declared by the importers in this chunk: ${semvers.join(", ")}`);
                              }
                          }
                          if (semvers.length) {
                              // Providers exist but none match the required version
                              throw this.createVersionMismatchError(id, semvers.join(" && "), sharedInfo);
                          }
                      }
                      // If we found a match but no URL, continue with normal resolution below
                  }
                  else {
                      // No container context but we know it's shared
                      console.debug(`No container context for '${id}', checking providers`);
                      if (sharedInfo.providers.length > 0) {
                          // Use the first available provider
                          console.warn(`No container context for '${id}', using first available provider`);
                          const provider = sharedInfo.providers[0];
                          if (provider.url) {
                              federation.addIdUrlMap(id, provider.url);
                              return provider.url;
                          }
                      }
                      else {
                          // It's configured as shared but no provider loaded
                          throw this.createNoProviderError(id, sharedInfo);
                      }
                  }
              }
              else {
                  // Not found in federation, pass to SystemJS
                  console.debug(`'${id}' not found in federation, delegating to SystemJS`);
                  return federation.sysResolve.call(this._System, id, parentURL, meta);
              }
          }
          // only populated when the container was reached through a module binding -
          // a container found via parentId carries no importer mapping
          let rvmMapData;
          if (!container) {
              const binded = federation.getBindForId(parentId || parentURL);
              container =
                  binded &&
                      federation._mfGetContainer(binded.container, binded.containerVersion);
              if (!container) {
                  console[parentId ? "warn" : "debug"](" >> Unable to find container for id " +
                      id +
                      " parentId " +
                      parentId +
                      " parentURL " +
                      parentURL);
                  return federation.sysResolve.call(federation._System, id, parentURL, meta);
              }
              rvmMapData = binded.mapData;
              console.debug(" >> resolve bind parent of", id, binded, `\n  container`, container, "\n  get original import name from id to check for federation", id, "\n  rvmMapData", rvmMapData);
          }
          // time to federate
          // 1. get original import name from id
          const { n: importName, v: importVersion } = federation.findImportSpecFromId(id, container);
          if (!importName) {
              console.debug(" >> no import name found for id " +
                  id +
                  ", so treat it as no federation");
              return federation.sysResolve.call(federation._System, id, parentURL, meta);
          }
          // 2. get required version from container.$SC.rvm and binded.mapData
          console.debug("  looking for required version - importName", importName, "\n  container", container, "\n  rvmMapData", rvmMapData);
          const semverRanges = federation.matchRvm(importName, container, rvmMapData);
          // 3. match existing loaded module from shared info
          const scope = federation.$SS[container.scope];
          const shareMeta = scope && scope[importName];
          console.debug("  shareMeta", shareMeta, "\n  semver", semverRanges, "\n  importVersion", importVersion);
          // First try to find a loaded module that satisfies the version requirement
          let matchedVersion = semverRanges.length
              ? federation.semverMatch(importName, shareMeta, semverRanges, true, importVersion)
              : importVersion;
          // If no loaded module found but semver range exists, try again without loadedOnly restriction
          if (!matchedVersion && shareMeta) {
              matchedVersion = federation.semverMatch(importName, shareMeta, semverRanges, false, importVersion);
              console.debug("  No loaded module found for", importName, "- falling back to unloaded module with version", matchedVersion);
          }
          const shareInfo = shareMeta && matchedVersion ? shareMeta[matchedVersion] : undefined;
          let shareId = id;
          let shareParentUrl = parentURL;
          if (shareInfo) {
              if (shareInfo.url) {
                  console.debug("found shared", importName, "url", shareInfo.url);
                  federation.addIdUrlMap(id, shareInfo.url);
                  return shareInfo.url;
              }
              const source = federation.pickShareSource(shareInfo);
              source.loaded = true;
              // The container registered the share info, so the id is
              // relative to the container's URL.
              shareParentUrl = federation.getUrlForId(containerNameToId(source.container), source.version);
              shareId = source.id;
          }
          const resolved = federation.sysResolve.call(federation._System, shareId, shareParentUrl, meta);
          federation.addIdUrlMap(shareId, resolved);
          if (id !== shareId) {
              federation.addIdUrlMap(id, resolved);
          }
          if (shareInfo) {
              shareInfo.url = resolved;
              federation.invalidateSharedModuleCache();
          }
          return resolved;
      }
      /**
       *
       * @param id
       * @param container
       * @returns
       */
      /*@__MANGLE_PROP__*/
      findImportSpecFromId(id, container) {
          const _SS = container.$SC;
          if (_SS[id]) {
              // import is using original import id
              return { n: id, v: firstObjectKey(_SS[id].versions) };
          }
          for (const name in _SS) {
              const _sm = _SS[name];
              for (const version in _sm.versions) {
                  const _si = _sm.versions[version];
                  if (id === _si.id) {
                      console.debug("found import name", name, "version", version, "for id", id);
                      // first match wins - returning here also avoids a later share key
                      // that maps to the same chunk id overwriting this one
                      return { n: name, v: version };
                  }
              }
          }
          return { n: "", v: "" };
      }
      /**
       * The version ranges the code in this chunk declared for a shared module.
       *
       * `rvm` maps an importer's directory to the range that importer's own
       * package.json declared for the module (emitted by the plugin in
       * container-code.mts). A chunk carries the list of directories it bundled
       * (`mapData`, from packModuleIds), so more than one importer - and therefore
       * more than one range - can apply to a single import. All of them must hold,
       * which is why this returns every match rather than the first: `mapData`
       * ordering is incidental to bundling and must not decide resolution.
       *
       * Falls back to the container-wide `options.semver` only when the chunk
       * declared nothing, which is the case for containers built without rvm data.
       *
       * @param importName
       * @param container
       * @param rvmMapData
       * @returns declared ranges, most specific first; empty means unconstrained
       */
      /*@__MANGLE_PROP__*/
      matchRvm(importName, container, rvmMapData) {
          const sc = container.$SC[importName];
          if (!sc) {
              console.debug("  matchRvm - no semver due to no container scope found for importName", importName);
              return [];
          }
          const ranges = [];
          const rvm = sc.rvm;
          if (rvm && rvmMapData) {
              for (const _src of rvmMapData) {
                  const semver = rvm[_src];
                  if (!semver) {
                      continue;
                  }
                  // rvm carries whatever the importer declared in its package.json, and
                  // that is only a semver range for registry deps. A `file:`/`link:`/
                  // `workspace:` dep, a dist-tag, or a git URL is a resolution
                  // instruction, not a constraint - it says where the package comes
                  // from, never which versions are acceptable. Treating one as a range
                  // matches no provider at all, so the share fails to resolve with a
                  // "version mismatch" naming a required version nobody declared.
                  // Skipping it leaves the container's own `options.semver` to govern,
                  // which is the only range that was ever meant as one.
                  if (!isValidRange(semver)) {
                      console.debug("ignoring non-semver dependency spec for import name", importName, semver, "declared by", _src);
                      continue;
                  }
                  if (ranges.indexOf(semver) < 0) {
                      console.debug("found semver for import name", importName, semver, "declared by", _src);
                      ranges.push(semver);
                  }
              }
          }
          if (!ranges.length && sc.options.semver) {
              console.debug("  matchRvm - no importer declared a range for", importName, "\n  falling back to container semver", sc.options.semver);
              ranges.push(sc.options.semver);
          }
          return ranges;
      }
      /**
       * A shared version is usable only if it satisfies every range the chunk
       * declared. An empty range list means unconstrained.
       *
       * @param ranges
       * @param version
       * @returns
       */
      /*@__MANGLE_PROP__*/
      satisfiesAll(ranges, version) {
          for (const range of ranges) {
              if (!satisfy(parseRange(range), version)) {
                  return false;
              }
          }
          return true;
      }
      /**
       *
       * @param shareMeta
       * @param semver
       * @param fallbackVer
       * @returns
       */
      /*@__MANGLE_PROP__*/
      semverMatch(name, shareMeta, semvers, loadedOnly, fallbackVer) {
          let matchedVersion = "";
          for (const ver in shareMeta) {
              if ((!loadedOnly || shareMeta[ver].srcIdx !== undefined) &&
                  this.satisfiesAll(semvers, ver)) {
                  console.debug(name, "found a shared version", ver, "that satisfied semver", semvers);
                  matchedVersion = ver;
                  break;
              }
          }
          if (!matchedVersion) {
              !loadedOnly &&
                  console.warn(name, "no version satisfied", semvers.join(" && "), "found, fallback:", fallbackVer);
              matchedVersion = fallbackVer;
          }
          return matchedVersion;
      }
      /**
       *
       * @param shareInfo
       * @returns
       */
      /*@__MANGLE_PROP__*/
      pickShareSource(shareInfo) {
          let ix = shareInfo.srcIdx;
          if (ix === undefined) {
              if (this.randomSource === true && shareInfo.sources.length > 1) {
                  ix = Math.floor(Math.random() * shareInfo.sources.length);
              }
              else {
                  ix = 0;
              }
              shareInfo.srcIdx = ix;
          }
          return shareInfo.sources[ix];
      }
      /**
       *
       * @param id
       * @returns
       */
      /*@__MANGLE_PROP__*/
      getUrlForId(id, reqSemver) {
          const rd = this.getRegDefForId(id, reqSemver);
          return rd ? rd.url : undefined;
      }
      /**
       *
       * @param id
       * @returns
       */
      /*@__MANGLE_PROP__*/
      getRegDefForId(id, reqSemver) {
          // if id starts with ./, then it means rollup has generated a unique bundle for the module
          if (startsWithDotSlash(id)) {
              return this.$iU[id.slice(2)]?._;
          }
          if (id.startsWith("__mf_")) {
              // the id may not be registered yet - the container's entry script may
              // still be loading - so every lookup here must tolerate a missing map
              const $iUMap = this.$iU[id];
              if (!$iUMap) {
                  return undefined;
              }
              if (reqSemver) {
                  const svRange = parseRange(reqSemver);
                  const versions = Object.keys($iUMap);
                  const version = versions.find((v) => v !== "_" && satisfy(svRange, v));
                  return version ? $iUMap[version] : undefined;
              }
              return $iUMap._;
          }
          // else the id may be the original vanilla module name, no version or unique info that
          // we can use to lookup its registered url or definition
          return null;
      }
      /**
       *
       * @param url
       * @returns
       */
      /*@__MANGLE_PROP__*/
      getIdForUrl(url) {
          return this.$uI[url] && this.$uI[url][0];
      }
      /**
       *
       * @param id
       * @param url
       */
      /*@__MANGLE_PROP__*/
      addIdUrlMap(id, url, def, container) {
          if (url !== id) {
              let id2 = id;
              if (startsWithDotSlash(id)) {
                  id2 = id.slice(2);
              }
              let $iUMap = this.$iU[id2];
              if (!$iUMap) {
                  $iUMap = this.$iU[id2] = createObject();
              }
              const regDef = { url, def };
              if (!$iUMap._) {
                  $iUMap._ = regDef;
              }
              if (container?.version) {
                  $iUMap[container.version] = regDef;
                  container.url = url;
              }
              const version = container?.version;
              addElementToArrayInObject(this.$uI, url, { id, version }, (e) => e.id === id && e.version === version);
              return true;
          }
          return false;
      }
      /**
       *
       * @param id
       * @returns
       */
      /*@__MANGLE_PROP__*/
      getBindForId(id) {
          if (startsWithDotSlash(id)) {
              return this.$B[id.slice(2)];
          }
          return this.$B[id];
      }
      /**
       *
       * @param id
       * @param parentUrl
       * @param meta
       * @returns
       */
      import(id, parentUrl, meta) {
          return this._System.import(id, parentUrl, meta);
      }
      /**
       *
       * @param id
       * @param containerName
       */
      _mfLoaded(id, containerName, containerVersion) {
          const container = this._mfGetContainer(containerName, containerVersion);
          if (!container) {
              console.warn("_mfLoaded - no container", containerName, containerVersion, "for id", id);
              return;
          }
          const { n, v } = this.findImportSpecFromId(id, container);
          // a consume-only share is recorded on the container but never added to the
          // share scope, so scope[n] can legitimately be missing here
          const sc = n && v && this.$SS[container.scope];
          const shareInfo = sc && sc[n] && sc[n][v];
          if (shareInfo) {
              const ix = shareInfo.sources.findIndex((s) => s.id === id);
              if (ix < 0) {
                  console.warn("_mfLoaded - id", id, "is not a source of", n, v);
                  return;
              }
              shareInfo.sources[ix].loaded = true;
              if (!shareInfo.url) {
                  shareInfo.srcIdx = ix;
                  shareInfo.id = id;
                  const rd = this.getRegDefForId(id, container?.version);
                  if (!rd) {
                      shareInfo.url = this.sysResolve.call(this._System, id, 
                      // we expect module bundle file to reside at the same location as the
                      // container entry file, so we get container url from its id, and use it
                      // as base and add module file id to construct the module's url
                      this.getUrlForId(container.id, container?.version));
                  }
                  else {
                      shareInfo.url = id;
                  }
                  this.invalidateSharedModuleCache();
              }
          }
      }
      /**
       * Register a module.
       *
       * - `id` - A module needs an *unique* id to register.  The id could be
       * the full URL or path of the file containing the module.
       * - `currentScript` - `document.currentScript` is the standard way to
       * get the URL.
       * - `federation` - If a file has multiple modules, then only the first
       * one can use the URL, and subsequent ones need to provide an id.
       *
       * @param id
       * @param dep
       * @param declare
       * @param metas
       * @returns
       */
      register(id, deps, declare, meta, src, container) {
          if (typeof id !== "string") {
              console.debug("federation - no name for register - using original");
              return this.sysRegister.apply(this._System, arguments);
          }
          const currentScr = getCurrentScript();
          const url = currentScr && currentScr.src;
          console.debug(`federation register - id:`, id, "url:", url);
          const def = [deps, declare, meta];
          this.addIdUrlMap(id, url, def, container);
          return this.sysRegister.apply(this._System, def);
      }
      /**
       *
       * @param name - container name
       */
      /*@__MANGLE_PROP__*/
      _checkPendingRegs(name) {
          const pC = this.$pC;
          const pendingRegs = pC[name];
          if (pendingRegs) {
              delete pC[name];
              setTimeout(() => {
                  for (const pR of pendingRegs) {
                      console.debug(`loading deferred module`, pR.id, "for container", name);
                      pR.l();
                  }
              });
          }
      }
      /**
       *
       * @param name
       * @returns
       */
      _mfGetContainer(name, reqSemver) {
          const id = containerNameToId(name);
          const containerMap = this.$C[id];
          if (!containerMap) {
              return undefined;
          }
          if (reqSemver) {
              const versions = Object.keys(containerMap);
              const svRange = parseRange(reqSemver);
              const version = versions.find((v) => v !== "_" && satisfy(svRange, v));
              console.debug("  _mfGetContainer - version", version, "for", name, "and", reqSemver);
              return version ? containerMap[version] : undefined;
          }
          return containerMap._;
      }
      /**
       *
       * @param options
       * @param mapData
       * @returns
       */
      _mfBind(options, mapData) {
          const _F = this;
          let id = options.f;
          // entry bundle (isEntry)
          if (options.e) {
              id = "__mf_entry_" + options.c + "_" + id;
              console.debug("entry module id", id, options);
          }
          if (_F.$B[id]) {
              console.warn(`module federation initial binding already exist for id`, id);
              return _F.$B[id];
          }
          const curScr = getCurrentScript();
          const src = curScr && curScr.src;
          const binded = {
              name: options.n,
              src,
              fileName: options.f,
              container: options.c,
              containerVersion: options.v,
              scopeName: options.s,
              mapData,
              _register(_id, dep, declare, metas, _src) {
                  const r = _F.register(id, dep, declare, metas, _src || src);
                  console.debug("  register a unique bundle with id " +
                      id +
                      " for resolving binding to a federation in share scope");
                  _F._mfLoaded("./" + id, options.c, options.v);
                  return r;
              },
              register(dep, declare, metas, _src) {
                  const container = _F._mfGetContainer(options.c, options.v);
                  if (!container) {
                      // registering a module for a container that is not yet registered
                      // so we need to defer the registration until the container is registered
                      if (addElementToArrayInObject(_F.$pC, options.c, { id, l: () => this._register(id, dep, declare, metas, src) }, (e) => e.id === id)) {
                          console.debug("defer register module", id, "pending container", options.c);
                      }
                      return;
                  }
                  return this._register(id, dep, declare, metas, _src);
              },
          };
          if (id !== options.f) {
              binded.id = id;
          }
          _F.$B[id] = binded;
          return binded;
      }
      /**
       *
       * @param name
       * @param scopeName
       * @returns
       */
      _mfContainer(name, scopeName, version = "0.0.0") {
          const id = containerNameToId(name);
          let containerMap = this.$C[id];
          if (!containerMap) {
              containerMap = this.$C[id] = createObject();
          }
          let container = containerMap[version];
          if (container) {
              // If container with this version already exists, log warning and return existing
              console.warn(`Container ${name} with version ${version} already exists`);
              return container;
          }
          // a new container adds itself as a potential consumer
          this.invalidateSharedModuleCache();
          container = containerMap[version] = new Container(id, name, scopeName, version, this);
          // If this is the first container for this ID, store it as default and with version
          if (!containerMap._) {
              containerMap._ = container;
          }
          return container;
      }
      /**
       * _**Module Federation Import**_
       * @param name
       * @param scope
       * @param semver
       * @param fallbackToFirst
       */
      _mfImport(name, scope, semver, fallbackToFirst) {
          const sc = this.$SS[scope];
          const shareMeta = sc && sc[name];
          console.debug("  _mfImport", name, scope, semver, fallbackToFirst);
          if (shareMeta) {
              // an explicit single range from the caller, not chunk-declared rvm data
              let matchedVersion = semver && this.semverMatch(name, shareMeta, [semver], false);
              if (!matchedVersion && (!semver || fallbackToFirst)) {
                  matchedVersion = firstObjectKey(shareMeta);
              }
              const shareInfo = matchedVersion ? shareMeta[matchedVersion] : undefined;
              if (shareInfo) {
                  if (shareInfo.url) {
                      return this._System.import(shareInfo.url);
                  }
                  else {
                      const source = this.pickShareSource(shareInfo);
                      // pass the source's container version so multi-version containers
                      // resolve against the URL of the container that actually provided it
                      const parentUrl = this.getUrlForId(containerNameToId(source.container), source.version);
                      return this._System.import(source.id, parentUrl);
                  }
              }
          }
          return Promise.reject("_mfImport " + name + " failed");
      }
      /**
       * Import an expose module from a module federation container
       *
       * @param id - the specifier to import - it must start with `"-MF_EXPOSE "`
       */
      async _importExpose(id, semver) {
          const [type, exposeModule, requiredVersion] = id.split(" ");
          if (requiredVersion && !semver) {
              semver = requiredVersion;
          }
          if (type === "-MF_EXPOSE") {
              let [pkgScope, fynappName, module] = exposeModule.split("/");
              if (!module) {
                  module = fynappName;
                  fynappName = pkgScope;
                  pkgScope = "";
              }
              const container = this._mfGetContainer(fynappName, semver);
              if (!container) {
                  throw new Error(`_importExpose - no container '${fynappName}'` +
                      (semver ? ` matching '${semver}'` : "") +
                      ` is registered for '${id}'`);
              }
              console.debug("  _importExpose - container", container.name, container.version);
              const factory = await container._mfGet("./" + module);
              const mod = factory();
              return mod;
          }
          return null;
      }
      /**
       * ***Add Shared***
       *
       * @param scope
       * @param key
       * @param version
       * @param id
       * @param container
       */
      _S(scope, key, version, id, container, containerVersion) {
          // a container may share into a scope other than its own (shareScope option),
          // which _mfInit never initialized - so ensure the scope exists here
          const _ss = this._mfInitScope(scope);
          const _sm = _ss[key] || (_ss[key] = createObject());
          const _si = _sm[version] || (_sm[version] = createObject());
          if (addElementToArrayInObject(_si, "sources", { id, container, version: containerVersion }, (e) => e.id === id &&
              e.container === container &&
              e.version === containerVersion)) {
              // a new provider changes what findSharedModuleInAllScopes reports
              this.invalidateSharedModuleCache();
              _si.sources.length > 1 &&
                  console.debug(`adding share source from container`, container, scope + ":" + key + ":" + version);
          }
      }
      /**
       * ***Init Scope***
       * @param scope
       * @param shareScope
       */
      _mfInitScope(scope, shareScope) {
          let _ss = this.$SS[scope];
          if (!_ss) {
              _ss = this.$SS[scope] = shareScope || createObject();
              // a brand new scope may already carry shares if one was handed in
              this.invalidateSharedModuleCache();
          }
          if (shareScope && _ss !== shareScope) {
              throw new Error(`share scope ` + scope + ` already initialized.`);
          }
          return _ss;
      }
  }
  _global.Federation = new FederationJS();

  exports.FederationJS = FederationJS;

  return exports;

})({});
//# sourceMappingURL=federation-js.dev.js.map
