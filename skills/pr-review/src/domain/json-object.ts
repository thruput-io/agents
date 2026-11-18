const HEX_PATTERN = /^[0-9a-fA-F]{4}$/u;
const LEADING_WS_RE = /^[ \t\n\r]+/u;
const JSON_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u;
const JSON_LITERALS = ["true", "false", "null"] as const;
const UNICODE_HEX_DIGITS = 4;
const MIN_PRINTABLE_ASCII = 0x20;
const MAX_JSON_DEPTH = 32;
const ESCAPE_CHARS = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
const INVALID_POS = -1;

function skipWs(text: string, pos: number): number {
	const match = LEADING_WS_RE.exec(text.slice(pos));
	if (match === null) {
		return pos;
	}
	return pos + match[0].length;
}

function scanEscape(text: string, pos: number): number {
	const esc = text[pos];
	if (esc === undefined) {
		return INVALID_POS;
	}
	if (ESCAPE_CHARS.has(esc)) {
		return pos + 1;
	}
	if (esc !== "u") {
		return INVALID_POS;
	}
	const hex = text.slice(pos + 1, pos + 1 + UNICODE_HEX_DIGITS);
	if (!HEX_PATTERN.test(hex)) {
		return INVALID_POS;
	}
	return pos + 1 + UNICODE_HEX_DIGITS;
}

function scanString(text: string, pos: number): number {
	if (text[pos] !== '"') {
		return INVALID_POS;
	}
	let cursor = pos + 1;
	while (cursor < text.length) {
		const code = text.charCodeAt(cursor);
		const ch = text[cursor];
		if (code < MIN_PRINTABLE_ASCII) {
			return INVALID_POS;
		}
		if (ch === '"') {
			return cursor + 1;
		}
		if (ch === "\\") {
			cursor = scanEscape(text, cursor + 1);
			if (cursor < 0) {
				return INVALID_POS;
			}
		} else {
			cursor += 1;
		}
	}
	return INVALID_POS;
}

function scanLiteralOrNumber(text: string, pos: number): number {
	for (const literal of JSON_LITERALS) {
		if (text.startsWith(literal, pos)) {
			return pos + literal.length;
		}
	}
	const match = JSON_NUMBER_RE.exec(text.slice(pos));
	if (match === null) {
		return INVALID_POS;
	}
	return pos + match[0].length;
}

function scanValue(text: string, pos: number, depth: number): number {
	if (depth > MAX_JSON_DEPTH) {
		return INVALID_POS;
	}
	const start = skipWs(text, pos);
	const ch = text[start];
	if (ch === "{") {
		return scanObject(text, start, depth + 1);
	}
	if (ch === "[") {
		return scanArray(text, start, depth + 1);
	}
	if (ch === '"') {
		return scanString(text, start);
	}
	return scanLiteralOrNumber(text, start);
}

function scanArray(text: string, pos: number, depth: number): number {
	if (text[pos] !== "[") {
		return INVALID_POS;
	}
	let cursor = skipWs(text, pos + 1);
	if (text[cursor] === "]") {
		return cursor + 1;
	}
	while (cursor >= 0) {
		cursor = scanValue(text, cursor, depth);
		if (cursor < 0) {
			return INVALID_POS;
		}
		cursor = skipWs(text, cursor);
		if (text[cursor] === "]") {
			return cursor + 1;
		}
		if (text[cursor] !== ",") {
			return INVALID_POS;
		}
		cursor += 1;
	}
	return INVALID_POS;
}

function scanObject(text: string, pos: number, depth: number): number {
	if (text[pos] !== "{") {
		return INVALID_POS;
	}
	let cursor = skipWs(text, pos + 1);
	if (text[cursor] === "}") {
		return cursor + 1;
	}
	while (cursor >= 0) {
		cursor = scanString(text, skipWs(text, cursor));
		if (cursor < 0) {
			return INVALID_POS;
		}
		cursor = skipWs(text, cursor);
		if (text[cursor] !== ":") {
			return INVALID_POS;
		}
		cursor = scanValue(text, cursor + 1, depth);
		if (cursor < 0) {
			return INVALID_POS;
		}
		cursor = skipWs(text, cursor);
		if (text[cursor] === "}") {
			return cursor + 1;
		}
		if (text[cursor] !== ",") {
			return INVALID_POS;
		}
		cursor = skipWs(text, cursor + 1);
	}
	return INVALID_POS;
}

export function isValidJsonObject(text: string): boolean {
	const end = scanObject(text, skipWs(text, 0), 0);
	return end >= 0 && skipWs(text, end) === text.length;
}
