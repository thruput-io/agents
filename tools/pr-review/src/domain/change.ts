import type { Page } from "../generated/domain/page.g.ts";
import type { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Assignment } from "./assignment.ts";
import { Review } from "./review.ts";
import type { Probes, Task } from "./task.ts";

class Change {
	private readonly url: TargetUrl;
	private readonly pages: readonly Page[];

	private constructor(url: TargetUrl, pages: readonly Page[]) {
		this.url = url;
		this.pages = pages;
		Object.freeze(this);
	}

	static of(url: TargetUrl, pages: readonly Page[]): Change {
		return new Change(url, pages);
	}

	review(probes: Probes): Review {
		return Review.of(
			this.url,
			probes.map((task: Task) => [task.probe, Assignment.of(task, this.pages)]),
		);
	}
}

export { Change };
