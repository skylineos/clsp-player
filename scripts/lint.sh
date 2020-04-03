#!/usr/bin/env bash

source "./scripts/utils.sh"

FIX=$FALSE

for i in $@; do
  case "$i" in
    --fix) FIX=$TRUE; break;;
    --) break;;
  esac
done

if [ $FIX == $TRUE ] ; then
  # Lint and fix all staged .js files
  dps "Using eslint to fix files..."
  eslint --cache --fix "${jsFilesToLint[@]}"
  ec "Successfully linted files" "Failed to lint files!"

  exit 0
fi

dps "Linting..."
eslint --cache "${jsFilesToLint[@]}"
ec "Lint was successful and there are no linting errors!" "There are linting errors - go back and fix those files."

exit 0
