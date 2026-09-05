# fynapp-bundled

The one demo FynApp whose `dist` is combined, so a page can carry a real
combined module bundle.

Combining is a post-build step (`federation-combine`, see
`rollup-federation/notes/combined-module-bundles.md`), and the repo runs it only
under `build-prod` — so a dev demo used to emit no bundles at all: `Federation.$bU`
was empty on every page, `Snapshot.bundles` was `[]`, and the inspector's bundle
collector had no live coverage anywhere (FYM-363). This app's own `build` script
runs the combine step, so a dev build carries one too.

It is **opt-in**: `/demo.html?lab=bundled` (or `?lab=all`) loads it, and nothing
else does. `/demo.html` without the switch keeps shipping exactly the
one-file-per-chunk output it always has, because that page is the baseline the
inspector's diagnostics are verified against.

## Why four exposes, three of them trivial

`combineDist` only takes chunks at or below 2 KB and needs at least two of them.
With no framework to pull in a large chunk, `hello`, `banner` and `getInfo` all
qualify and land in one `combo-*.js`; `main` is over the threshold and stays its
own file, which is what makes the bundle a *subset* of the app rather than all
of it.

`main` imports `hello` and `banner` and never touches `getInfo`. So the bundle is
partly loaded — two members executed, one still only registered — which is the
state a member count has to get right, and the one FYM-358 corrected.
