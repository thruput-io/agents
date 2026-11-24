SHELL := bash
.SHELLFLAGS := -euo pipefail -c

export PROJECT_ROOT := $(CURDIR)

JSONSCHEMA := npx --yes @sourcemeta/jsonschema@17.0.0
RESOLVE := --resolve schemas
DECLARED_IDS := schemas/governance/declared-ids.g.schema.json
TOOL := npm --prefix skills/pr-review
TOOL_BIN := skills/pr-review/dist/bin

.PHONY: pass
pass: shell-lint schema-lint schema-metaschema rules-valid skill-rules-valid plugin-audit \
	tool-knip tool-lint tool-typecheck tool-test tool-runs

.PHONY: shell-lint
shell-lint:
	git ls-files -z '*.sh' | xargs -0 shellcheck

.PHONY: declared-ids
declared-ids:
	scripts/declared-ids.schema.sh > $(DECLARED_IDS)

.PHONY: schema-lint
schema-lint: declared-ids
	$(JSONSCHEMA) lint schemas $(RESOLVE)

.PHONY: schema-metaschema
schema-metaschema: declared-ids
	$(JSONSCHEMA) metaschema schemas $(RESOLVE)

.PHONY: rules-valid
rules-valid: declared-ids
	$(JSONSCHEMA) validate $(DECLARED_IDS) rules $(RESOLVE)

.PHONY: skill-rules-valid
skill-rules-valid:
	$(JSONSCHEMA) validate schemas/governance/rules.schema.json skills/pr-review/rules/Rules.yaml $(RESOLVE)
	$(JSONSCHEMA) validate schemas/governance/principles.schema.json skills/pr-review/rules/Principles.yaml $(RESOLVE)
	$(JSONSCHEMA) validate schemas/governance/definitions.schema.json skills/pr-review/rules/Definitions.yaml $(RESOLVE)

.PHONY: release-valid
release-valid:
	$(JSONSCHEMA) validate schemas/repository/release.schema.json $(RELEASE_FILE) $(RESOLVE)

.PHONY: plugin-audit
plugin-audit:
	npx --yes @agentplugins/cli@0.6.1 audit .

.PHONY: tool-install
tool-install:
	$(TOOL) ci --no-audit --no-fund

.PHONY: tool-codegen
tool-codegen: tool-install
	$(TOOL) run codegen

.PHONY: tool-build
tool-build: tool-codegen
	$(TOOL) run build

.PHONY: tool-knip
tool-knip: tool-codegen
	$(TOOL) run knip

.PHONY: tool-lint
tool-lint: tool-codegen
	$(TOOL) run lint

.PHONY: tool-typecheck
tool-typecheck: tool-codegen
	$(TOOL) run typecheck

.PHONY: tool-test
tool-test: tool-build
	$(TOOL) test

.PHONY: tool-runs
tool-runs: tool-build
	$(TOOL_BIN)/review-tool.mjs -h
	$(TOOL_BIN)/review-tool-probe.mjs -h
