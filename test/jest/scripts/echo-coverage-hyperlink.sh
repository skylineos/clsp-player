#!/usr/bin/env bash

function displayCoverageReportLink () {
  echo "
<------------------------------------------------------------------------------

Coverage report available at:

file://${PWD}/test/jest/coverage/lcov-report/index.html

------------------------------------------------------------------------------>
"
}

displayCoverageReportLink
