#!/usr/bin/env bash
#
# First-time publish of @lofcz/deepfilternet-web.
#
# npm trusted publishing (OIDC from GitHub Actions) can only be configured for a
# package that already exists on the registry, so the very first version has to
# be published by a human. This script walks through that once: log in, build,
# publish, then set up the trusted publisher for release.yml so every later
# release runs from GitHub Actions without any npm token.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITHUB_OWNER="lofcz"
GITHUB_REPO="DeepFilterNet"
WORKFLOW_FILE="release.yml"
PACKAGES=("packages/web")

cyan() { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
step() { echo; cyan "==> $*"; }

confirm() {
  local answer
  read -r -p "$1 [Y/n] " answer
  [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]]
}

package_name() { node -p "require('$REPO_ROOT/$1/package.json').name"; }
package_version() { node -p "require('$REPO_ROOT/$1/package.json').version"; }

version_exists() {
  npm view "$1@$2" version >/dev/null 2>&1
}

open_url() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$1" || true
  fi
}

cd "$REPO_ROOT"

step "Checking tools"
node --version
NPM_VERSION="$(npm --version)"
echo "npm $NPM_VERSION"
if [[ "$(printf '%s\n' "11.5.1" "$NPM_VERSION" | sort -V | head -n1)" != "11.5.1" ]]; then
  yellow "npm 11.5.1 or newer is required for trusted publishing later; run: npm install -g npm@latest"
fi
command -v wasm-pack >/dev/null || { echo "wasm-pack is required (cargo install wasm-pack)" >&2; exit 1; }
wasm-pack --version
rustc --version

step "npm account"
if npm whoami >/dev/null 2>&1; then
  green "Logged in as $(npm whoami)"
else
  yellow "Not logged in to npm. A browser window will open."
  npm login
  green "Logged in as $(npm whoami)"
fi

step "Packages to publish"
for pkg in "${PACKAGES[@]}"; do
  echo "  $(package_name "$pkg")@$(package_version "$pkg")  ($pkg)"
done
confirm "Publish these?" || { yellow "Aborted."; exit 1; }

step "Installing and building"
npm ci
npm run build

for pkg in "${PACKAGES[@]}"; do
  name="$(package_name "$pkg")"
  version="$(package_version "$pkg")"
  step "Publishing $name@$version"
  if version_exists "$name" "$version"; then
    yellow "$name@$version is already on npm; skipping."
    continue
  fi
  (cd "$pkg" && npm publish --access public)
  green "Published $name@$version"
done

step "Waiting for the registry"
for pkg in "${PACKAGES[@]}"; do
  name="$(package_name "$pkg")"
  version="$(package_version "$pkg")"
  for attempt in $(seq 1 12); do
    if version_exists "$name" "$version"; then
      green "$name@$version is visible"
      break
    fi
    if [[ "$attempt" -eq 12 ]]; then
      yellow "$name is not visible yet; the registry can take a few minutes."
    else
      sleep 10
    fi
  done
done

step "Trusted publishing (one-time, per package)"
cat <<EOF
Every later release is published by GitHub Actions ($WORKFLOW_FILE) through OIDC,
with provenance and without any npm token. npm has to be told to trust that
workflow for each package. On each package's access page:

  1. Under "Trusted Publisher" choose "GitHub Actions".
  2. Organization or user:  $GITHUB_OWNER
     Repository:            $GITHUB_REPO
     Workflow filename:     $WORKFLOW_FILE
     Environment name:      (leave empty)
  3. Save.
  4. Under "Publishing access" pick "Require two-factor authentication and
     disallow tokens" so nothing but the workflow (and you, with 2FA) can publish.

EOF
for pkg in "${PACKAGES[@]}"; do
  name="$(package_name "$pkg")"
  url="https://www.npmjs.com/package/$name/access"
  echo "  $url"
  if confirm "Open $name access settings in the browser now?"; then
    open_url "$url"
    read -r -p "Press Enter once the trusted publisher for $name is saved. "
  fi
done

step "Done"
cat <<EOF
Releases from now on:

  gh workflow run $WORKFLOW_FILE -R $GITHUB_OWNER/$GITHUB_REPO -f release_type=patch

The workflow bumps the package, publishes it with provenance, pushes the
release commit and tag, and creates the GitHub release.
EOF
