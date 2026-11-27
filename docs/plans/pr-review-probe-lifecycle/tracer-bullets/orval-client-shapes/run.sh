#!/usr/bin/env bash
set -euo pipefail

generated=generated/review-tool-probe.g.ts

npx orval --config orval.config.mjs

grep --quiet --fixed-strings 'export const AckParams = zod.object({' "$generated"
grep --quiet --fixed-strings '"probe": zod.string().min(ackPathProbeMin)' "$generated"
grep --quiet --fixed-strings 'export const Ack200Response = zod.object({' "$generated"
grep --quiet --fixed-strings "describe('One rule a change is judged against, by its id')" "$generated"
grep --quiet --fixed-strings 'export const AckDefaultResponse = zod.union([zod.object({' "$generated"
grep --quiet --fixed-strings "zod.enum(['not-valid', 'no-review'])" "$generated"
