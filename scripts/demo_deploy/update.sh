#!/usr/bin/env bash

VERSION="$1"

mkdir "${VERSION}"

cd "${VERSION}"

git clone https://github.com/skylineos/clsp-videojs-plugin.git .

git checkout "${VERSION}"

cd ..

rm app

ln -s "${VERSION}" app

echo "    <a href =\"../${VERSION}/\">${VERSION}</a><br /><br />" >> versions.html
