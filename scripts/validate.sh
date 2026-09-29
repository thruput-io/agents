#!/usr/bin/env bash
set -euo pipefail

jsonschema lint schemas --resolve schemas
jsonschema metaschema schemas --resolve schemas
jsonschema validate schemas/governance.schema.json governance --resolve schemas
