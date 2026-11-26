import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Host } from "../../domain/host.ts";

type Stopping<Port> = {
	readonly [Operation in keyof Port]: () => Effect.Effect<never>;
};

const stopped = (operation: string): Effect.Effect<never> =>
	Effect.die(new Error(`not yet implemented: ${operation}`));

const notYetImplementedHost: Stopping<Host> = {
	getChange: (): Effect.Effect<never> => stopped("Host.getChange"),
	post: (): Effect.Effect<never> => stopped("Host.post"),
};

const notYetImplementedAgent: Stopping<Agent> = {
	spawn: (): Effect.Effect<never> => stopped("Agent.spawn"),
	terminate: (): Effect.Effect<never> => stopped("Agent.terminate"),
};

export { notYetImplementedAgent, notYetImplementedHost };
