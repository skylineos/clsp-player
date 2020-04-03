#!/usr/bin/env bash

APPLICATION_DIR="$(pwd)"

FALSE=0
TRUE=1

# Terminal Output Colors
NC='\033[0m' # default color
YEL='\033[1;33m'
RED='\033[0;31m'
ORA='\033[0;33m'
BLU='\033[0;34m'
GRE='\033[0;32m'
CYA='\033[0;36m'

function dp () {
  local -r type="$1"
  local -r message="$2"

  echo -e " ${YEL}[${NC} ${type} ${YEL}] ${message}${NC}"

  return $?
}

# Display info text
function dpi () {
  local -r type="INFO"

  dp "${BLU}${type}${NC}" "$@"

  return $?
}

# Display error text
function dpe () {
  local -r type="ERROR"

  dp "${RED}${type}${NC}" "$@"

  return $?
}

# Display warning text
function dpw () {
  local -r type="WARNING"

  dp "${RED}${type}${NC}" "$@"

  return $?
}

# Display a Step in the process
function dps () {
  local -r type="STEP"

  dp "${CYA}${type}${NC}" "$@"

  return $?
}

# Display success text
function dpsuc () {
  local -r type="SUCCESS"

  dp "${GRE}${type}${NC}" "$@"

  return $?
}

# A utility for handling errors.  If an error is encountered, a custom
# error message will be displayed and the script will exit with the failing
# error code
function ec () {
  # Store the original error code before evaluating $?
  local -r ERROR_CODE=$?

  if [ $ERROR_CODE -eq 0 ]; then
    echo ""
    dpsuc "$1"
    return 0
  else
    dpe "$2"
    exit $ERROR_CODE
  fi
}

##
# Is the current user "root"?
#
# yes - return 0
# no - exit 1
##
function enforceRoot () {
  dpi "Ensuring this script was run as root..."

  if [[ "$UID" -ne 0 ]]; then
    dpe "You must run this script with sudo."
    exit 13
  fi

  dps "This script was run with sudo - continuing..."

  return 0
}

function confirmInternetAccess () {
  # Ping google to check if we have internet access.
  dps "Ensuring we have web access."
  ping -q -c3 google.com > /dev/null
  ec "Web access available." "Exiting...please check network connection."
}

function getNodePackageVersion () {
  echo $(node -e 'console.log(require("./package.json").version)')
}

function getApplicationName () {
  echo $(node -e 'console.log(require("./package.json").name)')
}

function getApplicationTitle () {
  echo $(node -e 'console.log(require("./package.json").title)')
}

function getCurrentGitBranch () {
  echo $(git rev-parse --abbrev-ref HEAD)
}

APPLICATION_DIR="$(pwd)"
APPLICATION_ROOT_DIR="$(dirname $APPLICATION_DIR)"

jsFilesToLint=(\
  ".eslintrc.js" \
  "src/js/**/*.js" \
  "scripts/*.js" \
  "scripts/**/*.js" \
  "demo/**/*.js" \
)

scssFilesToLint=(\
  "src/styles/*.scss" \
  "src/styles/**/*.scss" \
  "demo/src/styles/*.scss" \
  "demo/src/styles/**/*.scss" \
)
