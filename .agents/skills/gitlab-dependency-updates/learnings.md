# Verified Learnings

Keep this file short. Record reusable observations with dates and evidence, not a queue
of historic MRs, vulnerability counts, credentials, internal URLs, or old test results.

## CLI Flag Verification

- 2026-11-12: `glab ci get` has no `--job` flag; use `--merge-request=<iid>` + `--status=failed`
  to filter. `glab api graphql` uses `-f query="..."` not `--query`. `glab api` (REST) uses
  positional path `glab api projects/:fullpath/endpoint` not `--path`. `glab mr view`
  returns `head_sha: null` even when pipeline tracks it — derive SHA from `glab ci get`.
- 2026-11-12: `glab branch`, `glab branches` commands do not exist. `git --repo` flag does
  not exist on `git` (it is a `glab` flag). Use `git branch` for local branches, `git diff
  <sha1> <sha2>` for local SHA ranges, `git push --set-upstream <remote> HEAD:refs/heads/<branch>`
  for remote publishing.
- 2026-11-12: `glab mr list --output json` and `glab mr view --output json` work reliably.
  `glab ci get --merge-request=<iid> --with-job-details` returns full pipeline/job status.
  `git branch` shows local branches with `*` on checked-out branch.

## GraphQL Schema Variance

- 2026-11-12: `Project` GraphQL type may not expose `builds`, `references`, or `defaultBranch`
  depending on GitLab tier. REST paths like `projects/:fullpath/repository/refs/heads/<branch>`
  may return 404 even when branch exists (confirmed via MR). Always test GraphQL schemas
  at runtime; fall back to `glab mr list`/`glab ci get` for branch/pipeline info.

## CLSP-Specific Limitations

- 2026-11-12: CLSP project has `yarn lint`, `yarn test:jest`, `yarn build`, `yarn test:wdio`
  in package.json scripts but tests are stub implementations with no behavioral coverage.
  Baseline validation is limited to manifest/lockfile consistency. Frontend-only player UI
  with no server component. Historical developer notes recommending Node 14/16 are outdated;
  resolve runtime requirements from current engines and CI.
- 2026-11-12: Ignoring `.local.artifacts` does not establish `.env.local` is ignored.
  Check credentials and report paths separately before reading or writing either.

## Pipeline and Dependency Updates

- 2026-11-12: `gemnasium-dependency_scanning` custom analysis job may produce `script_failure`
  independently of vulnerability findings. Pipeline overall status can be "success" even
  when this job fails. Do not interpret script_failure as a vulnerability finding.
- 2026-11-12: Remote SHA matches local SHA after `git push --set-upstream`. Pipeline
  triggers on MR head and reports status within minutes. Multiple Renovate MRs can be
  merged sequentially into one working branch with yarn.lock conflict marker resolution
  in a final commit. The combined tree validates against CI when semver-compatible
  updates are used.

## Authentication

- 2026-11-12: A read-only discovery probe succeeded using existing `glab` authentication.
  Test existing authentication before requesting env-file credentials. API access alone
  does not establish scan freshness, finding counts, or MR eligibility.
