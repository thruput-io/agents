import { Change } from "../domain/change.ts";
import type { Page } from "../domain/page.ts";
import type { TargetUrl } from "../domain/target-url.ts";
import { PageCodec } from "./values.ts";

const changeOf = (url: TargetUrl, pages: readonly string[]): Change =>
	Change.of(
		url,
		pages.map((text: string): Page => PageCodec.decode(text)),
	);

export { changeOf };
