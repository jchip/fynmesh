# 8/30/2026

## Packages

-   `create-fynapp@1.1.3` `(1.1.2 => 1.1.3)`

## Commits

-   `packages/create-fynapp`

    -   FYM-248: create in the current directory outside the fynmesh monorepo

# 8/30/2026

## Packages

-   `create-fynapp@1.1.2` `(1.1.1 => 1.1.2)`

## Commits

-   `packages/create-fynapp`

    -   FYM-247: pin nix-clap to 2.0.0 so published bins match the exec API they use

# 8/30/2026

## Packages

-   `@fynmesh/kernel@1.1.1` `(1.1.0 => 1.1.1)`
-   `create-fynapp@1.1.1` `(1.1.0 => 1.1.1)`

## Commits

-   `packages/kernel`

    -   FYM-242: derive the kernel version from package.json instead of hardcoding it

-   `packages/create-fynapp`

    -   FYM-246: repo-level publish gate for fyn overrides, release-gate test cleanups
    -   FYM-245: harden release gate: whole fyn key, framework publish check, portable scan
    -   FYM-244: remove local fyn dependency overrides from published create-fynapp and templates
    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/demo-server`

    -   FYM-229: match only exact or versioned dist ids for shell-initiated FynApps
    -   FYM-228: clear stale pending shell region after a failed FynApp load

-   `packages/fynapp-1`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-1-b`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-2-react18`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-3-marko`

    -   resync demo fyn-lock.yaml files after verification build
    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-4-vue`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-5-preact`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-6-react`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-7-solid`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-8-svelte`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-ag-grid`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-ag-grid-lib`

    -   resync demo fyn-lock.yaml files after verification build
    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-design-tokens`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-notes`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-react-18`

    -   resync demo fyn-lock.yaml files after verification build
    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-react-middleware`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-shell-mw`

    -   FYM-229: match only exact or versioned dist ids for shell-initiated FynApps
    -   FYM-228: clear stale pending shell region after a failed FynApp load
    -   resync fyn-lock.yaml files after the 1.1.0 release
    -   FYM-242: derive the kernel version from package.json instead of hardcoding it

