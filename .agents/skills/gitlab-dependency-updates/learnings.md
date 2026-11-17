# Verified Learnings

Keep this file short. Record reusable observations with dates and evidence, not a queue
of historic MRs, vulnerability counts, credentials, internal URLs, or old test results.

- 2026-11-12: The local `glab` executable reports version 1.119.0. CLI flags should still
  be checked at runtime rather than pinned to this workstation's version.
- 2026-11-12: CLSP's developer notes recommend older Node versions, while its manifest
  contains newer tooling. Resolve runtime requirements from current engines and CI;
  do not treat the developer notes as current compatibility certification.
- 2026-11-16: Supersedes the Node note above for this repository: `.nvmrc` pins Node 22 and
  all local gates (lint, jest, build, browser) were verified green on Node 22.23.3. `package.json`
  declares no `engines`, so the pin is the only signal — use Node 22 and record the runtime.
  The measured toolchain floor (WebdriverIO 9.28 `>=18.20.0`) is the reason, not the target.
- 2026-11-16: Plain `git fetch`/`push` over HTTPS can fail with `HTTP Basic: Access denied`
  while `glab` works from the OS keyring. Confirm which authentication actually works before
  planning a push, and read the true remote head with
  `glab api projects/:id/repository/branches/<branch>` when git auth fails. Resolve push
  authentication with the user rather than inventing credentials.
- 2026-11-16: This repository's `.gitlab-ci.yml` includes only shared analysis and post stages
  and disables `code_quality`. Measured on an MR pipeline: the analysis jobs are security
  scanners (`secret_detection`, `semgrep-sast`, `gemnasium-dependency_scanning`) — there are no
  build, lint, or test jobs. So CI proves nothing about the tests passing and a green pipeline is
  weak evidence of correctness; the local gates carry the weight. Do not present remote CI as
  stronger than its configured jobs, and never substitute local results for a pipeline that was
  not observed.
- 2026-11-12: Ignoring `.local.artifacts` does not establish that `.env.local` is ignored.
  Check credentials and report paths separately before reading or writing either.
- 2026-11-16: Key names inside `.local.artifacts/.env.local` may carry trailing whitespace, so
  a naive key match silently misses a value. Trim the key side when parsing local env files.
- 2026-11-12: A read-only CLSP discovery probe succeeded using existing `glab`
  authentication, paginated MR/protected-branch APIs, and a dependency-finding API
  sample. Test existing authentication before requesting env-file credentials. API
  access alone does not establish scan freshness, finding counts, or MR eligibility.
- 2026-11-16: `yarn add`/`yarn install` defaults to `registry.yarnpkg.com`, which fails from
  node on this machine with `SELF_SIGNED_CERT_IN_CHAIN` (corporate TLS interception; the CA is
  in the macOS keychain, so curl and browsers are fine and `NODE_EXTRA_CA_CERTS` is unset).
  `registry.npmjs.org` validates correctly, so pass `--registry https://registry.npmjs.org`.
  Never disable TLS verification to make an install proceed.
- 2026-11-16: A dependency bump made with `yarn add --dev`, or via a new `resolutions` entry,
  re-indents existing `package.json` keys and re-resolves unrelated packages (95-110-line
  lockfile diff for a one-package change). Hand-edit the one `package.json` line plus the one
  lockfile block, verify the `resolved`/`integrity` pair against the registry independently,
  then prove the result with `yarn install --frozen-lockfile`.
- 2026-11-16: TypeScript was bumped 4.0.3 → 5.9.3 in this repository to clear `error TS1005` in
  `yarn validate:ts`, with `@types/estree` deduplicated in the lockfile to clear the 17
  `TS2416` that then surfaced. See
  [clsp-player-verification learnings](../clsp-player-verification/learnings.md) for the
  measured before/after; 5.9.3 was chosen over upstream 7.x deliberately (7.x is the native
  rewrite). Treat the last 5.x as the conservative step and re-decide before crossing a major.
