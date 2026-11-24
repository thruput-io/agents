import { Effect } from "effect";
import {
	definitionFrom,
	instructionsFrom,
	outcomeFrom,
	reviewStatusFrom,
	rulesetFrom,
	sessionFrom,
	surfaceFrom,
	targetUrlFrom,
} from "./factories.ts";
import {
	assignmentMark,
	briefingMark,
	changeMark,
	completeLedgerMark,
	pagesMark,
	pendingLedgerMark,
} from "./marks.ts";
import { mint } from "./mint.ts";
import type {
	Assignment,
	Briefing,
	Change,
	CompleteLedger,
	Hosts,
	Pages,
	PendingLedger,
} from "./review.ts";

const briefingFrom = (): Briefing =>
	mint({
		[briefingMark]: briefingMark,
		instructions: () => instructionsFrom(),
		rules: () => rulesetFrom(),
		definitionOf: () => definitionFrom(),
	});

const pagesFrom = (): Pages =>
	mint({
		[pagesMark]: pagesMark,
		next: () => surfaceFrom(),
		previous: () => surfaceFrom(),
	});

function assignmentFrom(): Assignment {
	return mint({
		[assignmentMark]: assignmentMark,
		briefing: () => briefingFrom(),
		pages: () => pagesFrom(),
		acknowledged: () => pendingLedgerFrom(),
		recorded: () => completeLedgerFrom(),
	});
}

function pendingLedgerFrom(): PendingLedger {
	return mint({
		[pendingLedgerMark]: pendingLedgerMark,
		session: () => sessionFrom(),
		status: () => reviewStatusFrom(),
		assignmentOf: () => assignmentFrom(),
		submittedTo: () => Effect.succeed(pendingLedgerFrom()),
	});
}

function completeLedgerFrom(): CompleteLedger {
	return mint({
		[completeLedgerMark]: completeLedgerMark,
		session: () => sessionFrom(),
		status: () => reviewStatusFrom(),
		assignmentOf: () => assignmentFrom(),
		submittedTo: (hosts: Hosts) =>
			Effect.map(hosts.post(targetUrlFrom(), outcomeFrom()), () =>
				completeLedgerFrom(),
			),
	});
}

const changeFrom = (): Change =>
	mint({
		[changeMark]: changeMark,
		review: () => pendingLedgerFrom(),
	});

export { changeFrom, completeLedgerFrom, pendingLedgerFrom };
