#!/usr/bin/env bash

source "./scripts/utils.sh"

NODE_VERSION="10.15"

function updateSources () {
  dps "Adding yarn repository key"
  curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
  ec "Successfully added yarn respository key" "Failed to add yarn respository key"

  dps "Adding yarn respository"
  echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
  ec "Successfully added yarn respository" "Failed to add yarn respository"

  return 0
}

function installPackages () {
  # @todo - do we need this here, or at all?  node is installed after the apt
  # commands, and the npm issue may no longer interfere.
  #
  # NPM sets the environment variable TMPDIR, which causes `apt install` to throw an
  # error.  Set the TMPDIR environment variable back to the default just for
  # the execution of `apt install`.
  #
  # @see - https://forums.docker.com/t/unable-to-determine-file-size-for-fd-11-fstat/8679
  local NPM_TEMPDIR="$TMPDIR"
  export TMPDIR=/tmp

  # @todo - perhaps this can be installed somewhere else?  for the purposes of drive provisioning
  dps "Creating mongo directory"
  mkdir -p /data/db
  ec "Successfully created mongo directory" "Failed to create the mongo directory"

  dps "Running 'apt update'"
  apt update -y
  ec "Successfully updated ubuntu repositories" "Failed to update ubuntu repositories"

  # @todo - should we do that
  dps "Running 'apt upgrade'"
  apt upgrade -y
  ec "Successfully upgraded installed ubuntu packages" "Failed to upgrade installed ubuntu packages"

  dps "Installing linux dependencies"
  apt install -y \
    htop \
    make
  ec "Successfully installed all linux dependencies" "Failed to install all linux dependencies"

  dps "Installing yarn"
  apt install --no-install-recommends -y yarn
  ec "Successfully installed yarn" "Failed to install yarn"

  export TMPDIR="$NPM_TEMPDIR"

  return 0
}

function installNode () {
  # By default, n-installer will install its executables only for the current user.
  # The environment variables and the subsequent cp command make these executables
  # available for all users.
  dps "Installing Node via tj/n"
  curl -L https://git.io/n-install | PREFIX="/usr/local" N_PREFIX="/usr/local/n" bash -s -- -y $NODE_VERSION
  ec "Successfully installed Node via tj/n" "Failed to install Node via tj/n"

  dps "Making node executables available..."
  cp --symbolic-link /usr/local/n/bin/* /usr/local/bin
  ec "Successfully added node executables" "Failed to add node executables"

  return 0
}

enforceRoot
updateSources
installPackages
installNode

APPLICATION_TITLE="$(getApplicationTitle)"

dpsuc "Successfully bootstrapped this $APPLICATION_TITLE environment!"

exit 0
