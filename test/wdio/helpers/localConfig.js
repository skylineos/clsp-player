'use strict';

/**
 * Resolve local-only test configuration (currently: the stream URL used by the
 * playback gate) without committing any of it to the repository.
 *
 * Resolution order:
 *   1. CLSP_TEST_STREAM_URL from the environment
 *   2. `.local.artifacts/.env.local`  (dotenv-style, gitignored)
 *   3. `test/wdio/local.yml`          (flat `streamUrl:` key, gitignored)
 *
 * Deliberately dependency-free: `.env.local` / `local.yml` are parsed here rather
 * than via dotenv or js-yaml, because neither is a direct dependency of this
 * package and the shape needed is a single flat key.
 *
 * Stream URLs must be non-tokenized. Tokenized `clsps://...?token=` URLs expire
 * within minutes and must never be stored or committed.
 */

const fs = require('fs');
const path = require('path');

const ENV_KEY = 'CLSP_TEST_STREAM_URL';
const ROOT = path.resolve(__dirname, '..', '..', '..');

function stripQuotes (value) {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function readEnvFile (filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const index = line.indexOf('=');

    if (index === -1) {
      continue;
    }

    if (line.slice(0, index).trim() === ENV_KEY) {
      return stripQuotes(line.slice(index + 1));
    }
  }

  return null;
}

// A single flat `streamUrl: clsps://...` line is enough YAML for this purpose and
// keeps the file human-editable without pulling in a YAML parser.
function readYamlFile (filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = /^streamUrl:\s*(.*)$/.exec(line);

    if (match) {
      return stripQuotes(match[1]);
    }
  }

  return null;
}

/**
 * @returns {{ streamUrl: string|null, source: string|null }} the URL and where it
 *   came from, so a report can name the local file that supplied it (never the
 *   value itself).
 */
function resolveStreamUrl () {
  const candidates = [
    {
      source: 'environment',
      read: () => (process.env[ENV_KEY] ? process.env[ENV_KEY].trim() : null),
    },
    {
      source: '.local.artifacts/.env.local',
      read: () => {
        const p = path.join(ROOT, '.local.artifacts', '.env.local');

        return fs.existsSync(p) ? readEnvFile(p) : null;
      },
    },
    {
      source: 'test/wdio/local.yml',
      read: () => {
        const p = path.join(__dirname, 'local.yml');

        return fs.existsSync(p) ? readYamlFile(p) : null;
      },
    },
  ];

  for (const candidate of candidates) {
    let value = null;

    try {
      value = candidate.read();
    }
    catch (error) {
      // A malformed local file is a configuration problem, not a player bug.
      throw new Error(`Unable to read ${candidate.source}: ${error.message}`);
    }

    if (value) {
      return { streamUrl: value, source: candidate.source };
    }
  }

  return { streamUrl: null, source: null };
}

/**
 * Fail loudly about tokenized URLs instead of letting a stale token produce a
 * confusing playback failure.
 */
function assertUsable (streamUrl) {
  if (/token=/i.test(streamUrl)) {
    throw new Error(
      'Stream URL contains a token, which expires within minutes. ' +
      'Provide a non-tokenized clsps://host/stream-id URL instead.'
    );
  }

  if (!/^clsps?:\/\//.test(streamUrl)) {
    const scheme = streamUrl.split('://')[0];

    throw new Error(`Stream URL must start with clsps:// (got ${scheme}://)`);
  }
}

module.exports = {
  ENV_KEY,
  resolveStreamUrl,
  assertUsable,
};
