## Repo workflow

- this is a monorepo
- clean demo `fyn clean:demo`
- rebuild demo `fyn bootstrap`
- rebuild production demo `fyn build-prod`
- if you change any dependencies like kernel or rollup-plugin, you can just rebuild demo and it should automatically rebuild dependencies
- start demo `fyn start`, landing page at `http://localhost:3000`, shell middleware demo at `http://localhost:3000/shell.html`, full page of all fynapps demo at `http://localhost:3000/demo.html`
