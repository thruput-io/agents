import { z } from "zod";
import { rehydrateCodeUnderReview } from "../domain/code-under-review.ts";
import type { Change, Checkout, Surface } from "../domain/contracts.g.ts";
import { coordinateLedgers } from "../domain/coordinate-ledgers.ts";
import { Instructions } from "../domain/instructions.ts";
import { nonnull } from "../domain/nullish.ts";
import type { WorkspacePort } from "../domain/ports.ts";
import {
	loadPersistedProbes,
	type ProbeDocument,
} from "../domain/probe-document.ts";
import type {
	LedgerSubmission,
	SubAgentLedger,
} from "../domain/probe-ledger.ts";
import {
	inMemoryProbeStorage,
	type ProbeStorage,
	persistedProbeStorage,
} from "./probe-storage.ts";
import { type ProbeBehavior, probeBehaviorFor } from "./sub-agent-probe.ts";

const SHA1_HEX_LENGTH = 40;
const ZERO_COMMIT_SHA = "0".repeat(SHA1_HEX_LENGTH);

const DEFAULT_PROBE_NAME = "01-purpose";

interface SubAgentControllerInit {
	readonly name: Checkout;
	readonly workdir: WorkspacePort;
	readonly ledger: SubAgentLedger;
	readonly instructions: Instructions;
	readonly change: Change;
	readonly behavior: ProbeBehavior;
	readonly storage: ProbeStorage;
	readonly now: () => number;
}

const customFailure = (
	path: string,
	message: string,
): z.ZodSafeParseResult<LedgerSubmission> =>
	z
		.custom<LedgerSubmission>(() => false, { path: [path], message })
		.safeDecode(null as never);

const fromLedgerInit = (
	workdir: WorkspacePort,
	ledger: SubAgentLedger,
	change: Change,
): SubAgentControllerInit => {
	const checkout = workdir.snapshotDirectory().toString();
	const surface: Surface = {
		headCommit: ZERO_COMMIT_SHA,
		files: [...ledger.pullRequest().surface()],
	};
	return {
		name: DEFAULT_PROBE_NAME,
		workdir,
		ledger,
		instructions: Instructions.forKind("context"),
		change,
		behavior: probeBehaviorFor(
			{ kind: "context", change, surface, rulesets: [], checkout },
			checkout,
		),
		storage: inMemoryProbeStorage(),
		now: Date.now,
	};
};

const withLedgerInit = (
	workdir: WorkspacePort,
	ledger: SubAgentLedger,
	probe: ProbeDocument,
): SubAgentControllerInit => ({
	name: DEFAULT_PROBE_NAME,
	workdir,
	ledger,
	instructions: Instructions.fromParts(probe),
	change: probe.change,
	behavior: probeBehaviorFor(probe, workdir.snapshotDirectory().toString()),
	storage: inMemoryProbeStorage(),
	now: Date.now,
});

const loadWorkdirInit = (
	workdir: WorkspacePort,
	name: Checkout,
	now: () => number,
): SubAgentControllerInit => {
	const persisted = workdir.ledgerDirectory().readPullRequest();
	const pullRequest = rehydrateCodeUnderReview(persisted);
	const rulesets = workdir.ledgerDirectory().readRulesets();
	const probes = loadPersistedProbes(
		workdir.readAudits(),
		persisted.surface,
		rulesets,
	);
	const checkoutDir = workdir.snapshotDirectory().toString();
	const specs = probes.map((entry) =>
		probeBehaviorFor(entry.probe, checkoutDir).toCoordinatedSpec(entry.name),
	);
	const { ledgers } = coordinateLedgers(
		workdir.ledgerDirectory(),
		pullRequest,
		specs,
	);
	const index = probes.findIndex((entry) => entry.name === name);
	if (index < 0) {
		throw new Error(`Unknown probe: ${name}`);
	}
	const target = nonnull(probes[index]);
	return {
		name,
		workdir,
		ledger: nonnull(ledgers[index]),
		instructions: Instructions.fromParts(target.probe),
		change: target.probe.change,
		behavior: probeBehaviorFor(target.probe, checkoutDir),
		storage: persistedProbeStorage(workdir.ledgerDirectory(), name),
		now,
	};
};

export type { SubAgentControllerInit };
export { customFailure, fromLedgerInit, loadWorkdirInit, withLedgerInit };
