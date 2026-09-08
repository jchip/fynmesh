# 9/8/2026

## Packages

-   `@fynmesh/kernel@1.1.3` `(1.1.2 => 1.1.3)`
-   `create-fynapp@1.1.5` `(1.1.4 => 1.1.5)`

## Commits

-   `packages/kernel`

    -   FYM-406: approve esbuild 0.25.x install scripts and pin tsx to the 0.25 line
    -   FYM-393: clear dist in build-dist so an earlier build cannot linger
    -   FYM-391: gate kernel sourcemaps on the build env so production ships no dangling refs
    -   read production builds through the federation and kernel debug hatches
    -   FYM-333: the provider fallback scan reports when more than one provider matched the name it took
    -   FYM-332: default stays the first version registered, and says so once when a second one arrives
    -   FYM-321: getMiddleware resolves the requested semver range, warning and falling back to default when nothing matches
    -   FYM-321: failing tests for getMiddleware resolving default instead of the requested semver range
    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/create-fynapp`

    -   FYM-386: stop emitting sourcemaps in production builds, FYNMESH_SOURCEMAP overrides
    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/demo-server`

    -   FYM-405: serve the inspectors minified build from the dev proxy
    -   FYM-398: key react roots by container so a fynapp can render in two regions
    -   FYM-397: restore the sidebar after Clear All and offer it as a loadable fynapp
    -   FYM-394: never mark a chunk immutable when bytes were appended after its hash
    -   FYM-390: ship a 404.html so cloudflare stops answering unknown paths with the landing page
    -   FYM-392: fail the build when a federation chunk did not ship
    -   FYM-389: point sitemap and canonical urls at the extensionless paths cloudflare serves
    -   FYM-388: split the demo site build out of the live publish chain
    -   FYM-387: clean the demo site output dir before building, never the source public dir
    -   retarget demo domain from lm360.ai to fynmesh.win
    -   FYM-385: include fynapp-notes in demo site build and styles
    -   FYM-372: the diagnostics lab is a dev-build affordance, so the switch is absent from the published page rather than broken on it
    -   FYM-362: a lab FynApp that asks for a middleware version nobody has, so fallback and unresolved are page state instead of a console patch
    -   FYM-363: one demo FynApp ships a combined dist, behind a lab switch, so the bundle collector finally reads a real page
    -   FYM-318: federation-inspector lives in dev-tools, dependency-free
    -   FYM-309: document the PORT override and that whoever binds 3000 first wins it
    -   FYM-309: demo loads the federation inspector at idle after paint, served from its own dist

