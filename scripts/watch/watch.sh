#!/usr/bin/env bash

source "./scripts/utils.sh"

"./scripts/build/pre-build.sh"

dps "Starting webpack watcher..."
NODE_ENV=development "./scripts/watch/watch.js"
