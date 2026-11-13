export const nonnull = <T>(candidate: T): T & {} => {
	if (candidate === null || candidate === undefined) {
		throw new Error("Required");
	}
	return candidate;
};

export const isNullOrEmpty = <T>(
	value: T | null | undefined | "",
): value is null | undefined | "" =>
	value === null || value === undefined || value === "";

export const emptyAsNull = (value: string | null | undefined): string | null =>
	value === "" || value === undefined ? null : value;

export const nonEmptyString = (value: string | null | undefined): string =>
	nonnull(emptyAsNull(value));