-   `packages/federation-inspector`

    -   FYM-404: soften the inspectors light theme off pure white and name the header
    -   FYM-399: stop flagging the __I debug hatches as a limited capability
    -   match federations own scope fallback when joining __I rows
    -   read production builds through the federation and kernel debug hatches
    -   FYM-384: the overlay drops its opening class when the enter animation ends, so a dock change no longer replays it
    -   FYM-379: dock, theme, text size and copy move into a settings menu that stays reachable at every panel width
    -   FYM-378: cover the tab strips reveal-on-view-change and its overflow controls
    -   FYM-378: the tab strip has its own row, reveals the active tab on every view change, and shows scroll controls when it overflows
    -   FYM-377: preserve Enter activation on focused controls
    -   FYM-376: refresh live diagnostics when module failures change
    -   FYM-374: drop the registered-only list nobody read; the nodes registered stage is the packages one spelling of it
    -   FYM-373: a registration-only module whose id is a url carries it, through the one predicate pass 1 already used
    -   FYM-371: a combined member registered under both its specifier and its url is one module, keyed by the url it already has
    -   FYM-364: a bundle group header says how many of its modules loaded, keyed on the file rather than its basename
    -   FYM-366: a container scope nobody could read is absent rather than invented, and says so where it used to say default
    -   FYM-360: the reach check withholds its verdict while a FynApp is still bootstrapping, and says which one it is waiting on
    -   FYM-361: the FynApp chip says bare name, leaving default to mean one thing on the row
    -   FYM-359: an inlined expose has no chunk to go and find, and the FynApps view now says so from the same derivation the Containers tab reads
    -   FYM-358: a bundle member is counted loaded by its own stage, not by a lookup that could not find it
    -   FYM-356: the FynApps view names the branch a middleware resolved through, toned from the same table the Middleware view reads
    -   FYM-357: report an auto-applying middleware that reached nothing, and say so rather than go quiet where a name collision makes reach unknowable
    -   FYM-348: three names for the three expose levels, each derived in one place, so two views stop printing different counts for one app
    -   FYM-355: one spelling for the auto-apply scopes, so the row and its version chip stop disagreeing
    -   FYM-354: tone a consumer chip by its resolution branch, so a fallback stops rendering green
    -   FYM-347: a middlewares consumers include the FynApps it was delivered to without declaring it, tagged by route
    -   FYM-331: a bootstrap queue panel on the FynApps view, absent rather than idle where the coordinator is mangled
    -   FYM-325: FynMesh diagnostics derived from the kernel registries, for the conditions the production kernel is silent about
    -   FYM-329: middleware view reads the registry from the providers side, one row per provider::name
    -   FYM-324: the containers view renders every manifest key, and names the ones the build never declared
    -   FYM-323: a FynApps tab, read entirely off reserved kernel surfaces, absent rather than empty when there is no kernel
    -   FYM-342: a store-only container counts its provisions as shares, and an inferred row stops calling itself unresolved
    -   FYM-341: a share source is an announcement, not a copy, so the views say declares where nothing was supplied
    -   FYM-327: rebuild container provides from the share store, since $SC.versions is mangled
    -   FYM-320: depth buttons count the nodes the cap lets them draw, so two capped depths close instead of advertising different graphs
    -   FYM-319: the graph names a selection it has no node for instead of claiming to be focused on it
    -   FYM-318: federation-inspector lives in dev-tools, dependency-free
    -   FYM-310: the disabled-depth title counts nodes with plural, not a hardcoded s
    -   FYM-311: hovering a graph node lights its incident edges and dims the rest
    -   FYM-310: each graph depth says how many nodes it reaches, and a depth that reaches no further is disabled
    -   FYM-312: graph nodes carry container@version where two versions of a container are live
    -   FYM-314: every view counts with the filter it renders with
    -   FYM-317: id: and url: match alike, so a partial id narrows instead of returning nothing
    -   FYM-313: stop stealing the pages keys, and stop the filter and the graph answering questions nobody asked
    -   FYM-316: the module detail url is a link out to the file
    -   FYM-315: animate the overlay open and closed, and keep it mounted until the exit plays
    -   FYM-307: share rows line up on a shrinkable basis, not a min-width that clipped the range mark
    -   FYM-308: graph arrowheads, wider layer gap, fit-to-window
    -   FYM-307: let a small viewport override the panel minimum, and keep the live api on a duplicate load
    -   FYM-308: graph drag-to-pan, wheel zoom, and ELK layered layout with orthogonal routing
    -   FYM-307: copy-button feedback, dock caps on both axes, strict cell shrink order, container: facet in shares, validated persisted state
    -   FYM-301: fix id overflowing onto chips, theme restore, off-left drag trap, indistinguishable container versions
    -   FYM-301: fix phantom container versions from entry chunks, cache analysis, avoid per-scroll layout rebuild
    -   FYM-305: federation-inspector modules, containers, shares, graph, issues and raw views
    -   FYM-304: federation-inspector shadow-DOM shell, adapters, resizable overlay and virtual table
    -   FYM-303: federation-inspector dependency graph, semver, share resolution and diagnostics
    -   FYM-302: federation-inspector snapshot model, capability probing and collectors
    -   FYM-306: scaffold federation-inspector package with rollup/terser/tsc build

-   `packages/fynapp-1`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-1-b`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-2-react18`

    -   FYM-299: demo React fynapps share esm-react non-singleton so 18 and 19 coexist
    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-3-marko`

    -   FYM-396: document markos unprovided share as a deliberate negative demo
    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-4-vue`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-5-preact`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-6-react`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-7-solid`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-8-svelte`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-ag-grid`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-ag-grid-lib`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-bundled`

    -   FYM-363: one demo FynApp ships a combined dist, behind a lab switch, so the bundle collector finally reads a real page

-   `packages/fynapp-design-tokens`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-mw-mismatch`

    -   FYM-362: a lab FynApp that asks for a middleware version nobody has, so fallback and unresolved are page state instead of a console patch

