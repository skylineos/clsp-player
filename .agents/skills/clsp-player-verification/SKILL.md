---
name: clsp-player-verification
description: >-
  Product-specific testing and verification gates for @skylineos/clsp-player: which checks
  are mandatory, how to prove browser/stream playback automatically with WebdriverIO, what
  counts as evidence, and the measured environment prerequisites and limitations. Use when
  verifying any change to this repository (dependency updates, code fixes, releases), or
  when asked to run, extend, or explain its tests and acceptance gates. Do not use for
  GitLab mechanics such as MR queues or pipeline diagnosis (use the gitlab skill).
---

# CLSP Player verification

Answers one question: **what must be true before a change in this repository may be called
verified.** Product-agnostic process lives in
[gitlab-dependency-updates](../gitlab-dependency-updates/SKILL.md); this skill is the
acceptance contract for *this* product. Read [learnings.md](./learnings.md) for measured
baselines and environment limits before claiming a gate passed.

## Gate contract

Run gates in order. A gate has four outcomes and they are **not** interchangeable:
`pass`, `fail`, `skipped`, `blocked (reason)`. A skipped or blocked gate is never reported
as a pass and is never silently waived.

| # | Gate | Command | Mandatory when |
| --- | --- | --- | --- |
| G1 | Runtime | `node -v` == 22 (per `.nvmrc`), `yarn -v` vs `packageManager` | always |
| G2 | Lint | `yarn lint` | always |
| G3 | Unit | `yarn test:jest` | always |
| G4 | Build | `yarn build` | always |
| G5 | Types | `yarn validate:ts` | always |

`yarn validate:ts` (`tsc index.d.ts`) is known to pass clean on the current lockfile — see
learnings on TypeScript 5.9.3 and the `@types/estree` dedupe — so a G5 failure is always new
and must be explained, never classified as pre-existing.
| G6 | Browser + playback | `yarn test:wdio` | any change that can affect the browser runtime, and before release |
| G7 | Remote CI | `glab` pipeline status for the exact SHA | before publishing |

Rules that make the gates mean something:

1. **Establish a baseline first.** Run the gates on the untouched target SHA, record
   pre-existing failures and warnings in the report, and compare after the change. A
   pre-existing failure stays a known failure; it is never converted into a pass. Gates are
   never weakened (no `--fix` sweeps, no config edits, no added ignores, no `|| true`) to
   manufacture green. Repairing a dependency so a gate genuinely passes is different from
   weakening it — that is a normal change with its own diff and its own gate run (that is how
   G5 was fixed), and it must be reported as a change, not as a baseline.
