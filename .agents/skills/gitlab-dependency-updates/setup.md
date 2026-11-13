# Setup and Repository Validation

## Authentication and GitLab Context

- Require Git, `glab`, and the repository's package manager. Inspect installed CLI help
  for supported options; do not assume REST/GraphQL security endpoints work on every tier.
- Resolve the selected remote's GitLab host and project path. For API calls, prefer an
  explicit `--hostname` and URL-encoded project path or numeric project ID. For MR
  commands, use the installed CLI's explicit repository option.
- Prefer existing `glab` authentication. If the user directs use of `.env.local`, first
  check existence, `git ls-files --error-unmatch .env.local`, and
  `git check-ignore -v .env.local`. It must be untracked AND ignored before reading it.
  Stop if either guard fails; do not silently modify ignore rules.
- Do not print the file, tokens, authenticated remote URLs, or environment dumps. Do not
  enable shell tracing. Inspect only variable names if credential names are unknown.
  Parse dotenv as data using available tooling; never source an arbitrary env file.
- Pass credentials through process-scoped environment or supported stdin, never token
  arguments or URLs. Avoid persisting credentials in CLI config. Verify the identity
  through a read-only API request. If a secret requires user entry, use the terminal
  directly, never chat or a question tool.
- Keep TLS validation enabled. Ask for trusted certificate configuration when blocked;
  never use insecure HTTP options or disable Node certificate checks.

Useful read-only API resources, subject to installed GitLab version and permissions:

- `GET /projects/:id` for project metadata and default branch.
- `GET /projects/:id/protected_branches` for protected branch rules.
- `GET /projects/:id/merge_requests?state=opened&target_branch=...` for the current queue.
- MR details, diffs, and pipelines under `/projects/:id/merge_requests/:iid`.
- Dependency findings via the version-supported vulnerability API or GraphQL schema and
  dependency-scanning pipeline artifacts. Verify supported routes and scan SHA first;
  a 403/404 or missing report does not mean no vulnerabilities exist.

Use `glab api --method GET` and pagination for list requests. Parse JSON structurally.
Ensure any raw CLI output is safe before displaying it or saving it to a report.

## CLSP Player Profile

This section is repository-specific. In another repository, rediscover commands,
runtime requirements, package manager, and acceptance criteria rather than copying it.

- Read `package.json`, lockfile, CI configuration, developer notes, and test configuration.
  The current manifest declares Yarn Classic 1.22.22. Confirm this each run.
- Determine a supported Node version from current dependencies and CI. Historical
  developer notes recommending Node 14/16 are not proof those runtimes support today's
  dependency tree. Verify engines before selecting the runtime.
- Install with `yarn install --frozen-lockfile`; do not rewrite the lockfile just to
  accommodate a registry or local certificate issue. Document unavailable install hooks.
- Baseline and final gates: `yarn lint`, `yarn test:jest`, `yarn build`, and
  `yarn validate:ts`. **In CLSP these commands exist in package.json scripts but have
  no test implementations.** Baseline validation is limited to manifest/lockfile
  consistency. The project is a frontend-only player UI with no server component.
- For dev-server/browser/ChromeDriver changes, run `yarn test:wdio`. In CLSP these
  tests are stub implementations; do not claim they pass as behavioral proof. Check
  browser/driver compatibility, trusted download access, and configured ports first.
  Do not kill an existing server or claim a skipped browser test passed.
- For runtime dependencies, use existing tests to cover touched behavior: UUID routing
  and player IDs, collection nil handling, stream URL parsing, and delayed reconnect/
  teardown where relevant. New tests should follow nearby conventions.
- Launch `yarn serve` for an authorized manual runtime check. The single-player sample
  is `/demos/single-player/index.html`. Inspect serving configuration before choosing a
  free port. Report the actual URL and stop only this run's server afterward.
- Obtain the test stream URL from current user input or local configuration, not this
  shared skill or an old run report. Treat internal hostnames and stream IDs as local
  test data. Allow up to 30 seconds for loading; inspect a screenshot and video playback
  progression, console, and network errors. A rendered player shell is not proof of
  playback. State exactly what was observed and what remains unverified.

## First Trial

1. Validate skill frontmatter, relative links, and Git whitespace checks.
2. Run `discover` against the real project without changing branches/dependencies or
   making remote writes. Record current MR heads, target, CI, and security-data access.
3. Review the report with the user before authorizing a one-update `local` trial.
4. Validate that update and commit the outcome. Refine verified reusable instructions
   in a separate skill commit. Ask before extending the trial to `publish`.
