#!/usr/bin/env bash
set -euo pipefail

work="$1/work"
served="$1/served/first-review.git"

export GIT_AUTHOR_NAME="Fixture" GIT_AUTHOR_EMAIL="fixture@example.invalid"
export GIT_COMMITTER_NAME="Fixture" GIT_COMMITTER_EMAIL="fixture@example.invalid"
export GIT_AUTHOR_DATE="2026-01-01T00:00:00Z" GIT_COMMITTER_DATE="2026-01-01T00:00:00Z"

rm -rf "$1"
mkdir -p "$work" "$1/served"

git -C "$work" init --quiet --initial-branch=main
printf 'one\n' > "$work/file.txt"
git -C "$work" add file.txt
git -C "$work" commit --quiet --message "Base"

git -C "$work" switch --quiet --create first-review
printf 'one\ntwo\n' > "$work/file.txt"
git -C "$work" commit --quiet --all --message "Add a line"

git clone --quiet --bare "$work" "$served"
git -C "$served" update-server-info
