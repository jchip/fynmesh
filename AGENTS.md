## Repo workflow

- this is monorepo
- clean demo `fyn clean:demo`
- rebuild demo `fyn bootstrap`
- rebuild production demo `fyn build-prod`
- if you change any dependencies like kernel or rollup-plugin, you can just rebuild demo and it should automatically rebuild dependencies
- start demo `fyn start`, demo runs on `http://localhost:3000`

