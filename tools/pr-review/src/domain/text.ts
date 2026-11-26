import type { TargetUrl, Workdir } from "../generated/domain/value.g.ts";
import { isMinted } from "./mint.ts";

interface Worded {
	readonly text: string;
}

function assertWorded<Value extends object>(
	value: Value,
): asserts value is Value & Worded {
	if (!isMinted(value)) {
		throw new TypeError("the value was not minted by the domain");
	}
}

const textOf = (value: TargetUrl | Workdir): string => {
	assertWorded(value);

	return value.text;
};

export { textOf };