-   `packages/fynapp-sidebar`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-test-shared`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/fynapp-x1-v1`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/shared-demo-utils`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `packages/test-nested-deps`

    -   resync fyn-lock.yaml files after the 1.1.0 release

-   `scripts`

    -   FYM-246: repo-level publish gate for fyn overrides, release-gate test cleanups

# 8/28/2026

## Packages

-   `@fynmesh/kernel@1.1.0` `(1.0.0 => 1.1.0)`
-   `create-fynapp@1.1.0` `(1.0.0 => 1.1.0)`

## Commits

-   `packages/kernel`

    -   FYM-236: skip federation container init when the share scope already exists
    -   FYM-211: stop the preload-hints design reading as shipped
    -   FYM-210: type the manifests exposes as what the build emits
    -   FYM-206: preload the file a combined module will really be fetched as
    -   docs: make the dist JSON artifacts and their uses explicit
    -   Trim remaining kernel code; fix waitFor waiter leak (26,663 -> 26,316)
    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)
    -   FYM-196: correct license in kernel and create-fynapp READMEs

-   `packages/create-fynapp`

    -   FYM-213: read the map an app offers, not a file it may not emit
    -   docs: make the dist JSON artifacts and their uses explicit
    -   Migrate FynApp authoring docs to the renamed kernel contract
    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)
    -   FYM-196: correct license in kernel and create-fynapp READMEs

-   `packages/demo-server`

    -   FYM-231,FYM-233: route shell unload through the kernel shutdown lifecycle
    -   FYM-230: eliminate shell middleware TypeScript warnings
    -   FYM-202: defer React 18 provider and fynapp-x1-v1 to browser idle
    -   FYM-203: preload only the chunks this build actually produced
    -   FYM-213: read the map an app offers, not a file it may not emit
    -   FYM-207: declare the combined-bundle maps in the shell page
    -   demo: preload the shell chunks as scripts, not as modules
    -   demo: preload the file the runtime will actually request
    -   demo: pick the loader variant in the site build too, not just dev-proxy
    -   demo: switch the loader pair with FEDERATION, frozen standard vs live fork
    -   demo: serve systemjs and federation-js from the live rollup-federation build
    -   FYM-201: keep landing page buttons white after they are visited
    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)
    -   FYM-200: replace dead jest scaffolding with vitest and test findMissingLocalRefs
    -   FYM-199: ship lazy-loader.js and fail build on missing asset refs

-   `packages/esm-pkg`

    -   FYM-194: normalize package.json formatting from fynpo prepare

-   `packages/test-rollup-externals`

    -   FYM-194: normalize package.json formatting from fynpo prepare

-   `packages/fynapp-2-react18`

    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)

-   `packages/fynapp-6-react`

    -   Migrate FynApp authoring docs to the renamed kernel contract
    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)

-   `packages/fynapp-react-middleware`

    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)

-   `packages/fynapp-shell-mw`

    -   FYM-231,FYM-233: route shell unload through the kernel shutdown lifecycle
    -   FYM-230: eliminate shell middleware TypeScript warnings
    -   FYM-202: defer React 18 provider and fynapp-x1-v1 to browser idle
    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)

-   `packages/shared-demo-utils`

    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)

-   `notes`

    -   FYM-213: read the map an app offers, not a file it may not emit
    -   docs: record the second reader of federation.json bundles
    -   docs: make the dist JSON artifacts and their uses explicit
    -   Migrate FynApp authoring docs to the renamed kernel contract
    -   Trim remaining kernel code; fix waitFor waiter leak (26,663 -> 26,316)
    -   Shrink browser kernel bundle by 10 KB (36,716 -> 26,663, -27.4%)

-   `scripts`

    -   FYM-213: read the map an app offers, not a file it may not emit
    -   demo: combine each FynApps tiny chunks in the production build

-   `MISC`

    -   FYM-198: update fyn/fynpo to 2.1.6 and drop local fynpo link

# 8/12/2026

## Packages

-   `@fynmesh/kernel@1.0.0` `(0.0.0 => 1.0.0)`
-   `create-fynapp@1.0.0` `(0.0.0 => 1.0.0)`
-   `rollup-wrap-plugin@1.0.0` `(0.0.0 => 1.0.0)`

## Commits

-   `packages/kernel`

    -   [major] FYM-194: declare packages patterns and reset versions to 0.0.0 for initial publish
    -   FYM-191: add Apache-2.0 license and publish metadata to kernel, create-fynapp, rollup-wrap-plugin
    -   use classic script preload for fynapp entry files
    -   convert 9 more members to #private (37,065 -> 36,722 B)
    -   fix two redundant computations in the middleware executor
    -   shrink the browser kernel by 9% (40,780 -> 37,128 B)
    -   FYM-152: reconcile authoritative tracker references
    -   FYM-29: add development bootstrap error overlay
    -   CFA-31: bundle the kernel public entrypoint
    -   CFA-30: remove false CommonJS kernel export
    -   CFA-29: install kernel declaration dependency
    -   FYM-150: add AbortSignal to bus request and reject in-flight waits on requester dispose
    -   FYM-149: remove abort hook from caller signal on unsubscribe
    -   FYM-7: add suspend()/resume() FynUnit hooks and kernel suspend/resumeFynApp
    -   FYM-6: record failed bootstrap as observable per-FynApp state (error boundary)
    -   FYM-5: add kernel-side FynApp lifecycle-state tracking (mount tracking)
    -   FYM-140: harden FynBus dispose semantics, kernel facade, tracking, and telemetry
    -   FYM-144: run FynUnit initialize once per runtime across defer and resume
    -   FYM-143: apply middleware on first pass when setup signals ready
    -   FYM-141: add FynBus kernel-flow, composition, stress, and type-contract tests
    -   FYM-140: freeze FynBus meta so subscribers cannot tamper platform-stamped identity
    -   FYM-139: add 107 FynBus edge-case, RPC, and lifecycle tests
    -   FYM-138: fix FynBus telemetry double prefix by using unprefixed capture names
    -   FYM-15: implement FynBus request/response with late-handler wait and timeout
    -   FYM-14: implement FynBus pub/sub with channels and per-app facades
    -   FYM-72: document loadFynApp/loadFynAppsByName hybrid error contract (null + throw)
    -   core/kernel: fix telemetry flush/error-capture and registry review findings, add regression tests
    -   FYM-122 FYM-123 FYM-124 FYM-125 FYM-126: Refactor core/kernel for DRY and clean code
    -   FYM-121: Add telemetry capture point integration tests
    -   FYM-53, FYM-54: Add KernelTelemetry system with capture points
    -   FYM-103: Decompose callMiddlewares method
    -   FYM-102: Extract shared middleware override context creation and execution
    -   FYM-104: Decompose bootstrapFynApp method
    -   FYM-109: Extract middleware context factory function
    -   FYM-101: Extract shared findExecutionOverride to util.ts
    -   FYM-105: Extract checkAlreadyLoaded to KernelCore base class
    -   FYM-106: Extract middleware target selection helper
    -   FYM-108: Extract removeFromRegistry helper in KernelCore
    -   FYM-111: Reuse noOpFynUnit from use-middleware.ts
    -   FYM-110: Remove redundant type cast in middleware-manager.ts
    -   FYM-107: Define middleware magic string constants
    -   FYM-99: Fix FynApp initialization with empty middleware array
    -   FYM-89: Fix consumer-first loading by sharing middlewareContext across runtimes
    -   FYM-79: Implement shared state architecture with registry pattern
    -   FYM-60: Remove string-indexed private field access in kernel
    -   FYM-74: Remove outdated tests and fix remaining failures
    -   FYM-74: Fix 32 broken kernel test fixtures after module refactoring
    -   FYM-68: Fix ModuleLoader execution override context kernel being null
    -   FYM-69: Allow FynApp degraded execution with deferOk flag
    -   FYM-67: Resume deferred bootstraps on failure
    -   fix multi-version FynApp loading by using name@version key
    -   prevent duplicate FynApp loading by returning existing instance
    -   FYM-56: consolidate middleware scanning into MiddlewareManager
    -   add shutdown lifecycle hook to FynUnit and kernel
    -   fix kernel error isolation and middleware consumer deferral
    -   preload design doc
    -   redesign execution and middleware lifecycle
    -   Add structured error reporting with KernelError class hierarchy
    -   warn cyclic dependencies only
    -   shell demo
    -   Rename requireVersion to semver across codebase
    -   Add kernel design documentation and update preloading status
    -   Add Phase 2 preload depth control to kernel
    -   Add zero-kernel routing architecture design
    -   Add route-based preloading design document
    -   Add Phase 1 preloading optimization for FynApp entry files
    -   Add debug logging for shared-providers dependency resolution
    -   Strip console.debug and console.log from minified kernel
    -   Add lazy loading for FynApp 2
    -   continue kernel refactoring
    -   kernel refactoring
    -   kernel tests
    -   6
    -   5
    -   4
    -   3
    -   automatic fynapp dependencies resolving
    -   2
    -   1
    -   1
    -   more middleware design and implementation
    -   demo: fynapp-shell-mw demo auto apply middleware
    -   test: add comprehensive tests for universal middleware support
    -   feat: implement universal middleware support with autoApplyScope
    -   tests for kernel
    -   update docs
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   wip middleware architecture
    -   dynamic fynapp dependency fallback design
    -   more work on design, architecture, and kernel
    -   7
    -   6
    -   5
    -   1

-   `packages/bundle-esm-share`

    -   FYM-191: mark demo-rollup-externals packages private
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   5
    -   3
    -   1

-   `packages/create-fynapp`

    -   FYM-197: fix create-fynapp prepublish gate - aveazul typings and lint scope
    -   [major] FYM-194: declare packages patterns and reset versions to 0.0.0 for initial publish
    -   FYM-191: add Apache-2.0 license and publish metadata to kernel, create-fynapp, rollup-wrap-plugin
    -   FYM-154: replace private artifactory urls with public npm in create-fynapp lockfile
    -   CFA-37: keep demo React adapters out of public scaffolds
    -   CFA-32: fix packaged example references
    -   CFA-28: drop demo dependency from React template
    -   CFA-27: use fyn for global CLI install
    -   CFA-24: publish only supported React templates
    -   CFA-23: exercise the renamed built check command
    -   CFA-22: use inspection terms for create inputs
    -   CFA-8: remove inert component prompts
    -   CFA-7: validate create inputs and target paths
    -   CFA-6: expose only complete framework templates
    -   CFA-18: make CLI execution guards URL safe
    -   CFA-11: deliver parsed CLI options to handlers
    -   CFA-5: make ESM CLI artifacts executable
    -   CFA-21: port output checks to the renamed API
    -   CFA-12: align release CLI documentation
    -   CFA-14: rename local artifact checks
    -   CFA-13: sync FynApp agent contract
    -   CFA-15: declare middleware example provider
    -   CFA-10: reject stale or mismatched FynApp output
    -   CFA-9: run app commands through streaming fyn processes
    -   CFA-19: make API documentation warning-free
    -   CFA-17: enforce lint in the prepublish gate
    -   CFA-16: exclude development examples from package
    -   FYM-1: retarget create-fynapp for LLM coding agents
    -   FYM-116: Fix test/source drift in create-fynapp plugin-wrapper test
    -   FYM-115: Create shared rollup config factory for demo apps
    -   FYM-97: Fix React template to use create-fynapp helpers and FynUnit pattern
    -   FYM-94: Replace debug console.logs with conditional logging
    -   shell demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   5
    -   3
    -   update demo fynapps federation config
    -   2
    -   1
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   wip create-fynapp 3
    -   wip create-fynapp 2
    -   starting to implement rollup config management in create-fynapp
    -   6
    -   4
    -   1

-   `packages/demo-server`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-162: stop registering the no-op unregister service worker
    -   FYM-161: use minified spectre css on shell page in production
    -   FYM-160: generate _headers marking content-hashed chunks immutable
    -   FYM-159: preload shell startup fynapp chunks to collapse load waterfall
    -   FYM-158: document NODE_ENV=production deploy via fyn publish-demo
    -   FYM-156: retarget demo domain from fynetiq.com to lm360.ai
    -   FYM-155: include ag-grid, ag-grid-lib, and notes fynapps in demo deploy
    -   FYM-153: switch demo deploy to cloudflare pages via force-pushed gh-pages
    -   FYM-98: Add fynapp-notes demo and update HOWTO guide
    -   add AG Grid federation demo with shared library provider
    -   add docs and READMEs for demo
    -   add meta to demo
    -   removing sw
    -   convert shell.html to template for production builds
    -   remove html output files
    -   add Google verification file to build output
    -   improve button colors and visibility in landing page and shell demo
    -   improve landing page: real framework logos, fixed github icon, cleaner feature section
    -   update description to progressive scalable enterprise applications
    -   always render SEO meta tags in demo pages
    -   add marketing landing page and framework roadmap
    -   redesign execution and middleware lifecycle
    -   shell demo
    -   test missing static shared import error
    -   setupFynAppOutputConfig from create-fynapp
    -   Improve layout spacing and button alignment
    -   Add lazy loading for FynApp 2
    -   add demo/fynapp-8-svelte
    -   4
    -   remove explicit loading middleware fynapps
    -   automatic fynapp dependencies resolving
    -   1
    -   demo: fix gh pages publish
    -   more middleware design and implementation
    -   demo: fynapp-shell-mw demo auto apply middleware
    -   update gh-publish
    -   fix demo site service worker base path
    -   dev tools for service worker
    -   github repo link in demo site
    -   add service worker to demo site
    -   support building demo to a github pages site
    -   update docs
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   add systemjs runtime to demo-server
    -   serve federation-js bundle according to env
    -   Update fynapp-2-react18 to use federated components from fynapp-x1 using React 18
    -   add styling for components in fynapp-x1
    -   make the two react providing fynapp use the same name
    -   add another major version of fynapp-x1 demo
    -   7
    -   5
    -   4
    -   3
    -   1

-   `packages/esm-ag-grid`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   fix AG Grid checkbox column showing duplicate order ID text
    -   add AG Grid federation demo with shared library provider

-   `packages/esm-ag-grid-react`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   fix AG Grid checkbox column showing duplicate order ID text
    -   add AG Grid federation demo with shared library provider

-   `packages/esm-pkg`

    -   FYM-191: mark demo-rollup-externals packages private
    -   1

-   `packages/esm-react-18`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   fix modal dialog from fynapp-x1 components
    -   3
    -   1

-   `packages/esm-react-dom-18`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   fix demo
    -   add AG Grid federation demo with shared library provider
    -   more middleware design and implementation
    -   fix modal dialog from fynapp-x1 components
    -   continue middleware system and more demos - design tokens middleware
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   3
    -   1

-   `packages/fynapp-1`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-148: key demo get-status handler guard by bus facade so re-bootstrap re-registers
    -   FYM-18: add FynBus demo to fynapp-1 and fynapp-2-react18
    -   FYM-113: Consolidate fynapp-1 and fynapp-1-b into config-driven variants
    -   FYM-112: Extract shared demo utilities package for middleware patterns
    -   FYM-91: Add consumer-first loading auto-sync for shared counter
    -   add docs and READMEs for demo
    -   redesign execution and middleware lifecycle
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   Improve layout spacing and button alignment
    -   some fynapp-1 layout changes
    -   6
    -   5
    -   3
    -   update demo fynapps federation config
    -   1
    -   more middleware design and implementation
    -   demo: fynapp-shell-mw demo auto apply middleware
    -   design tokens theme selection demo
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   use dummy virtual module to get rollup build going
    -   fix fynapp-1 react-dom import
    -   misc types update for demo/fynapp-1
    -   Fix Modal transparency and add configurable overlay
    -   add styling for components in fynapp-x1
    -   make the two react providing fynapp use the same name
    -   add another major version of fynapp-x1 demo
    -   7
    -   6
    -   5
    -   4
    -   3
    -   1

-   `packages/fynapp-1-b`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-113: Consolidate fynapp-1 and fynapp-1-b into config-driven variants
    -   FYM-112: Extract shared demo utilities package for middleware patterns
    -   FYM-91: Add consumer-first loading auto-sync for shared counter
    -   allow fynapp-2 and fynapp-1-b to render without counter provider
    -   add docs and READMEs for demo
    -   redesign execution and middleware lifecycle
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   6
    -   5
    -   3
    -   more middleware design and implementation
    -   demo: fynapp-shell-mw demo auto apply middleware
    -   design tokens theme selection demo
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system

-   `packages/fynapp-2-react18`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-18: add FynBus demo to fynapp-1 and fynapp-2-react18
    -   FYM-112: Extract shared demo utilities package for middleware patterns
    -   FYM-91: Add consumer-first loading auto-sync for shared counter
    -   FYM-90: Fix fynapp-2-react18 shared counter connection
    -   allow fynapp-2 and fynapp-1-b to render without counter provider
    -   add docs and READMEs for demo
    -   redesign execution and middleware lifecycle
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   5
    -   3
    -   update demo fynapps federation config
    -   more middleware design and implementation
    -   demo: fynapp-shell-mw demo auto apply middleware
    -   design tokens theme selection demo
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   use dummy virtual module to get rollup build going
    -   demo/fynapp-2-react18 types cleanup
    -   Update fynapp-2-react18 to use federated components from fynapp-x1 using React 18
    -   6
    -   5
    -   3
    -   1

-   `packages/fynapp-3-marko`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-130: add missing typescript devDependency to fynapp-3-marko so dist build works
    -   add docs and READMEs for demo
    -   update shell demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   update demo fynapps federation config
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   use dummy virtual module to get rollup build going
    -   6
    -   3

-   `packages/fynapp-4-vue`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   add docs and READMEs for demo
    -   update shell demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   update demo fynapps federation config
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   use dummy virtual module to get rollup build going
    -   6
    -   3

-   `packages/fynapp-5-preact`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   add docs and READMEs for demo
    -   update shell demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   update demo fynapps federation config
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   use dummy virtual module to get rollup build going
    -   6
    -   3

-   `packages/fynapp-6-react`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   CFA-37: keep demo React adapters out of public scaffolds
    -   FYM-115: Create shared rollup config factory for demo apps
    -   FYM-88: Fix late join state synchronization in consumer FynApps
    -   FYM-69: Allow FynApp degraded execution with deferOk flag
    -   redesign execution and middleware lifecycle
    -   update shell demo
    -   setupFynAppOutputConfig from create-fynapp
    -   6
    -   3
    -   1
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   use dummy virtual module to get rollup build going
    -   demo/fynapp-6-react types cleanup
    -   6
    -   5
    -   3

-   `packages/fynapp-7-solid`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   add docs and READMEs for demo
    -   update shell demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   update demo fynapps federation config
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   use dummy virtual module to get rollup build going
    -   7
    -   6
    -   3

-   `packages/fynapp-8-svelte`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   add docs and READMEs for demo
    -   update shell demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   add demo/fynapp-8-svelte

-   `packages/fynapp-ag-grid`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   fix demo
    -   fix AG Grid checkbox column showing duplicate order ID text
    -   add AG Grid federation demo with shared library provider

-   `packages/fynapp-ag-grid-lib`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-157: bind ag-grid-lib react to shared React 19 to fix React #525
    -   fix AG Grid checkbox column showing duplicate order ID text
    -   add AG Grid federation demo with shared library provider

-   `packages/fynapp-design-tokens`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   CFA-37: keep demo React adapters out of public scaffolds
    -   FYM-115: Create shared rollup config factory for demo apps
    -   setupFynAppOutputConfig from create-fynapp
    -   5
    -   2
    -   more middleware design and implementation
    -   design tokens theme selection demo
    -   continue middleware system and more demos - design tokens middleware

-   `packages/fynapp-notes`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   CFA-37: keep demo React adapters out of public scaffolds
    -   FYM-115: Create shared rollup config factory for demo apps
    -   FYM-99: Fix FynApp initialization with empty middleware array
    -   FYM-98: Add fynapp-notes demo and update HOWTO guide

-   `packages/fynapp-react-18`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   add docs and READMEs for demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   3
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   make the two react providing fynapp use the same name
    -   6
    -   5
    -   3
    -   1

-   `packages/fynapp-react-middleware`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-92: Add createUseSharedCounter hook factory for production use
    -   FYM-79: Implement shared state architecture with registry pattern
    -   fix kernel error isolation and middleware consumer deferral
    -   redesign execution and middleware lifecycle
    -   setupFynAppOutputConfig from create-fynapp
    -   3
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system

-   `packages/fynapp-shell-mw`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   CFA-37: keep demo React adapters out of public scaffolds
    -   FYM-146: rename shadowed container local that broke component render path
    -   FYM-146: check declared exposes before probing ./component to avoid 404 console noise
    -   FYM-145: reuse tracked React root in shell tryRenderComponent to avoid double createRoot
    -   fix demo
    -   FYM-115: Create shared rollup config factory for demo apps
    -   FYM-99: Add fynapp-notes to shell demo dropdown
    -   FYM-90: Fix fynapp-2-react18 shared counter connection
    -   fix shell demo header text contrast
    -   FYM-76: Implement shell region visibility toggle
    -   fix shell demo FynApp re-rendering when switching back
    -   add AG Grid federation demo with shared library provider
    -   fix shell container ID to match design-tokens CSS scoping
    -   add docs and READMEs for demo
    -   improve button colors and visibility in landing page and shell demo
    -   redesign execution and middleware lifecycle
    -   update shell demo
    -   shell demo
    -   setupFynAppOutputConfig from create-fynapp
    -   more middleware design and implementation
    -   demo: fynapp-shell-mw demo auto apply middleware

-   `packages/fynapp-sidebar`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   CFA-37: keep demo React adapters out of public scaffolds
    -   FYM-115: Create shared rollup config factory for demo apps
    -   add docs and READMEs for demo
    -   redesign execution and middleware lifecycle
    -   update shell demo
    -   shell demo

-   `packages/fynapp-test-shared`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   resync fyn-lock.yaml files with current dependencies
    -   add docs and READMEs for demo
    -   redesign execution and middleware lifecycle
    -   shell demo
    -   test missing static shared import error

-   `packages/fynapp-x1-v1`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-189: bump fynapp-react-lib container version to 19.2.8
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-114: Consolidate fynapp-x1-v1 and fynapp-x1-v2 component libraries
    -   add docs and READMEs for demo
    -   Rename requireVersion to semver across codebase
    -   setupFynAppOutputConfig from create-fynapp
    -   Improve layout spacing and button alignment
    -   3
    -   update demo fynapps federation config
    -   2
    -   more middleware design and implementation
    -   fix modal dialog from fynapp-x1 components
    -   design tokens theme selection demo
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   update fynlock
    -   Fix Modal transparency and add configurable overlay
    -   add styling for components in fynapp-x1
    -   make the two react providing fynapp use the same name
    -   add another major version of fynapp-x1 demo

-   `packages/pkg-esm-react-18`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   5
    -   2

-   `packages/regular-react-app`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   continue middleware system and more demos - design tokens middleware
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   5
    -   1

-   `packages/rollup-wrap-plugin`

    -   doc: rollup-wrap-plugin README
    -   [major] FYM-194: declare packages patterns and reset versions to 0.0.0 for initial publish
    -   FYM-191: add Apache-2.0 license and publish metadata to kernel, create-fynapp, rollup-wrap-plugin
    -   update dev tools and middleware system

-   `packages/shared-demo-utils`

    -   resync fyn-lock.yaml files with current dependencies
    -   FYM-18: add FynBus demo to fynapp-1 and fynapp-2-react18
    -   FYM-128: make shared-demo-utils a package so @fynmesh/kernel resolves (fixes cross-app shared counter)
    -   FYM-113: Consolidate fynapp-1 and fynapp-1-b into config-driven variants
    -   FYM-114: Consolidate fynapp-x1-v1 and fynapp-x1-v2 component libraries
    -   FYM-112: Extract shared demo utilities package for middleware patterns

-   `packages/test-nested-deps`

    -   FYM-191: mark non-publishable packages private so only the five release
    -   FYM-188: update esm-react-19 and esm-react-dom-19 to React 19.2.8
    -   Rename requireVersion to semver across codebase
    -   more middleware design and implementation
    -   continue middleware system and more demos - design tokens middleware
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   3
    -   2

-   `.cursor`

    -   more middleware design and implementation
    -   update dev tools and middleware system

-   `demo`

    -   add docs and READMEs for demo
    -   update dev tools and middleware system
    -   chore: rename fynapp-x1 to fynapp-x1-v1
    -   update dependencies
    -   add a newRollupPlugin wrapper to be able to track rollup plugin config
    -   update fynlock
    -   Update fynapp-2-react18 to use federated components from fynapp-x1 using React 18
    -   Fix Modal transparency and add configurable overlay
    -   add styling for components in fynapp-x1
    -   make the two react providing fynapp use the same name
    -   7

-   `misc`

    -   5
    -   3
    -   3
    -   1

-   `notes`

    -   FYM-190: correct stale provenance in create-fynapp release handoff
    -   FYM-159: record live post-deploy measurements for shell load perf
    -   FYM-163: record shell load perf outcomes and dual-react decision in notes
    -   FYM-159: preload shell startup fynapp chunks to collapse load waterfall
    -   FYM-156: retarget demo domain from fynetiq.com to lm360.ai
    -   FYM-152: reconcile authoritative tracker references
    -   FYM-29: add development bootstrap error overlay
    -   CFA-40: record local main integration
    -   CFA-38: narrow handoff to core package releases
    -   CFA-36: refresh public release handoff
    -   CFA-26: document create-fynapp release handoff
    -   FYM-150: add AbortSignal to bus request and reject in-flight waits on requester dispose
    -   CFA-14: rename local artifact checks
    -   FYM-4: mark FynApp lifecycle (mount tracking, error boundary, suspend/resume) shipped in roadmap
    -   FYM-2: refresh notes to reflect shipped FynBus/telemetry, archive shared-state design
    -   FYM-1: retarget create-fynapp for LLM coding agents
    -   FYM-140: harden FynBus dispose semantics, kernel facade, tracking, and telemetry
    -   FYM-13: add FynBus design doc
    -   FYM-49: add kernel telemetry design note and notes/README index
    -   FYM-99: Fix FynApp initialization with empty middleware array
    -   FYM-98: Add fynapp-notes demo and update HOWTO guide
    -   FYM-98: Enhance FynApp HOW-TO for AI consumption
    -   FYM-98: Add FynApp HOW-TO documentation
    -   Add shared state architecture documentation
    -   FYM-60: Remove string-indexed private field access in kernel
    -   update roadmap with project stats and formatting
    -   update roadmap docs with implemented features
    -   add docs and READMEs for demo
    -   update TODO.md to align with framework roadmap
    -   move TODO.md to notes and update middleware status
    -   add marketing landing page and framework roadmap

-   `scripts`

    -   initial xrun tasks setup

-   `MISC`

    -   chore: fynpo
    -   FYM-194: use released fynpo 2.1.5 with publish package filter
    -   update fynpo, fyn to v2
    -   update fynpo version
    -   FYM-195: drop stale @xarc/run local path override
    -   FYM-194: scope fynpo publish to fynmesh-repo packages
    -   ignore local .npmrc
    -   Add .config/ to .gitignore (safesh local tooling state)
    -   update readme
    -   update README

