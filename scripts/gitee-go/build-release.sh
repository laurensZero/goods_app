#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

resolve_tag() {
  if [ -n "${RELEASE_TAG:-}" ]; then
    printf '%s\n' "${RELEASE_TAG}"
    return
  fi

  if [ -n "${GITEE_GIT_TAG:-}" ]; then
    printf '%s\n' "${GITEE_GIT_TAG}"
    return
  fi

  if [ -n "${CI_COMMIT_TAG:-}" ]; then
    printf '%s\n' "${CI_COMMIT_TAG}"
    return
  fi

  git describe --tags --exact-match HEAD 2>/dev/null || true
}

infer_gitee_repo() {
  local remote_url owner repo
  remote_url="$(git remote get-url origin 2>/dev/null || true)"
  if [ -z "${remote_url}" ]; then
    return
  fi

  owner="$(printf '%s' "${remote_url}" | sed -E 's#.*gitee\.com[:/]([^/]+)/([^/.]+)(\.git)?#\1#')"
  repo="$(printf '%s' "${remote_url}" | sed -E 's#.*gitee\.com[:/]([^/]+)/([^/.]+)(\.git)?#\2#')"

  if [ -n "${owner}" ] && [ -n "${repo}" ] && [ "${owner}" != "${remote_url}" ] && [ "${repo}" != "${remote_url}" ]; then
    printf '%s/%s\n' "${owner}" "${repo}"
  fi
}

generate_release_notes() {
  local tag="$1"
  local notes_file="$2"
  local previous_tag range has_notes title title_lower files body

  git fetch --tags --force >/dev/null 2>&1 || true

  previous_tag="$(git describe --tags --abbrev=0 "${tag}^" 2>/dev/null || true)"
  if [ -z "${previous_tag}" ]; then
    previous_tag="$(git tag --sort=-creatordate | grep -Fxv "${tag}" | head -n 1 || true)"
  fi

  if [ -n "${previous_tag}" ]; then
    range="${previous_tag}..${tag}"
  else
    range="${tag}"
  fi

  {
    echo "## Update Notes"
    echo
  } > "${notes_file}"

  has_notes=0
  while IFS= read -r commit; do
    [ -n "${commit}" ] || continue

    title="$(git log -1 --format=%s "${commit}")"
    title_lower="$(printf '%s' "${title}" | tr '[:upper:]' '[:lower:]')"

    case "${title_lower}" in
      merge\ *|chore:*|chore\ *|chore\(*)
        continue
        ;;
    esac

    files="$(git diff-tree --no-commit-id --name-only -r "${commit}")"
    if [ -z "${files}" ]; then
      continue
    fi

    if ! printf '%s\n' "${files}" | grep -qvE '^\.github/workflows/'; then
      continue
    fi

    echo "- ${title}" >> "${notes_file}"

    body="$(git log -1 --format=%b "${commit}")"
    if [ -n "${body}" ]; then
      while IFS= read -r line || [ -n "${line}" ]; do
        if [ -n "${line}" ]; then
          printf '  %s\n' "${line}" >> "${notes_file}"
        else
          echo >> "${notes_file}"
        fi
      done <<< "${body}"
    fi

    echo >> "${notes_file}"
    has_notes=1
  done < <(git rev-list --reverse "${range}")

  if [ "${has_notes}" -eq 0 ]; then
    echo "- No user-facing changes were detected for this tag." >> "${notes_file}"
  fi
}

require_command git
require_command node
require_command npm

TAG="$(resolve_tag)"
if [ -z "${TAG}" ]; then
  echo "Unable to resolve release tag. Set RELEASE_TAG or push an annotated tag to trigger this pipeline." >&2
  exit 1
fi

VERSION_NAME="${TAG#v}"
VERSION_NAME="${VERSION_NAME#V}"
APK_PATH="${ROOT_DIR}/android/app/build/outputs/apk/release/app-release.apk"
RELEASE_ASSET_NAME="${RELEASE_ASSET_NAME:-goods-app-${TAG}-release.apk}"

GITEE_TOKEN="${GITEE_RELEASE_TOKEN:-${GITEE_TOKEN:-}}"
if [ -z "${GITEE_TOKEN}" ]; then
  echo "Missing GITEE_TOKEN or GITEE_RELEASE_TOKEN." >&2
  exit 1
fi

GITEE_OWNER="${GITEE_OWNER:-}"
GITEE_REPO="${GITEE_REPO:-}"
if [ -n "${GITEE_REPO}" ] && printf '%s' "${GITEE_REPO}" | grep -q '/'; then
  GITEE_OWNER="${GITEE_OWNER:-${GITEE_REPO%%/*}}"
  GITEE_REPO="${GITEE_REPO##*/}"
fi

if [ -z "${GITEE_OWNER}" ] || [ -z "${GITEE_REPO}" ]; then
  inferred_repo="$(infer_gitee_repo || true)"
  if [ -n "${inferred_repo}" ]; then
    GITEE_OWNER="${GITEE_OWNER:-${inferred_repo%%/*}}"
    GITEE_REPO="${GITEE_REPO:-${inferred_repo##*/}}"
  fi
fi

if [ -z "${GITEE_OWNER}" ] || [ -z "${GITEE_REPO}" ]; then
  echo "Missing GITEE_OWNER/GITEE_REPO. You can also set GITEE_REPO as owner/repo." >&2
  exit 1
fi

ANDROID_SDK_PATH="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "${ANDROID_SDK_PATH}" ]; then
  echo "Missing ANDROID_SDK_ROOT or ANDROID_HOME." >&2
  exit 1
fi
printf 'sdk.dir=%s\n' "${ANDROID_SDK_PATH}" > android/local.properties

cleanup_keystore=0
if [ -n "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  printf '%s' "${ANDROID_KEYSTORE_BASE64}" | base64 --decode > android/app/release.keystore
  export ANDROID_KEYSTORE_FILE="${ROOT_DIR}/android/app/release.keystore"
  cleanup_keystore=1
fi

cleanup() {
  if [ "${cleanup_keystore}" -eq 1 ]; then
    rm -f "${ROOT_DIR}/android/app/release.keystore"
  fi
}
trap cleanup EXIT

if [ ! -f android/keystore.properties ] && [ -z "${ANDROID_KEYSTORE_FILE:-}" ]; then
  echo "Release signing is not configured. Provide ANDROID_KEYSTORE_BASE64 or ANDROID_KEYSTORE_FILE, or keep android/keystore.properties on the agent host." >&2
  exit 1
fi

echo "Building tag ${TAG} for Gitee release ${GITEE_OWNER}/${GITEE_REPO}"

npm ci
VITE_APP_VERSION="${VERSION_NAME}" VITE_ANDROID_VERSION_NAME="${VERSION_NAME}" npm run build:android
chmod +x android/gradlew
(
  cd android
  ANDROID_VERSION_NAME="${VERSION_NAME}" ./gradlew assembleRelease
)

if [ ! -f "${APK_PATH}" ]; then
  echo "APK not found at ${APK_PATH}" >&2
  exit 1
fi

NOTES_FILE="${ROOT_DIR}/release-notes-gitee.md"
generate_release_notes "${TAG}" "${NOTES_FILE}"

node scripts/gitee-go/publish-release.mjs \
  --owner "${GITEE_OWNER}" \
  --repo "${GITEE_REPO}" \
  --token "${GITEE_TOKEN}" \
  --tag "${TAG}" \
  --target "${TAG}" \
  --name "${TAG}" \
  --apk "${APK_PATH}" \
  --asset-name "${RELEASE_ASSET_NAME}" \
  --notes-file "${NOTES_FILE}"
