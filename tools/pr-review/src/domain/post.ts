import type { HostError } from "./host-error.ts";
import type { Posted } from "./posted.ts";

type Post = Posted | HostError;

export type { Post };
