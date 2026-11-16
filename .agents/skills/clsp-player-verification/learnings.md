# CLSP Player verification — learnings

Verified facts about running the gates in this repository on this machine. Each entry was
measured, not recalled. No stream URLs, MR numbers, or throwaway counts live here.

## Playback gate works end to end (measured)

`test/wdio/specs/streamPlayback.js` passes against a real `clsps://` stream: the video
element exists after the demo initialises the player, `currentTime` advances, `#player-error`
stays hidden, and the in-page console/error capture is empty. Confirmed it self-reports as
skipped/pending when no stream URL is supplied (so a missing URL is visible, not a false
pass).

Timing (measured, hot dev server): 39–45 s for the spec. The first attempt against a
cold/just-started stream can exceed the `mochaOpts.timeout` of 60 s and fail with a bare
`Error: Timeout`. **A timeout on first touch is not a player failure** — re-run once before
reporting G6 as failed, and say which attempt produced which result.

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

## G5 (validate:ts) — was broken, now passing (measured)

`yarn validate:ts` is `tsc index.d.ts` with no `tsconfig.json`, so it type-checks the whole
transitive `@types` graph. It used to exit 2 with ~2,671 `error TS1005`, all inside
`node_modules/` (parse5, undici-types): the pinned TypeScript 4.0.3 predates syntax those
dependency `.d.ts` files use. `index.d.ts` itself was always fine.

Two changes made G5 pass, both measured on Node 22.23.3:

1. **TypeScript 4.0.3 → 5.9.3** removed all 2,671 `TS1005`. 5.9.3 was chosen over current
   upstream 7.x deliberately: 7.x is the native-port rewrite, so 5.9.3 is the conservative
   step that keeps the same compiler behaviour. This unmasked a second, previously
   unreachable failure — 17 × `TS2416` in `node_modules/@types/eslint-scope/index.d.ts`.
2. **Deduplicating `@types/estree`** cleared those 17. The lock pinned two copies (1.0.9
   hoisted, 1.0.6 nested under `eslint/`) because `@types/eslint-scope` asks for `*`, so
   nominally-identical ESTree types came from two declarations and were considered
   incompatible. One flat lockfile edit — merging `"@types/estree@^1.0.6"` into the existing
   `1.0.9` entry — is exactly what a fresh resolve produces and leaves everything else alone.

Do not use `skipLibCheck` as a substitute: it would hide real errors in the dependency graph
rather than removing them. `yarn validate:ts` now exits 0 with no output, so **any** future
G5 failure is new and must be investigated, not waved at as pre-existing.

### Bumping a dependency in this repo without churn (measured)

`yarn add --dev <pkg>` rewrites the whole lockfile here: it re-indents pre-existing
badly-indented `package.json` keys and re-resolves unrelated packages (acorn, browserslist,
debug, qs, schema-utils, caniuse-lite…) — a 95+ line diff for a one-package change. Adding a
`resolutions` entry has the same effect (110 lines). The clean procedure is:

```bash
git checkout package.json yarn.lock      # undo yarn add's churn
# then hand-edit: the one package.json line, and the one lockfile block
yarn install --frozen-lockfile           # proves the hand-written lockfile is valid
```

Before hand-writing a `resolved`/`integrity` pair, verify it independently rather than
trusting the editor:
`npm view <pkg>@<ver> dist.integrity dist.tarball dist.shasum`, then download the tarball and
recompute `shasum -a 1` and `openssl dgst -sha512 -binary | openssl base64 -A`.

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
