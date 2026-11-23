import type {
	Instant,
	Probes,
	Resolution,
	Review,
	TargetUrl,
	Workdir,
} from "./review.ts";

interface Hosts {
	getChange: (url: TargetUrl) => Promise<Resolution>;
}

interface Reviews {
	save: (workdir: Workdir, review: Review) => Promise<void>;
	load: (workdir: Workdir) => Promise<Review>;
}

interface ProbeCatalog {
	probes: () => Promise<Probes>;
}

interface Clock {
	now: () => Instant;
}

export type { Clock, Hosts, ProbeCatalog, Reviews };
