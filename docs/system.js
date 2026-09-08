/*!
 * SystemJS 6.15.1
 */
(function () {

  function errMsg(errCode, msg) {
    return (msg || "") + " (SystemJS Error#" + errCode + " https://github.com/systemjs/systemjs/blob/main/docs/errors.md#" + errCode + ")";
  }

  var hasSelf = typeof self !== "undefined";
  var hasDocument = typeof document !== "undefined";
  var envGlobal = hasSelf ? self : global;
  var baseUrl;
  if (typeof location !== "undefined") {
    baseUrl = location.href.split("#")[0].split("?")[0];
    var lastSepIndex = baseUrl.lastIndexOf("/");
    if (lastSepIndex !== -1)
      baseUrl = baseUrl.slice(0, lastSepIndex + 1);
  }
  var iterator = Symbol.iterator;
  function keyIterator(keys, project) {
    var index = 0;
    var iter = {
      next: function() {
        var key, value;
        while ((key = keys[index++]) !== void 0 && (value = project(key)) === void 0) ;
        return { done: key === void 0, value: key !== void 0 && value };
      }
    };
    iter[iterator] = function() {
      return this;
    };
    return iter;
  }
  var backslashRegEx = /\\/g;
  function resolveIfNotPlainOrUrl(relUrl, parentUrl) {
    if (relUrl.indexOf("\\") !== -1)
      relUrl = relUrl.replace(backslashRegEx, "/");
    if (relUrl[0] === "/" && relUrl[1] === "/") {
      return parentUrl.slice(0, parentUrl.indexOf(":") + 1) + relUrl;
    } else if (relUrl[0] === "." && (relUrl[1] === "/" || relUrl[1] === "." && (relUrl[2] === "/" || relUrl.length === 2 && (relUrl += "/")) || relUrl.length === 1 && (relUrl += "/")) || relUrl[0] === "/") {
      var parentProtocol = parentUrl.slice(0, parentUrl.indexOf(":") + 1);
      var pathname;
      if (parentUrl[parentProtocol.length + 1] === "/") {
        if (parentProtocol !== "file:") {
          pathname = parentUrl.slice(parentProtocol.length + 2);
          pathname = pathname.slice(pathname.indexOf("/") + 1);
        } else {
          pathname = parentUrl.slice(8);
        }
      } else {
        pathname = parentUrl.slice(parentProtocol.length + (parentUrl[parentProtocol.length] === "/"));
      }
      if (relUrl[0] === "/")
        return parentUrl.slice(0, parentUrl.length - pathname.length - 1) + relUrl;
      var segmented = pathname.slice(0, pathname.lastIndexOf("/") + 1) + relUrl;
      var output = [];
      var segmentIndex = -1;
      for (var i = 0; i < segmented.length; i++) {
        if (segmentIndex !== -1) {
          if (segmented[i] === "/") {
            output.push(segmented.slice(segmentIndex, i + 1));
            segmentIndex = -1;
          }
        } else if (segmented[i] === ".") {
          if (segmented[i + 1] === "." && (segmented[i + 2] === "/" || i + 2 === segmented.length)) {
            output.pop();
            i += 2;
          } else if (segmented[i + 1] === "/" || i + 1 === segmented.length) {
            i += 1;
          } else {
            segmentIndex = i;
          }
        } else {
          segmentIndex = i;
        }
      }
      if (segmentIndex !== -1)
        output.push(segmented.slice(segmentIndex));
      return parentUrl.slice(0, parentUrl.length - pathname.length) + output.join("");
    }
  }
  function resolveUrl(relUrl, parentUrl) {
    return resolveIfNotPlainOrUrl(relUrl, parentUrl) || (relUrl.indexOf(":") !== -1 ? relUrl : resolveIfNotPlainOrUrl("./" + relUrl, parentUrl));
  }
  function resolveAndComposePackages(packages, outPackages, baseUrl2, parentMap, parentUrl) {
    for (var p in packages) {
      var resolvedLhs = resolveIfNotPlainOrUrl(p, baseUrl2) || p;
      var rhs = packages[p];
      if (typeof rhs !== "string")
        continue;
      var mapped = resolveImportMap(parentMap, resolveIfNotPlainOrUrl(rhs, baseUrl2) || rhs, parentUrl);
      if (!mapped) {
        targetWarning("W1", p, rhs, "bare specifier did not resolve");
      } else
        outPackages[resolvedLhs] = mapped;
    }
  }
  function resolveAndComposeImportMap(json, baseUrl2, outMap) {
    if (json.imports)
      resolveAndComposePackages(json.imports, outMap.imports, baseUrl2, outMap, null);
    var u;
    for (u in json.scopes || {}) {
      var resolvedScope = resolveUrl(u, baseUrl2);
      resolveAndComposePackages(json.scopes[u], outMap.scopes[resolvedScope] || (outMap.scopes[resolvedScope] = {}), baseUrl2, outMap, resolvedScope);
    }
    for (u in json.depcache || {})
      outMap.depcache[resolveUrl(u, baseUrl2)] = json.depcache[u];
    for (u in json.integrity || {})
      outMap.integrity[resolveUrl(u, baseUrl2)] = json.integrity[u];
  }
  function getMatch(path, matchObj) {
    if (matchObj[path])
      return path;
    var sepIndex = path.length;
    do {
      var segment = path.slice(0, sepIndex + 1);
      if (segment in matchObj)
        return segment;
    } while ((sepIndex = path.lastIndexOf("/", sepIndex - 1)) !== -1);
  }
  function applyPackages(id, packages) {
    var pkgName = getMatch(id, packages);
    if (pkgName) {
      var pkg = packages[pkgName];
      if (pkg === null) return;
      if (id.length > pkgName.length && pkg[pkg.length - 1] !== "/") {
        targetWarning("W2", pkgName, pkg, "should have a trailing '/'");
      } else
        return pkg + id.slice(pkgName.length);
    }
  }
  function targetWarning(code, match, target, msg) {
    console.warn(errMsg(code, "Package target " + msg + ", resolving target '" + target + "' for " + match));
  }
  function resolveImportMap(importMap, resolvedOrPlain, parentUrl) {
    var scopes = importMap.scopes;
    var scopeUrl = parentUrl && getMatch(parentUrl, scopes);
    while (scopeUrl) {
      var packageResolution = applyPackages(resolvedOrPlain, scopes[scopeUrl]);
      if (packageResolution)
        return packageResolution;
      scopeUrl = getMatch(scopeUrl.slice(0, scopeUrl.lastIndexOf("/")), scopes);
    }
    return applyPackages(resolvedOrPlain, importMap.imports) || resolvedOrPlain.indexOf(":") !== -1 && resolvedOrPlain;
  }

  var toStringTag$1 = Symbol.toStringTag;
  var REGISTRY = Symbol();
  function SystemJS() {
    this[REGISTRY] = /* @__PURE__ */ Object.create(null);
    this.aliases = createAliasMap();
    this.registrations = createRegistrationMap();
    this.records = createRecordMap(this);
  }
  var systemJSPrototype = SystemJS.prototype;
  systemJSPrototype.import = function(id, parentUrl, meta) {
    var loader = this;
    parentUrl && typeof parentUrl === "object" && (meta = parentUrl, parentUrl = void 0);
    return Promise.resolve(loader.prepareImport()).then(function() {
      return loader.resolve(id, parentUrl, meta);
    }).then(function(id2) {
      var load = getOrCreateLoad(loader, id2, void 0, meta);
      return load.C || topLevelLoad(loader, load);
    });
  };
  systemJSPrototype.createContext = function(parentId) {
    var loader = this;
    return {
      url: parentId,
      resolve: function(id, parentUrl) {
        return Promise.resolve(loader.resolve(id, parentUrl || parentId));
      }
    };
  };
  systemJSPrototype.onload = function() {
    };
  function loadToId(load) {
    return load.id;
  }
  function triggerOnload(loader, load, err, isErrSource) {
    loader.onload(err, load.id, load.d && load.d.map(loadToId), !!isErrSource);
    if (err)
      throw err;
  }
  var lastRegister;
  systemJSPrototype.register = function(deps, declare, metas) {
    lastRegister = [deps, declare, metas];
  };
  systemJSPrototype.getRegister = function() {
    var _lastRegister = lastRegister;
    lastRegister = void 0;
    return _lastRegister;
  };
  var hasOwn = Object.prototype.hasOwnProperty;
  function identity(key) {
    return key;
  }
  function mapView(getStore, resolveKey) {
    function walk(project) {
      var store = getStore();
      return keyIterator(Object.keys(store), function(key) {
        return project(key, store);
      });
    }
    var view = {
      get: function(key) {
        var store = getStore();
        key = resolveKey(key);
        return hasOwn.call(store, key) ? store[key] : void 0;
      },
      has: function(key) {
        return hasOwn.call(getStore(), resolveKey(key));
      },
      keys: function() {
        return walk(identity);
      },
      values: function() {
        return walk(function(key, store) {
          return store[key];
        });
      },
      entries: function() {
        return walk(function(key, store) {
          return [key, store[key]];
        });
      }
    };
    view[iterator] = view.entries;
    return view;
  }
  function createRecordMap(loader) {
    return mapView(function() {
      return loader[REGISTRY];
    }, function(idOrName) {
      var aliased = loader.aliases.get(idOrName);
      return aliased === void 0 ? idOrName : aliased;
    });
  }
  function takeFromEntry() {
    var registration = this.registration;
    if (registration === void 0)
      return void 0;
    this.registration = void 0;
    this.taken = true;
    return registration;
  }
  function createRegistrationMap() {
    var store = /* @__PURE__ */ Object.create(null);
    var qualified = /* @__PURE__ */ Object.create(null);
    var reverse = /* @__PURE__ */ Object.create(null);
    function newEntry() {
      return { take: takeFromEntry };
    }
    function slot(name, qualifier, create) {
      if (qualifier === void 0) {
        if (hasOwn.call(store, name))
          return store[name];
        return create ? store[name] = newEntry() : void 0;
      }
      var byQualifier = hasOwn.call(qualified, name) ? qualified[name] : void 0;
      if (!byQualifier) {
        if (!create)
          return void 0;
        byQualifier = qualified[name] = /* @__PURE__ */ Object.create(null);
      }
      if (hasOwn.call(byQualifier, qualifier))
        return byQualifier[qualifier];
      return create ? byQualifier[qualifier] = newEntry() : void 0;
    }
    function unlink(name, qualifier, url) {
      if (url === void 0)
        return;
      var entries = reverse[url];
      if (!entries)
        return;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === name && entries[i].qualifier === qualifier) {
          entries.splice(i, 1);
          break;
        }
      }
      if (!entries.length)
        delete reverse[url];
    }
    return {
      get: function(name, qualifier) {
        return slot(name, qualifier);
      },
      has: function(name, qualifier) {
        return slot(name, qualifier) !== void 0;
      },
      set: function(name, known, qualifier) {
        var target = slot(name, qualifier, true);
        if (known.url !== void 0 && known.url !== target.url) {
          unlink(name, qualifier, target.url);
          target.url = known.url;
          (reverse[known.url] || (reverse[known.url] = [])).push({ name, qualifier });
        }
        if (known.registration !== void 0) {
          target.registration = known.registration;
          target.taken = false;
        }
      },
      delete: function(name, qualifier) {
        var target = slot(name, qualifier);
        if (!target)
          return false;
        unlink(name, qualifier, target.url);
        if (qualifier === void 0)
          delete store[name];
        else
          delete qualified[name][qualifier];
        return true;
      },
      qualifiersOf: function(name) {
        return hasOwn.call(qualified, name) ? Object.keys(qualified[name]) : [];
      },
      namesOf: function(url) {
        return reverse[url] ? reverse[url].slice() : [];
      },
      keys: function() {
        return keyIterator(Object.keys(store), identity);
      }
    };
  }
  function createAliasMap() {
    var store = /* @__PURE__ */ Object.create(null);
    var map = mapView(function() {
      return store;
    }, identity);
    map.set = function(name, id) {
      store[name] = id;
    };
    map.delete = function(name) {
      if (!hasOwn.call(store, name))
        return false;
      delete store[name];
      return true;
    };
    return map;
  }
  function idSet() {
    return /* @__PURE__ */ Object.create(null);
  }
  function hasPendingDep(load, seen) {
    var deps = load.d;
    if (!deps)
      return false;
    for (var i = 0; i < deps.length; i++) {
      var dep = deps[i];
      if (seen[dep.id])
        continue;
      seen[dep.id] = true;
      if (dep.E || hasPendingDep(dep, seen))
        return true;
    }
    return false;
  }
  systemJSPrototype.stageOf = function(load) {
    if (load.f)
      return "errored";
    if (load.e === null) {
      if (load.E)
        return "executing";
      return hasPendingDep(load, idSet()) ? "awaiting-deps" : "executed";
    }
    return load.e ? load.d ? "linked" : "instantiated" : "instantiating";
  };
  systemJSPrototype.hook = function(name, wrap) {
    if (typeof this[name] !== "function")
      throw Error(errMsg(10, 'No hook "' + name + '" in this build to wrap'));
    this[name] = wrap(this[name]);
  };
  function createNamespace() {
    var ns = /* @__PURE__ */ Object.create(null);
    Object.defineProperty(ns, toStringTag$1, { value: "Module" });
    return ns;
  }
  function createLoadRecord(id, importerSetters, ns, meta) {
    return {
      id,
      // importerSetters, the setters functions registered to this dependency
      // we retain this to add more later
      i: importerSetters,
      // module namespace object
      n: ns,
      // extra module information for import assertion
      // shape like: { assert: { type: 'xyz' } }
      m: meta,
      // instantiate
      I: void 0,
      // link
      L: void 0,
      // whether it has hoisted exports
      h: false,
      // On instantiate completion we have populated:
      // dependency load records
      d: void 0,
      // own setters, parallel to d
      s: void 0,
      // execution function
      e: void 0,
      // On execution we have populated:
      // the execution error if any
      er: void 0,
      // whether execution or linking failed. Separate from `er` because the
      // thrown value carries no reliable signal: `throw 0` / `throw null` are
      // legal, and testing `er` for truthiness read those as success -- a
      // dependent then executed against a dependency that had failed.
      f: false,
      // in the case of TLA, the execution promise
      E: void 0,
      // On execution, L, I, E cleared
      // Promise for top-level completion
      C: void 0,
      // parent instantiator / executor
      p: void 0
    };
  }
  function createExportFn(load, ns) {
    var importerSetters = load.i;
    return function _export(name, value) {
      load.h = true;
      var changed = false;
      if (typeof name === "string") {
        if (!(name in ns) || ns[name] !== value) {
          ns[name] = value;
          changed = true;
        }
      } else {
        for (var p in name) {
          var value = name[p];
          if (!(p in ns) || ns[p] !== value) {
            ns[p] = value;
            changed = true;
          }
        }
        if (name && name.__esModule) {
          ns.__esModule = name.__esModule;
        }
      }
      if (changed)
        for (var i = 0; i < importerSetters.length; i++) {
          var setter = importerSetters[i];
          if (setter) setter(ns);
        }
      return value;
    };
  }
  function instantiateStep(loader, load, id, firstParentUrl, meta, ns) {
    return Promise.resolve().then(function() {
      var pending = loader.registrations.get(id);
      var registration = pending && pending.take();
      return registration || loader.instantiate(id, firstParentUrl, meta);
    }).then(
      function(registration) {
        if (!registration)
          throw Error(errMsg(2, "Module " + id + " did not instantiate"));
        var declared = registration[1](createExportFn(load, ns), registration[1].length === 2 ? {
          import: function(importId, meta2) {
            return loader.import(importId, id, meta2);
          },
          meta: loader.createContext(id)
        } : void 0);
        load.e = declared.execute || function() {
        };
        return [registration[0], declared.setters || [], registration[2] || []];
      },
      /*
       * Deliberately the two-argument then(): this handler sees rejections from
       * loader.instantiate only, and NOT errors thrown by the fulfilment handler
       * beside it. So a declare() that throws leaves `er` unset and is surfaced by
       * instantiateAll's catch instead — the asymmetry the 'dependency failing to
       * instantiate leaves the parent reading as executed' test pins down.
       * Rewriting this as .catch() would change which errors land on the record.
       */
      function(err) {
        load.e = null;
        load.f = true;
        load.er = err;
        triggerOnload(loader, load, err, true);
        throw err;
      }
    );
  }
  function linkStep(loader, load, id) {
    return load.I.then(function(instantiation) {
      load.s = instantiation[1];
      return Promise.all(instantiation[0].map(function(dep, i) {
        var setter = instantiation[1][i];
        var meta = instantiation[2][i];
        return Promise.resolve(meta === void 0 ? loader.resolve(dep, id) : loader.resolve(dep, id, meta)).then(function(depId) {
          var depLoad = getOrCreateLoad(loader, depId, id, meta);
          return Promise.resolve(depLoad.I).then(function() {
            if (setter) {
              depLoad.i.push(setter);
              if (depLoad.h || !depLoad.I)
                setter(depLoad.n);
            }
            return depLoad;
          });
        });
      })).then(function(depLoads) {
        load.d = depLoads;
      });
    });
  }
  function getOrCreateLoad(loader, id, firstParentUrl, meta) {
    var load = loader[REGISTRY][id];
    if (load)
      return load;
    var ns = createNamespace();
    load = loader[REGISTRY][id] = createLoadRecord(id, [], ns, meta);
    load.I = instantiateStep(loader, load, id, firstParentUrl, meta, ns);
    load.L = linkStep(loader, load, id);
    return load;
  }
  function instantiateAll(loader, load, parent, loaded) {
    if (!loaded[load.id]) {
      loaded[load.id] = true;
      return Promise.resolve(load.L).then(function() {
        if (!load.p || load.p.e === null)
          load.p = parent;
        return Promise.all(load.d.map(function(dep) {
          return instantiateAll(loader, dep, parent, loaded);
        }));
      }).catch(function(err) {
        if (load.f)
          throw err;
        load.e = null;
        triggerOnload(loader, load, err, false);
        throw err;
      });
    }
  }
  function topLevelLoad(loader, load) {
    return load.C = instantiateAll(loader, load, load, idSet()).then(function() {
      return postOrderExec(loader, load, idSet());
    }).then(function() {
      return load.n;
    });
  }
  var nullContext = Object.freeze(/* @__PURE__ */ Object.create(null));
  function postOrderExec(loader, load, seen) {
    if (seen[load.id])
      return;
    seen[load.id] = true;
    if (!load.e) {
      if (load.f)
        throw load.er;
      if (load.E)
        return load.E;
      return;
    }
    var exec = load.e;
    load.e = null;
    var depLoadPromises;
    load.d.forEach(function(depLoad) {
      try {
        var depLoadPromise = postOrderExec(loader, depLoad, seen);
        if (depLoadPromise)
          (depLoadPromises = depLoadPromises || []).push(depLoadPromise);
      } catch (err) {
        load.f = true;
        load.er = err;
        triggerOnload(loader, load, err, false);
        throw err;
      }
    });
    if (depLoadPromises)
      return Promise.all(depLoadPromises).then(doExec);
    return doExec();
    function doExec() {
      try {
        var execPromise = exec.call(nullContext);
        if (execPromise) {
          execPromise = execPromise.then(function() {
            load.C = load.n;
            load.E = null;
            if (!false) triggerOnload(loader, load, null, true);
          }, function(err) {
            load.f = true;
            load.er = err;
            load.E = null;
            if (!false) triggerOnload(loader, load, err, true);
            throw err;
          });
          return load.E = execPromise;
        }
        load.C = load.n;
        load.L = load.I = void 0;
      } catch (err) {
        load.f = true;
        load.er = err;
        throw err;
      } finally {
        triggerOnload(loader, load, load.er, true);
      }
    }
  }
  envGlobal.System = new SystemJS();

  var importMap = { imports: {}, scopes: {}, depcache: {}, integrity: {} };
  var importMapPromise = Promise.resolve();
  systemJSPrototype.prepareImport = function() {
    return importMapPromise;
  };
  systemJSPrototype.getImportMap = function() {
    return JSON.parse(JSON.stringify(importMap));
  };
  systemJSPrototype.addImportMap = function(newMap, mapBase) {
    resolveAndComposeImportMap(newMap, mapBase || baseUrl, importMap);
  };

  if (hasDocument) {
    window.addEventListener("error", function(evt) {
      lastWindowErrorUrl = evt.filename;
      lastWindowError = evt.error;
    });
    var baseOrigin = location.origin;
  }
  systemJSPrototype.createScript = function(url) {
    var script = document.createElement("script");
    script.async = true;
    if (url.indexOf(baseOrigin + "/"))
      script.crossOrigin = "anonymous";
    var integrity = importMap.integrity[url];
    if (integrity)
      script.integrity = integrity;
    script.src = url;
    return script;
  };
  var lastWindowErrorUrl, lastWindowError;
  systemJSPrototype.instantiate = function(url, firstParentUrl) {
    var loader = this;
    return Promise.resolve(this.createScript(url)).then(function(loaderScript) {
      var script = loaderScript;
      return new Promise(function(resolve, reject) {
        script.addEventListener("error", function() {
          reject(Error(errMsg(3, "Error loading " + url + (firstParentUrl ? " from " + firstParentUrl : ""))));
        });
        script.addEventListener("load", function() {
          document.head.removeChild(script);
          if (lastWindowErrorUrl === url) {
            reject(lastWindowError);
          } else {
            resolve(loader.getRegister(url));
          }
        });
        document.head.appendChild(script);
      });
    });
  };

  systemJSPrototype.shouldFetch = function() {
    return false;
  };
  if (typeof fetch !== "undefined")
    systemJSPrototype.fetch = fetch;
  var jsContentTypeRegEx = /^(text|application)\/(x-)?javascript(;|$)/;
  var instantiate = systemJSPrototype.instantiate;
  systemJSPrototype.instantiate = function(url, parent, meta) {
    var loader = this;
    if (!this.shouldFetch(url, parent, meta))
      return instantiate.apply(this, arguments);
    return this.fetch(url, {
      credentials: "same-origin",
      integrity: importMap.integrity[url],
      meta
    }).then(function(res) {
      if (!res.ok)
        throw Error(errMsg(7, res.status + " " + res.statusText + ", loading " + url + (parent ? " from " + parent : "")));
      var contentType = res.headers.get("content-type");
      if (!contentType || !jsContentTypeRegEx.test(contentType))
        throw Error(errMsg(4, 'Unknown Content-Type "' + contentType + '", loading ' + url + (parent ? " from " + parent : "")));
      return res.text().then(function(source) {
        if (source.indexOf("//# sourceURL=") < 0)
          source += "\n//# sourceURL=" + url;
        (0, eval)(source);
        return loader.getRegister(url);
      });
    });
  };

  systemJSPrototype.resolve = function(id, parentUrl) {
    var pending = this.registrations.get(id);
    if (pending) {
      if (pending.registration || pending.taken)
        return id;
      if (pending.url)
        return pending.url;
    }
    parentUrl = parentUrl || !true  || baseUrl;
    return resolveImportMap(importMap, resolveIfNotPlainOrUrl(id, parentUrl) || id, parentUrl) || throwUnresolved(id, parentUrl);
  };
  function throwUnresolved(id, parentUrl) {
    throw Error(errMsg(8, "Unable to resolve bare specifier '" + id + (parentUrl ? "' from " + parentUrl : "'")));
  }

  systemJSPrototype.hook("instantiate", function(next) {
    return function(url, firstParentUrl, meta) {
      var preloads = (importMap).depcache[url];
      if (preloads) {
        for (var i = 0; i < preloads.length; i++)
          getOrCreateLoad(this, this.resolve(preloads[i], url), url);
      }
      return next.call(this, url, firstParentUrl, meta);
    };
  });

  if (hasSelf && typeof importScripts === "function")
    systemJSPrototype.instantiate = function(url) {
      var loader = this;
      return Promise.resolve().then(function() {
        importScripts(url);
        return loader.getRegister(url);
      });
    };

  var toStringTag = Symbol.toStringTag;
  systemJSPrototype.get = function(id) {
    var load = this[REGISTRY][id];
    if (load && load.e === null && !load.E) {
      if (load.f)
        return null;
      return load.n;
    }
  };
  systemJSPrototype.set = function(id, module) {
    {
      try {
        new URL(id);
      } catch (err) {
        console.warn(Error(errMsg("W3", '"' + id + '" is not a valid URL to set in the module registry')));
      }
    }
    var ns;
    if (module[toStringTag] === "Module") {
      ns = module;
    } else {
      ns = Object.assign(/* @__PURE__ */ Object.create(null), module);
      Object.defineProperty(ns, toStringTag, { value: "Module" });
    }
    var done = Promise.resolve(ns);
    var load = this[REGISTRY][id] || (this[REGISTRY][id] = {
      id,
      i: [],
      h: false,
      d: [],
      e: null,
      er: void 0,
      f: false,
      E: void 0
    });
    if (load.e || load.E)
      return false;
    Object.assign(load, {
      n: ns,
      I: void 0,
      L: void 0,
      C: done
    });
    return ns;
  };
  systemJSPrototype.has = function(id) {
    var load = this[REGISTRY][id];
    return !!load;
  };
  systemJSPrototype.delete = function(id) {
    var registry = this[REGISTRY];
    var load = registry[id];
    if (!load || load.p && load.p.e !== null || load.E)
      return false;
    var importerSetters = load.i;
    var ownSetters = load.s;
    if (load.d && ownSetters)
      load.d.forEach(function(depLoad, i) {
        var setter = ownSetters[i];
        if (!setter)
          return;
        var importerIndex = depLoad.i.indexOf(setter);
        if (importerIndex !== -1)
          depLoad.i.splice(importerIndex, 1);
      });
    delete registry[id];
    return function() {
      var load2 = registry[id];
      if (!load2 || !importerSetters || load2.e !== null || load2.E)
        return false;
      importerSetters.forEach(function(setter) {
        load2.i.push(setter);
        setter(load2.n);
      });
      importerSetters = null;
    };
  };
  systemJSPrototype.entries = function() {
    var loader = this;
    return keyIterator(
      Object.keys(loader[REGISTRY]),
      function(key) {
        var ns = loader.get(key);
        return ns === void 0 ? void 0 : [key, ns];
      }
    );
  };

})();
