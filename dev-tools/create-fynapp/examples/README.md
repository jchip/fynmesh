# FynApp Examples

Minimal, curated reference FynApps for LLM coding agents and humans. Each is
the smallest correct example of one pattern, distilled from the proven demo
apps `demo/fynapp-6-react` (React app + middleware consumer) and
`demo/fynapp-design-tokens` (middleware provider).

These are source-only references - dependencies are not installed and they are
not part of the demo build.

| Example | Federation name | Pattern |
| --- | --- | --- |
| [`react-minimal/`](./react-minimal) | `example-react-minimal` | Simplest standalone React FynApp: a `FynUnit` that renders `<App />` with `ReactDOMClient.createRoot`, no middleware. |
| [`middleware-consumer/`](./middleware-consumer) | `example-middleware-consumer` | React FynApp that consumes the `design-tokens` middleware via `useMiddleware(...)` and reads its API from `runtime.middlewareContext`, degrading gracefully when the provider is absent. |
| [`middleware-provider/`](./middleware-provider) | `example-middleware-provider` | Middleware provider: exposes `./middleware/greeting`, a class implementing `FynAppMiddleware` that signals ready in `setup` and publishes its API in `apply`. |
| [`vanilla/`](./vanilla) | `example-vanilla` | Framework-agnostic FynApp: a `FynUnit` that renders plain DOM with `target.innerHTML`, no framework. |

## Key contracts

- Entry `src/main.ts` exports `const main`, a `FynUnit` (`execute` required;
  `initialize` returns `{ status, mode?, deferOk? }`; optional `shutdown`).
- Consumers wrap the unit with `useMiddleware({ middleware, config }, unit)` and
  read APIs via `runtime.middlewareContext.get("<name>")`.
- Providers expose `./middleware/<name>` and export
  `const __middleware__<Name> = new <Name>Middleware()`; a provider still needs
  `src/main.ts` with `export {};` because the kernel loads `./main`.
- `rollup.config.ts` uses `createFynAppRollupConfig` from `create-fynapp`
  (`framework: "react"` for React apps, `"vanilla"` otherwise). Only the `react`
  framework auto-exposes `./main`; non-React apps must list it in `exposes`.
