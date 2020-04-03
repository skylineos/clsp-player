#!/usr/bin/env bash

source ./scripts/utils.sh

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

# dps "Linting..."
# yarn run lint --fix
# ec "Successfully linted!" "Failed to lint!"

# # Add back the modified/linted files to staging
# dps "Adding the fixed files..."
# git add "${jsFilesToLint[@]}"
# ec "Successfully added fixed files" "Failed to add fixed files!"

dps "Building..."
yarn run build
ec "Successfully built!" "Failed to build!"

dps "Adding dist files to branch..."
git add dist/
ec "Successfully added dist files to branch!" "Failed to add dist files to branch!"

dps "Committing dist files to branch..."
git commit -m "build $(getNodePackageVersion)"
ec "Successfully committed dist files to branch!" "Failed to commit dist files to branch!"

exit 0
