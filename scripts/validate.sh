#!/usr/bin/env bash
set -euo pipefail

jsonschema lint schemas --resolve schemas
jsonschema metaschema schemas --resolve schemas
