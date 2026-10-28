# Peer-aware share resolution

Status: not planned. A page runs one federated CWP release, and the AMD add-on
refuses a second one. Kept for the record in case that limit has to go.

Why not: `ui-kit` peers on React 18 or 19. Supporting two releases means
tracking a separate `ui-kit` instance for each React it bound to. That is
Node's nested dependencies, where each copy in `node_modules` resolves its own
deps, rebuilt at run time. We don't want that complexity in the runtime.

## Problem

A share can import another share. `ui-kit` imports `esm-react`. A loaded
instance of `ui-kit` binds its `esm-react` import once, to one copy of React.

Federation picks a provider by share key and version. It does not look at what
the provider's imports bound to. So two consumers on different Reacts can get
the same `ui-kit` instance, and one of them renders a component tree that
mixes two Reacts. React throws inside the first `ui-kit` component.

Case: two RequireJS contexts on one page, one with CWP 3's meta and one with
CWP 4's. The add-on now refuses the second release, so this needs that guard off.

- CWP 3 and CWP 4 both provide `ui-kit` 1.4.0. CWP 3 loads first.
- Set 2 runs on CWP 4's React 19.2.8.
- Federation gives Set 2 CWP 3's `ui-kit`, which is bound to React 18.3.1.
  CWP 4's `ui-kit` chunk is never fetched.
- Set 2 renders nothing. The console shows an error in `<Card>`.

## What is correct

`ui-kit` declares `peerDependencies: { "esm-react": "^18.0.0 || ^19.0.0" }`. A
peer means "use my importer's copy". npm resolves it that way: a peer binds to
the copy in the importer's tree. So `ui-kit` used from a React 19 tree must run
on React 19. The peer range only says which Reacts are allowed.

The range is already in the build output. rollup-plugin-federation records each
importer's declared range per importer dir, and the CWP entry carries
`["%nm/ui-kit/dist", "^18.0.0 || ^19.0.0"]` under `esm-react`. What is missing
is the binding rule.

## Proposal

### Instance identity

A share instance is identified by its provider chunk plus the versions its peer
imports bound to. `ui-kit@1.4.0` from CWP 3 bound to `esm-react@18.3.1` is one
instance. `ui-kit@1.4.0` from CWP 4 bound to `esm-react@19.2.8` is another.

### Resolution

When consumer C resolves share S:

1. For each peer P of S, take the version C itself resolves for P. That is C's
   binding.
2. Pick an instance of S whose binding equals C's. A loaded one wins.
3. Otherwise load a provider chunk of S that is not loaded yet, and bind its P
   imports to C's versions. Each binding must satisfy S's declared peer range.
4. If no provider can be bound, fail with an error that names S, P, C's version
   and S's range.

For the repro, step 3 loads CWP 4's `ui-kit` chunk and binds it to React
19.2.8. Set 1 keeps CWP 3's instance. No module is instantiated twice, because
each CWP ships its own `ui-kit` chunk.

### Build side

The runtime has to know S's peers before it loads S. The plugin knows them at
build time: `getNearestPackageVersion` returns the `section` a range came from.
When a shared package lists another share key in `peerDependencies`, the plugin
emits it on that share's `_S` options, for example
`{ semver: "1.4.0", peers: { "esm-react": "^18.0.0 || ^19.0.0" } }`.

### Binding a peer import

When S's chunk imports P, federation needs to know which consumer the instance
is being bound for. The instance is created on its first resolve, so the
binding comes from that resolve and is stored with the instance. S's P import
then resolves to that version, not by the usual "prefer what is loaded" rule.

## Open questions

- **One provider, two bindings.** If only CWP 3 provided `ui-kit`, Set 2 would
  need a second instance of the same chunk. SystemJS keys an instance by URL, so
  this needs the chunk loaded under a second id. The first version should fail
  with the step 4 error instead.
- **Singletons.** A singleton peer has one version per scope, so every binding
  is the same. Peers of singletons need no new work.
- **How federation-js stores per-instance bindings.** The resolve path
  (`matchRvm`, `satisfiesAll` in `federation-js.ts`) resolves per consume call
  today. Where the binding is kept is still to work out.

## Test plan

- federation-js unit tests: provider selection by binding, the step 4 error,
  and a share whose peers are all singletons.
- Plugin test: `peers` emitted from a shared package's `peerDependencies`.
- End to end: the legacy AMD demo with one set on each release, the add-on's
  one-release guard removed, renders both sets.
