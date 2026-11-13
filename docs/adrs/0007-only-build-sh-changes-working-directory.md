# ADR 0007: Only build.sh Changes the Working Directory

## Date

2026-11-09

## Context

Version managers and build tools resolve project configuration by walking upward from the current working directory, while changing directory across child scripts mutates process state and makes relative paths fragile. Normalizing the working directory once in the top-level entry point gives every tool and child script a predictable root.

## Decision

`build.sh` changes the working directory to the repository root, and no other shell script in the repository changes the working directory.
