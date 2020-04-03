#!/usr/bin/env bash

source ./scripts/utils.sh

dps "Removing existing build..."
rm -rf ./dist/
ec "Successfully removed existing build!" "Failed to remove existing build!"

dps "Building..."
./scripts/build.js
ec "Successfully built!" "Failed to build!"