-   `packages/fynapp-notes`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-react-18`

    -   FYM-299: demo React fynapps share esm-react non-singleton so 18 and 19 coexist
    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-react-middleware`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-shell-mw`

    -   FYM-398: key react roots by container so a fynapp can render in two regions
    -   FYM-397: restore the sidebar after Clear All and offer it as a loadable fynapp
    -   FYM-321: getMiddleware resolves the requested semver range, warning and falling back to default when nothing matches
    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-sidebar`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-test-shared`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/fynapp-x1-v1`

    -   FYM-299: demo React fynapps share esm-react non-singleton so 18 and 19 coexist
    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/shared-demo-utils`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `packages/test-nested-deps`

    -   Refresh lockfiles and kernel version stamp after the 1.1.2 release

-   `notes`

    -   FYM-396: document markos unprovided share as a deliberate negative demo
    -   retarget demo domain from lm360.ai to fynmesh.win
    -   FYM-327: rebuild container provides from the share store, since $SC.versions is mangled
    -   FYM-318: the design doc records the answers to its own open questions
    -   FYM-318: federation-inspector lives in dev-tools, dependency-free
    -   FYM-306: scaffold federation-inspector package with rollup/terser/tsc build

-   `MISC`

    -   chore: upgrade fyn and fynpo to 3.1.2 and approve esbuild install scripts
    -   FYM-388: document the build-only demo site path and the publish blast radius
    -   FYM-309: AGENTS.md documents the PORT override, and drops the CRLF endings no other file in the repo uses
    -   gitignore .local safesh state dir

# 9/1/2026

## Packages

-   `@fynmesh/kernel@1.1.2` `(1.1.1 => 1.1.2)`
-   `create-fynapp@1.1.4` `(1.1.3 => 1.1.4)`
-   `rollup-wrap-plugin@1.0.1` `(1.0.0 => 1.0.1)`

## Commits

-   `packages/kernel`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/bundle-esm-share`

    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/create-fynapp`

    -   FYM-286: drop the dead root templates, scaffold the create-fynapp version from a placeholder
    -   FYM-285: create-fynapp templates take the kernel version from a placeholder
    -   Pin create-fynapp templates and examples to kernel ^1.1.1
    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-275: react and react18 templates bundle and provide their own React
    -   FYM-280: docs and gates for the open-framework model
    -   FYM-274..279: templates for vanilla, react18, preact, solid, svelte, marko
    -   FYM-273: create-fynapp accepts any --framework, generic scaffold + agent brief
    -   FYM-270: create-fynapp scaffolds vue - complete template, allowlist, and framework-generic gates
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-256: revert create-fynapp to the nix-clap 2.0.0 pin, cli-args drops defaultCommand
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/demo-server`

    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/esm-ag-grid`

    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/esm-ag-grid-react`

    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/esm-pkg`

    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/esm-react-18`

    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/esm-react-dom-18`

    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/fynapp-1`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-1-b`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-2-react18`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-3-marko`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-4-vue`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-5-preact`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-6-react`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-7-solid`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-8-svelte`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-ag-grid`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-ag-grid-lib`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-design-tokens`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-notes`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-react-18`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-react-middleware`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-shell-mw`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-sidebar`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-test-shared`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/fynapp-x1-v1`

    -   FYM-283: preserve fynapp-middleware import attributes, and stop failing silently when a declaration is unreadable
    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-267: point kernel types at lib, add federation.d.ts ambient shim
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/pkg-esm-react-18`

    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/regular-react-app`

    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/rollup-wrap-plugin`

    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo

-   `packages/shared-demo-utils`

    -   FYM-267: type-check every package - alias type paths, shell-mw contract types, real type fixes
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `packages/test-nested-deps`

    -   FYM-256: create-fynapp back on @fynjs/cli-args, lockfiles onto the 2026-08-31 fynjs patch wave
    -   FYM-266: rollup-plugin-esbuild replaces plugin-typescript, no package needs tslib
    -   FYM-260: drop @xarc/module-dev, create-fynapp on vitest, type module and node >=24 across the repo
    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `scripts`

    -   FYM-252: adopt the 2026-08-30 fynjs release wave

-   `MISC`

    -   Version lock @fynmesh/kernel and create-fynapp so they release together
    -   Update fyn and fynpo to 3.0.5
    -   Update fyn and fynpo to 3.0.2

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

