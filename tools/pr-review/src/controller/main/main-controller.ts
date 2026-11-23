import type { Either } from "../../domain/either.ts";
import type {
	NotReviewable,
	Prepared,
	ReviewStatus,
	TargetUrl,
	Workdir,
} from "../../domain/review.ts";
import type {
	Clock,
	Hosts,
	ProbeCatalog,
	Reviews,
} from "../../domain/review-ports.ts";

interface MainControllerPorts {
	readonly hosts: Hosts;
	readonly reviews: Reviews;
	readonly catalog: ProbeCatalog;
	readonly clock: Clock;
}

class MainController {
	readonly #hosts: Hosts;
	readonly #reviews: Reviews;
	readonly #catalog: ProbeCatalog;
	readonly #clock: Clock;

	private constructor(ports: MainControllerPorts) {
		this.#hosts = ports.hosts;
		this.#reviews = ports.reviews;
		this.#catalog = ports.catalog;
		this.#clock = ports.clock;
	}

	static over(ports: MainControllerPorts): MainController {
		return new MainController(ports);
	}

	async prepare(
		url: TargetUrl,
		workdir: Workdir,
	): Promise<Either<NotReviewable, Prepared>> {
		const [resolution, probes] = await Promise.all([
			this.#hosts.getChange(url),
			this.#catalog.probes(),
		]);

		return resolution.mapAsync(async (change) => {
			const review = change.reviewWith(probes);

			await this.#reviews.save(workdir, review);

			return review.prepared();
		});
	}

	async status(workdir: Workdir): Promise<ReviewStatus> {
		const review = await this.#reviews.load(workdir);

		return review.statusAt(this.#clock.now());
	}
}

export { MainController };
