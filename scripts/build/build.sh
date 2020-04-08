#!/usr/bin/env bash

source "./scripts/utils.sh"

"./scripts/build/pre-build.sh"

dps "Building..."
"./scripts/build/build.js"
ec "Successfully built!" "Failed to build!"
