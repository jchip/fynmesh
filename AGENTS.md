## Repo workflow

- this is a monorepo
- clean demo `fyn clean:demo`
- rebuild demo `fyn bootstrap`
- rebuild production demo `fyn build-prod`
- build the demo *site* without publishing it: `fyn build-demo` (writes `.temp/docs`, touches no git state)
- `fyn publish-demo` BUILDS AND DEPLOYS TO THE LIVE SITE: it force-pushes `gh-pages` and ends in `git checkout -f main`, which discards uncommitted work. Never run it to get a build — use `fyn build-demo`
- production builds emit no sourcemaps; `FYNMESH_SOURCEMAP=1` puts them back for a local prod build you need to debug
- if you change any dependencies like kernel or rollup-plugin, you can just rebuild demo and it should automatically rebuild dependencies
- start demo `fyn start`, landing page at `http://localhost:3000`, shell middleware demo at `http://localhost:3000/shell.html`, full page of all fynapps demo at `http://localhost:3000/demo.html`
- `PORT` overrides the port: `PORT=3001 fyn start`, and the urls above shift with it. Whoever binds 3000 first wins it, so another dev server or a container publishing 3000 will push the demo elsewhere — the proxy prints the url it actually listened on
