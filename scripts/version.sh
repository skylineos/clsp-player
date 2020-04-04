#!/usr/bin/env bash

source "./scripts/utils.sh"

PREVERSION=$FALSE
POSTVERSION=$FALSE

for i in $@; do
  case "$i" in
    --pre) PREVERSION=$TRUE; break;;
    --post) POSTVERSION=$TRUE; break;;
    --) break;;
  esac
done

# @todo - enforce that only one option can be supplied.  for now, we are
# exiting at the end of each block

if [ $PREVERSION == $TRUE ] ; then
  dpi "Executing preversion logic..."

  dps "Setting upstream branch in git..."
  git push --set-upstream origin "$(getCurrentGitBranch)"
  ec "Successfully set upstream branch in git!" "Failed to set upstream branch in git!"

  exit 0
fi

if [ $POSTVERSION == $TRUE ] ; then
  dpi "Executing postversion logic..."

  dps "Pushing built branch..."
  git push
  ec "Successfully pushed built branch!" "Failed to push built branch!"

  dps "Pushing tag..."
  git push --tags
  ec "Successfully pushed tag!" "Failed to push tag!"

  exit 0
fi

dpi "Executing version logic..."

dps "Linting..."
yarn run lint
ec "No lint errors found!" "Lint errors were found!"

exit 0