2. **G1 — use Node 22.** `.nvmrc` pins Node 22 and every local gate was verified green on it,
   so **run all gates on Node 22** (`nvm use`). Yarn is pinned by `packageManager`
   (`yarn@1.22.22`); record the runtime that actually executed each command. Node 22 is chosen
   because the toolchain that drives the browser gate demands it — measured floors:
   WebdriverIO 9.28 (`@wdio/cli`/`webdriverio`/`webdriver`) `>=18.20.0`,
   `webpack-dev-server` `>= 18.12.0`, eslint 9.22 `^18.18.0 || ^20.9.0 || >=21.1.0` (excludes
   19.x and 20.0–20.8). So `>=18.20.0` (with eslint's gaps excluded) is the *bare minimum that
   still runs*, but 22 is the required/reported runtime. `package.json` has no `engines` field,
   so nothing enforces this automatically — a gate run below the floor is `blocked`, not `pass`.
   Verify the floor after a toolchain upgrade with:
   `node -e "for (const p of ['@wdio/cli','webdriverio','webpack-dev-server','eslint']) { try { const j=require(p+'/package.json'); console.log(p, j.version, JSON.stringify(j.engines||{})); } catch { console.log(p,'not installed'); } }"`.
3. **Coverage is not a gate.** `yarn test:jest` writes coverage to `/test/jest/coverage/`
   (ignored). No threshold is configured — do not invent one.
4. **Local passes never substitute for G7**, and G7 here proves less than it looks: the pipeline
   runs security scanners (`secret_detection`, `semgrep-sast`, `gemnasium-dependency_scanning`)
   and **no build, lint, or test jobs** — see learnings on `.gitlab-ci.yml`. Report the pipeline
   SHA and status; pending or unavailable CI is stated as such.

## G6: proving playback (not a rendered shell)

A player shell rendering is **not** proof of playback. The committed spec
`test/wdio/specs/streamPlayback.js` proves it: the demo reaches an initialized player, the
video element exists and is attached, `#player-error` stays hidden, and `currentTime`
actually advances.

### Stream URL contract

The stream URL is **never committed** and never reused from a report, plan, or chat history.
Tokenized `clsps://…?token=` URLs are short-lived (a measured token lived 120 seconds), so a
token in a committed file is guaranteed dead and is credential-shaped regardless. Use a
**non-tokenized** `clsps://host/stream-id` URL and supply it at run time through ignored
local config, in either of these forms:

```bash
# 1. env file (`.local.artifacts/` is gitignored)
echo "CLSP_TEST_STREAM_URL=clsps://<host>/<stream-id>" >> .local.artifacts/.env.local

# 2. inline, one run
CLSP_TEST_STREAM_URL='clsps://<host>/<stream-id>' yarn test:wdio
```

The spec also accepts a gitignored `test/wdio/local.yml` placeholder with key
`streamUrl`, for people who prefer a file. The resolution order is: env var → `local.yml` →
none. Non-VPN note: the internal stream hostnames only resolve on the corporate VPN, so
`ENOTFOUND`-style failures mean the VPN is down, not that the player is broken.

If no URL is available the spec marks itself `pending` and the run must be reported as
**G6 skipped — no stream URL supplied**, with the manual fallback below. Never call that a
pass.

### Driver prerequisite (verify, do not assume)

WebdriverIO v9 starts ChromeDriver itself — the `chromedriver` npm package is not what runs,
and on this machine it extracted no binary at all while its major version (149) did not match
Chrome (157). WDIO's own automatic driver download fails through the corporate proxy with
`SELF_SIGNED_CERT_IN_CHAIN`, which is what produced the original
`SevereServiceError: Couldn't start Chromedriver`.

`wdio.conf.js` resolves a driver binary and passes it as `wdio:chromedriverOptions.binary`,
which is the documented way to make `@wdio/utils` skip its download. Order: env
`CLSP_CHROMEDRIVER_PATH`, then gitignored `.local.artifacts/chromedriver/chromedriver`. To
repair a machine without touching the lockfile or committing a binary:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version    # read the major
# download the Chrome for Testing chromedriver for that major + platform, unzip it, then:
mkdir -p .local.artifacts/chromedriver
cp <unzipped>/chromedriver .local.artifacts/chromedriver/chromedriver
chmod +x .local.artifacts/chromedriver/chromedriver
xattr -d com.apple.quarantine .local.artifacts/chromedriver/chromedriver
.local.artifacts/chromedriver/chromedriver --version   # major must match Chrome
```

If no matching binary can be obtained, G6 is **blocked (driver/Chrome mismatch)** with that
evidence. Never disable TLS verification or pin an unverified driver download to make a run
start, and do not re-add the `chromedriver` service: it spawns a second driver alongside the
one WDIO v9 starts.

### Manual fallback (always available)

`yarn serve`, then `/demos/single-player/index.html`: choose *Use /src files* → *Let CLSP
Player Create Video Element* → enter the stream URL → Change Stream URL → Play. Allow up to
30 s. State exactly what was observed (frame progression, console, network) and what remains
unverified. Stop only the server this run started. Treat the demo's built-in default stream
host as local test data, not an authorized target.

## Committing test code back

Automated coverage produced for a change is **committed to this repository**, not left in a
scratch directory:

- WebdriverIO specs go in `test/wdio/specs/*.js`; Jest tests go under the existing
  `src/js/**/__tests__` conventions and match nearby style.
- Never commit a stream URL, token, screenshot, or anything under `.local.artifacts/`. Check
  `git check-ignore -v <path>` before writing new local files, and stage explicit paths only.
- A test that skips because local config is missing is acceptable **only** if it reports
  itself pending/skipped, so reports show the gap instead of hiding it.

## Evidence to record per run

Per gate: command, runtime, exit code, outcome, and comparison against baseline. For G6 also:
stream target host only (never a token), URL, elapsed time to first frame, console and
network errors, playback state, and screenshot path inside `.local.artifacts/`. Update
[learnings.md](./learnings.md) only with reusable verified facts — no stream URLs, no
MR numbers, no stale counts.
