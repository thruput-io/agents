import { Effect, Match } from "effect";
import { Acknowledgement } from "../domain/acknowledgement.ts";
import type { Page } from "../domain/page.ts";
import type { Rule } from "../domain/rule.ts";
import { Back } from "./back.ts";
import { Briefing } from "./briefing.ts";
import { Forward } from "./forward.ts";
import type { Instructions } from "./instructions.ts";
import { NoPage } from "./no-page.ts";
import { NotAcknowledged } from "./not-acknowledged.ts";
import type { Task } from "./task.ts";
import { Verdict } from "./verdict.ts";

type Entry = Acknowledgement | Verdict | Forward | Back;

interface Ledger {
	readonly remaining: readonly Rule[];
	readonly verdicts: readonly Verdict[];
}

interface Happened {
	readonly acknowledgements: readonly Acknowledgement[];
	readonly verdicts: readonly Verdict[];
	readonly position: number;
}

const BEFORE_FIRST = -1;

const isAcknowledgement = (entry: Entry): entry is Acknowledgement =>
	entry instanceof Acknowledgement;
const isVerdict = (entry: Entry): entry is Verdict => entry instanceof Verdict;
const isForward = (entry: Entry): entry is Forward => entry instanceof Forward;
const isBack = (entry: Entry): entry is Back => entry instanceof Back;

class Assignment {
	private readonly task: Task;
	private readonly pages: readonly Page[];
	private readonly happened: Happened;

	private constructor(task: Task, pages: readonly Page[], happened: Happened) {
		this.task = task;
		this.pages = pages;
		this.happened = happened;
		Object.freeze(this);
	}

	static of(task: Task, pages: readonly Page[]): Assignment {
		return new Assignment(task, pages, {
			acknowledgements: [],
			verdicts: [],
			position: BEFORE_FIRST,
		});
	}

	briefing(): Briefing {
		return Briefing.of({
			instructions: this.task.instructions,
			rules: this.acknowledged(),
			page: this.acknowledged().pipe(
				Effect.flatMap(
					(): Effect.Effect<Page, NoPage> =>
						Effect.fromNullishOr(this.pages[this.happened.position]).pipe(
							Effect.mapError((): NoPage => NoPage.create()),
						),
				),
			),
			glossary: this.task.glossary,
		});
	}

	standing(): Effect.Effect<readonly Rule[], Instructions> {
		return this.acknowledged().pipe(
			Effect.map((): readonly Rule[] => this.ledger().remaining),
			Effect.mapError((): Instructions => this.task.detailed),
		);
	}

	ledger(): Ledger {
		return {
			remaining: this.task.rules.filter(
				(rule: Rule): boolean =>
					!this.happened.verdicts.some((verdict: Verdict): boolean =>
						verdict.isOn(rule),
					),
			),
			verdicts: this.happened.verdicts,
		};
	}

	after(entry: Entry): Assignment {
		return new Assignment(
			this.task,
			this.pages,
			Match.value(entry).pipe(
				Match.when(
					isAcknowledgement,
					(sent: Acknowledgement): Happened => ({
						...this.happened,
						acknowledgements: [...this.happened.acknowledgements, sent],
					}),
				),
				Match.when(
					isVerdict,
					(verdict: Verdict): Happened => ({
						...this.happened,
						verdicts: [
							...this.happened.verdicts.filter(
								(earlier: Verdict): boolean => !verdict.replaces(earlier),
							),
							verdict,
						],
					}),
				),
				Match.when(isForward, (): Happened => this.turned(1)),
				Match.when(isBack, (): Happened => this.turned(BEFORE_FIRST)),
				Match.exhaustive,
			),
		);
	}

	private acknowledged(): Effect.Effect<readonly Rule[], NotAcknowledged> {
		return Effect.succeed(this.task.rules).pipe(
			Effect.filterOrFail(
				(): boolean => this.happened.acknowledgements.length > 0,
				(): NotAcknowledged => NotAcknowledged.create(),
			),
		);
	}

	private turned(step: number): Happened {
		return {
			...this.happened,
			position: Math.min(
				this.pages.length,
				Math.max(BEFORE_FIRST, this.happened.position + step),
			),
		};
	}
}

export type { Entry };
export { Assignment };
