# rollup-wrap-plugin

Wrap a Rollup plugin constructor so the config it was created with stays readable afterwards.

Rollup plugins normally swallow their arguments: once `somePlugin({ ... })` returns, the object
you passed in is gone. This wrapper keeps that configuration attached to the plugin instance
under a symbol, so tooling that needs to inspect a build's plugin setup can recover it — without
changing how the plugin is written or losing type safety.

## Install

```sh
npm install --save-dev rollup-wrap-plugin
```

## Usage

Wrap the constructor, then call it exactly as you would have:

```js
import { newRollupPlugin, getPluginMeta } from "rollup-wrap-plugin";
import federation from "rollup-plugin-federation";

const federationPlugin = newRollupPlugin(federation)({
  name: "my-app",
  filename: "federation-entry.js",
  exposes: { "./App": "./src/App.tsx" },
});

// same plugin instance rollup would have got, plus its config is now recoverable
const meta = getPluginMeta(federationPlugin);
meta?.config.name; // "my-app"
```

`newRollupPlugin` is also the default export.

## API

**`newRollupPlugin(pluginConstructor)`** — returns a function with the same signature as the
original constructor. Argument and return types are preserved.

**`getPluginMeta(pluginInstance)`** — returns the recorded metadata, or `undefined` if the
plugin wasn't wrapped:

| Field | Description |
| --- | --- |
| `id` | Unique id for this instance, derived from the plugin name |
| `args` | Every argument the constructor was called with |
| `config` | The first argument, as a convenience |
| `pluginName` | The plugin's own `name` property |
| `created` | Creation timestamp |

**`ROLLUP_WRAP_PLUGIN_META`** — the symbol the metadata is stored under. Using a symbol keeps it
from colliding with any property the plugin defines.

Arguments are deep-cloned when recorded, so later mutation of your config object doesn't
retroactively change what was captured.

## License

Apache-2.0
