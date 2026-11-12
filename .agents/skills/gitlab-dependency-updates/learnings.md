# Verified Learnings

Keep this file short. Record reusable observations with dates and evidence, not a queue
of historic MRs, vulnerability counts, credentials, internal URLs, or old test results.

- 2026-11-12: The local `glab` executable reports version 1.119.0. CLI flags should still
  be checked at runtime rather than pinned to this workstation's version.
- 2026-11-12: CLSP's developer notes recommend older Node versions, while its manifest
  contains newer tooling. Resolve runtime requirements from current engines and CI;
  do not treat the developer notes as current compatibility certification.
- 2026-11-12: Ignoring `.local.artifacts` does not establish that `.env.local` is ignored.
  Check credentials and report paths separately before reading or writing either.