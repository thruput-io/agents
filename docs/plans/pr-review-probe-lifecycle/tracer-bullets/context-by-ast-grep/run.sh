#!/usr/bin/env bash
set -euo pipefail

{
	echo "== call sites into the change"
	while IFS=$'\t' read -r language pattern directory; do
		ast-grep run --pattern "$pattern" --lang "$language" --json=compact "$directory" |
			jq --raw-output '.[] | "\(.file):\(.range.start.line + 1)"' |
			sort
	done < calls.tsv
	echo "== definitions the change calls out to"
	ctags -R -x repo |
		awk '$1 ~ /^(rateFor|rate_for|RateFor)$/ {print $1, $2, $4 ":" $3}' |
		sort
} > found.txt

diff expected.txt found.txt
