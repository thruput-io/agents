import { z } from "zod";

const TokenSchema = z.string().min(1);

export class AccessToken {
	readonly #value: string;
	private constructor(value: string) {
		this.#value = value;
	}
	static from(raw: string): z.ZodSafeParseResult<AccessToken> {
		return TokenSchema.transform((value) => new AccessToken(value)).safeParse(
			raw,
		);
	}
	requestInit(): {
		readonly headers: Readonly<Record<string, string>>;
	} {
		return {
			headers: {
				authorization: `Bearer ${this.#value}`,
			},
		};
	}
	requestInitWithHeaders(headers: Readonly<Record<string, string>>): {
		readonly headers: Readonly<Record<string, string>>;
	} {
		return {
			headers: {
				...headers,
				authorization: `Bearer ${this.#value}`,
			},
		};
	}
	equals(other: AccessToken): boolean {
		return this.#value === other.#value;
	}
}
