## Node.js Tools

* No `npm`, `npx`
* `fyn` → `npm`: `fyn install`, `fyn add [--dev] package`
* `xrun --serial a b c` → sequential `npm run`
* `xrun a b c` → concurrent `npm run`
* `nvx` → `npx`

## Repo workflow

- this is monorepo
- clean demo `fyn clean:demo`
- rebuild demo `fyn bootstrap`
- rebuild production demo `fyn build-prod`
- if you change any dependencies like kernel or rollup-plugin, you can just rebuild demo and it should automatically rebuild dependencies
- start demo `fyn start`, demo runs on `http://localhost:3000`

## Debug & Testing

* Store temp/debug files in `.temp`

## Playwright MCP — Quick Reference

**Tools (`mcp__playwright_`):** `navigate`, `screenshot`, `console`, `click`, `fill`, `execute`, `snapshot`, `reload`
**Workflow:** Navigate → console → screenshot → save logs (Write) → search (Grep)
**Common Tasks:**

* Save browser console log to a local file for analysis like grep
* Debug: navigate → console → save
* Test: navigate → screenshot → click → screenshot → console
* Reload: `reload`
* When starting a new debug, unless intentionally need, clear browser cache and console, reload a fresh session.

