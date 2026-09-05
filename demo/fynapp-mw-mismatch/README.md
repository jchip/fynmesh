# fynapp-mw-mismatch

The demo FynApp that misdeclares its middleware on purpose.

Every middleware declaration on `/demo.html` and `/shell.html` resolves on a
happy branch — `default` or `range` — so the two branches the inspector exists
to warn about could not be seen anywhere in this repo. Verifying them meant
patching `__middlewareMeta` in the live kernel from the console (FYM-362), which
proves the amber path renders but is not something a reviewer or a later change
can lean on.

It is **opt-in**: `/demo.html?lab=mw` (or `?lab=all`) loads it, and nothing else
does. `/demo.html` without the switch is unchanged — same five issues, no new
rows — because that page is the baseline the diagnostics are verified against.

## The two branches, and why they are declared differently

**`fallback`** — asks `fynapp-design-tokens::design-tokens` for `^9.0.0`, which
nothing registers, so the kernel hands over the `default` slot and the app runs
a version it never asked for. The range is an import attribute, not a
package.json dependency range, so `fyn` still installs the real `^1.0.0`. This
is a bug a real app can ship, and it is what keeps this app alive: a fallback
still *delivers*, so `execute` is reached and the app renders as if nothing were
wrong. In a production build the kernel's own warning is stripped by terser's
`drop_console`, which leaves the inspector's chip as the only signal.

**`unresolved`** — is not a branch a FynApp can declare its way into, and no
declaration here produces it on its own. It is what the collector reports when a
middleware *is* registered and still resolves to nothing: a version map whose
`default` slot is not backed by any version key. `registerMiddleware` writes both
from the same object, so a registry the kernel built is never in that state —
only one that arrived from elsewhere is, which is exactly what `initRunTime`
accepts and what a clone or a serialise/parse round trip produces. So the
registry entry is staged by the lab block in
`demo-server/templates/components/fynapp-loader.html`, in the open, and this app
declares a use of it. Without that block the name is simply unregistered, which
is a different (red) condition.
