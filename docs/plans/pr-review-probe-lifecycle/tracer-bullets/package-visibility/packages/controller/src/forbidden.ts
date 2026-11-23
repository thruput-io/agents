// @ts-expect-error the friend module is not an entry point of its package
import { changeFrom } from "@bullet/core/src/internal.ts";
// @ts-expect-error the marks are not an entry point of their package
import { changeMark } from "@bullet/core/src/marks.ts";

export { changeFrom, changeMark };
