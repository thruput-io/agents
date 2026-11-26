// ruleid: no-ignored-parameter
const ignoring = (_given: string, used: string): string => used;

// ok: no-ignored-parameter
const using = (given: string, used: string): string => given + used;

export { ignoring, using };
