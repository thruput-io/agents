import { Effect } from "effect";
import type { Model } from "./domain.ts";
import {
	definitionFrom,
	instructionsFrom,
	outcomeFrom,
	reviewStatusFrom,
	rulesetFrom,
	sessionFrom,
	surfaceFrom,
	targetUrlFrom,
} from "./factory.ts";
import {
	assignmentMark,
	briefingMark,
	changeMark,
	completeLedgerMark,
	cursorMark,
	pendingLedgerMark,
} from "./mark.ts";
import { mint } from "./mint.ts";
import type {
	Agent,
	Assignment,
	Briefing,
	Change,
	CompleteLedger,
	Cursor,
	Host,
	PendingLedger,
} from "./review.ts";

const briefingFrom = (): Briefing =>
	mint({
		[briefingMark]: briefingMark,
		instructions: () => instructionsFrom(),
		rules: () => rulesetFrom(),
		definitionOf: () => definitionFrom(),
	});

const cursorFrom = (): Cursor =>
	mint({
		[cursorMark]: cursorMark,
		next: () => surfaceFrom(),
		previous: () => surfaceFrom(),
	});

function assignmentFrom(): Assignment {
	return mint({
		[assignmentMark]: assignmentMark,
		briefing: () => briefingFrom(),
		cursor: () => cursorFrom(),
		acknowledged: () => pendingLedgerFrom(),
		recorded: () => completeLedgerFrom(),
	});
}

function pendingLedgerFrom(): PendingLedger {
	return mint({
		[pendingLedgerMark]: pendingLedgerMark,
		spawnedBy: (agent: Agent, model: Model) =>
			Effect.map(agent.spawn(assignmentFrom(), model), () => sessionFrom()),
		status: () => reviewStatusFrom(),
		assignmentOf: () => assignmentFrom(),
		submittedTo: () => Effect.succeed(pendingLedgerFrom()),
	});
}

function completeLedgerFrom(): CompleteLedger {
	return mint({
		[completeLedgerMark]: completeLedgerMark,
		status: () => reviewStatusFrom(),
		assignmentOf: () => assignmentFrom(),
		submittedTo: (host: Host) =>
			Effect.map(host.post(targetUrlFrom(), outcomeFrom()), () =>
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
