# CLSP Player verification — learnings

Verified facts about running the gates in this repository on this machine. Each entry was
measured, not recalled. No stream URLs, MR numbers, or throwaway counts live here.

## Playback gate works end to end (measured)

`test/wdio/specs/streamPlayback.js` passes against a real `clsps://` stream: the video
element exists after the demo initialises the player, `currentTime` advances, `#player-error`
stays hidden, and the in-page console/error capture is empty. Confirmed it self-reports as
skipped/pending when no stream URL is supplied (so a missing URL is visible, not a false
pass). The whole gate runs in about 12 s with the dev server already up.

The two-step order the demo requires (measured in `demos/single-player/index.js`):
1. pick the build under test — "Use /src files" selects the bundle the dev server just
   compiled from `src/` (via the webpack `~root` alias → repo `dist/`); "Use /dist package"
   would test the prebuilt `dist/` instead. The spec uses /src so it tests the working tree.
2. only after that are the element/stream/play controls enabled. The demo calls
   `changeSrc()` during initialisation, so the stream URL must be in `#stream-src`
   **before** the element-control click, or the demo tries its hard-coded default host.

The player attaches a `<video>` inside `.clsp-player-container` and uses hidden iframes only
for the CLSP router/conduit (`src/js/ClspClient/README.md`) — the video itself is in the top
document, so element queries do not need frame switching.

## Tokenized stream URLs are unusable for automation (measured)

A provided `clsps://…?token=<jwt>` URL was decoded: `iat` to `exp` differed by **120 seconds**.
A token in a committed spec, plan, or saved report is guaranteed expired before reuse. The
gate therefore takes a **non-tokenized** `clsps://host/stream-id` only, and
`localConfig.assertUsable()` rejects any URL containing `token=`.

The internal stream host resolves only on the corporate VPN (measured: DNS answered while on
VPN). Off-VPN the symptom is `ENOTFOUND`/timeout in the browser, not a player fault.

## WebdriverIO v9 driver setup vs corporate TLS interception (measured)

The clean fix is capability `wdio:chromedriverOptions.binary` — `@wdio/utils`
(`mapCapabilities`) skips its automatic driver download when a binary is supplied. That
download otherwise fails here with `SELF_SIGNED_CERT_IN_CHAIN` (corporate proxy), and it is
what produced the earlier "Couldn't start Chromedriver" failures.

The `chromedriver` npm package is **not** used by WDIO v9's runner and must not be relied on.
On this machine `node_modules/chromedriver/lib/chromedriver/chromedriver` did not exist (the
install hook downloaded nothing) and its version (149) did not match Chrome (157).

Local driver resolution lives in `wdio.conf.js` `resolveChromedriverPath()`: env
`CLSP_CHROMEDRIVER_PATH`, else `.local.artifacts/chromedriver/chromedriver` (gitignored).
Download the Chrome-for-Testing binary matching the installed Chrome major and drop it there;
this repo never commits a driver. Running
`node -e "console.log(require('chromedriver').path)"` only proves the package is broken — it
prints a path that does not exist.

## Node runtime (measured)

`.nvmrc` pins Node 22 and all local gates were verified green on `v22.23.3` (lint, jest,
build, wdio playback). Baselines taken on `v20.14.0` produced identical results, and the
installed toolchain only demands `>=18.20.0` (WebdriverIO 9.28), but **22 is the required
runtime for reports** because that is what the repo pins and what was validated end to end.
`DEVELOPERS.md` advice about Node 14/16 is stale (already noted in the dependency-updates
skill). `package.json` has no `engines` field, so nothing enforces the pin — record the
runtime that actually executed each command.

## validate:ts fails for reasons unrelated to this change (measured)

`yarn validate:ts` (`tsc index.d.ts`) exits 2 with roughly 2,671 `error TS1005`-style errors,
**all inside `node_modules/`** (parse5, undici-types). The pinned TypeScript is 4.0.3, older
than the syntax those dependency `.d.ts` files use; `index.d.ts` itself is fine. Treat a G5
failure as this pre-existing dependency/TS-version gap unless the reported paths are in the
repo. Do not "fix" it by adding `skipLibCheck` or bumping TypeScript without a separate
decision, because that would be an unrequested dependency change.

## CI here is thinner than it looks (measured)

`.gitlab-ci.yml` includes only `skyline-platform/devops/vp-pipeline` `analysis.yml` plus
`post.yml`, and disables `code_quality` (`rules: when: never`). So "passing remote CI" (G7)
is weak evidence of correctness for this product — the local gates carry the weight. State
the pipeline SHA and status; never substitute local green for a pipeline you did not observe.

## eslint skips the wdio specs (measured)

`.eslintignore` lists `test/wdio/*`, so new specs under `test/wdio/specs/` are **not** linted
by `yarn lint` (and `.eslintignore` itself now warns under the flat config). Style mistakes in
a spec surface only when WDIO runs it. `wdio.conf.js` at the repo root *is* linted.

## Commit the test code back (agreed)

A gate that lives only in a local skill directory is a gate nobody runs. When verification work
here produces a spec or a harness fix (`wdio.conf.js`, `test/wdio/helpers/`, a new spec),
commit it into the repository in the same branch as the skill change, in conventional-commit
style (`test:` for specs, `fix:`/`chore:` for harness). Update this skill's gate table in the
same commit so the documentation and the executable gate cannot drift.
