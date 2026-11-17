# ADR 0010: Parallel Verification Preserves Every Failure

## Date

2026-11-17

## Context

Verification runs independent static checks and test suites concurrently to keep feedback fast, while Bash's multi-argument `wait` returns only the last argument's exit status and could mask earlier failures.

## Decision

Every concurrent verification step runs under abort-on-error mode, and the build waits on each background job individually so any failure in schemas, linters, type checks, audits, or tests fails the verification run.
