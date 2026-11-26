interface Codec {
	readonly decode: (text: string) => string;
}

interface Value {
	readonly codec: Codec;
}

// ruleid: parse-only-at-the-perimeter
const created = (value: Value, text: string): string => value.codec.decode(text);

// ok: parse-only-at-the-perimeter
const passed = (already: string): string => already;

export { created, passed };
