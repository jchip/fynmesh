// import "./global-this-polyfill.ts";
import { satisfy, parseRange } from "./semver.js";
import { getCurrentScript, startsWithDotSlash, createObject, containerNameToId, addElementToArrayInObject, firstObjectKey, } from "./utils.js";
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
        // const _import = systemJSPrototype.import;
        // systemJSPrototype.import = function (
        //   id: string,
        //   parentUrl: string,
        //   meta: any
        // ) {
        //   const url = federation.getUrlForId(id);
        //   if (url) {
        //     return _import.call(this, url, parentUrl, meta);
        //   }
        //   return _import.call(this, id, parentUrl, meta);
        // };
        this.$B = createObject();
        this.$SS = createObject();
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
                return federation.sysResolve.call(this, id, parentURL, meta);
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
        const requiredVersion = federation.matchRvm(importName, container, rvmMapData);
        // 3. match existing loaded module from shared info
        const scope = federation.$SS[container.scope];
        const shareMeta = scope && scope[importName];
        console.debug("  shareMeta", shareMeta, "\n  requiredVersion", requiredVersion, "\n  importVersion", importVersion);
        // First try to find a loaded module that satisfies the version requirement
        let matchedVersion = requiredVersion
            ? federation.semverMatch(importName, shareMeta, requiredVersion, true, importVersion)
            : importVersion;
        // If no loaded module found but required version exists, try again without loadedOnly restriction
        if (!matchedVersion && shareMeta) {
            matchedVersion = federation.semverMatch(importName, shareMeta, requiredVersion, false, importVersion);
            console.debug("  No loaded module found for", importName, "- falling back to unloaded module with version", matchedVersion);
        }
        const shareInfo = shareMeta && shareMeta[matchedVersion];
        // || firstObjectKey(shareMeta)
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
        const resolved = federation.sysResolve.call(this, shareId, shareParentUrl, meta);
        federation.addIdUrlMap(shareId, resolved);
        if (id !== shareId) {
            federation.addIdUrlMap(id, resolved);
        }
        if (shareInfo) {
            shareInfo.url = resolved;
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
        let importName = "";
        let importVersion = "";
        if (_SS[id]) {
            // import is using original import id
            importName = id;
            importVersion = firstObjectKey(_SS[id].versions);
        }
        else {
            for (const name in _SS) {
                const _sm = _SS[name];
                for (const version in _sm.versions) {
                    const _si = _sm.versions[version];
                    if (id === _si.id) {
                        console.debug("found import name", name, "version", version, "for id", id);
                        importName = name;
                        importVersion = version;
                        break;
                    }
                }
            }
        }
        return { n: importName, v: importVersion };
    }
    /**
     *
     * @param importName
     * @param container
     * @param rvmMapData
     * @returns
     */
    /*@__MANGLE_PROP__*/
    matchRvm(importName, container, rvmMapData) {
        const sc = container.$SC[importName];
        if (!sc) {
            console.debug("  matchRvm - no requiredVersion due to no container scope found for importName", importName);
            return "";
        }
        if (!sc.options.import) {
            console.debug("  matchRvm - import is false for importName", importName, "\n  Using requiredVersion from options directly", sc.options.requiredVersion);
            return sc.options.requiredVersion;
        }
        const rvm = sc.rvm;
        if (rvm && rvmMapData) {
            for (const _src of rvmMapData) {
                if (rvm[_src]) {
                    const requiredVersion = rvm[_src];
                    console.debug("found required version for import name", importName, requiredVersion);
                    return requiredVersion;
                }
            }
        }
        return "";
    }
    /**
     *
     * @param shareMeta
     * @param semver
     * @param fallbackVer
     * @returns
     */
    /*@__MANGLE_PROP__*/
    semverMatch(name, shareMeta, semver, loadedOnly, fallbackVer) {
        const svRange = parseRange(semver);
        let matchedVersion = "";
        for (const ver in shareMeta) {
            if ((!loadedOnly || shareMeta[ver].srcIdx !== undefined) &&
                satisfy(svRange, ver)) {
                console.debug(name, "found a shared version", ver, "that satisfied semver", semver);
                matchedVersion = ver;
                break;
            }
        }
        if (!matchedVersion) {
            !loadedOnly &&
                console.warn(name, "no version satisfied", semver, "found, fallback:", fallbackVer);
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
        return rd && rd.url;
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
            if (reqSemver) {
                const svRange = parseRange(reqSemver);
                const versions = Object.keys(this.$iU[id]);
                const version = versions.find((v) => v !== "_" && satisfy(svRange, v));
                return this.$iU[id][version];
            }
            return this.$iU[id]._;
        }
        // else the id may be the original vanilla module name, no version or unique info that
        // we can use to lookup its registered url or definition
        return null;
        // return this.$iU[startsWithDotSlash(id) ? id.slice(2) : id];
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
            addElementToArrayInObject(this.$uI, url, {
                id,
                version: container?.version,
            });
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
        const { n, v } = this.findImportSpecFromId(id, container);
        const sc = n && v && this.$SS[container.scope];
        const shareInfo = sc && sc[n][v];
        if (shareInfo) {
            const ix = shareInfo.sources.findIndex((s) => s.id === id);
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
            if (!firstObjectKey(pC)) {
                // reset pending object
                this.$pC = createObject();
            }
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
            return containerMap[version];
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
        // const container = _F.getContainer(options.c);
        // if (!container) {
        //   console.warn("mfBind container not yet registered", options.c);
        // } else if (!container.$SS) {
        //   console.warn("mfBind container sharescope is not init");
        // } else {
        //   console.debug(
        //     "binding to container, from module",
        //     id,
        //     "to",
        //     container.id
        //   );
        // }
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
                    if (addElementToArrayInObject(_F.$pC, options.c, {
                        id,
                        l: () => this._register(id, dep, declare, metas, src),
                    })) {
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
            let matchedVersion = semver && this.semverMatch(name, shareMeta, semver, false);
            if (!matchedVersion && (!semver || fallbackToFirst)) {
                matchedVersion = firstObjectKey(shareMeta);
            }
            const shareInfo = shareMeta[matchedVersion];
            if (shareInfo) {
                if (shareInfo.url) {
                    return this._System.import(shareInfo.url);
                }
                else {
                    const source = this.pickShareSource(shareInfo);
                    const parentUrl = this.getUrlForId(containerNameToId(source.container));
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
        const _ss = this.$SS[scope];
        const _sm = _ss[key] || (_ss[key] = createObject());
        const _si = _sm[version] || (_sm[version] = createObject());
        if (addElementToArrayInObject(_si, "sources", {
            id,
            container,
            version: containerVersion,
        })) {
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
        const _ss = this.$SS[scope] || (this.$SS[scope] = shareScope || createObject());
        if (shareScope && _ss !== shareScope) {
            throw new Error(`share scope ` + scope + ` already initialized.`);
        }
        return _ss;
    }
}
/**
 *
 */
class Container {
    /**
     *
     * @param name
     * @param scopeName
     * @param version - version of the container
     */
    constructor(id, name, scopeName, version = "0.0.0", federation) {
        this.scope = scopeName;
        this.id = id;
        this.name = name;
        this.version = version;
        /*@__MANGLE_PROP__*/
        this.Fed = federation || _global.Federation;
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
            const _rvm = this.$SC[key].rvm;
            for (const _m of maps) {
                _rvm[_m[0]] = _m[1];
            }
        }
        // this.Fed._S(key, meta, version, uniqId, this.scope);
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
_global.Federation = new FederationJS();
