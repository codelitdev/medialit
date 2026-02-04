#!/bin/bash

# Check if an argument is provided
if [ $# -eq 0 ]; then
    echo "USAGE: ./release.sh <version_number>"
    exit 1
fi

# check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq could not be found. Please install it."
    exit 1
fi

VERSION=$1

# Update version in apps/web/package.json
jq --arg version "$VERSION" '.version = $version' apps/api/package.json > tmp.json && mv tmp.json apps/api/package.json

# commit, tag and push
git add . 
git commit -m v$VERSION
git push
git tag -a "v${VERSION}" -m "v${VERSION}"
git push origin --tags 