import { z } from "zod";

const ChangeDataSchema = z.object({
	author: z.string().min(1),
	description: z.string(),
});

type ChangeData = z.infer<typeof ChangeDataSchema>;

const ProbeDataSchema = z.object({
	name: z.string().min(1),
	group: z.string().min(1),
});

type ProbeData = z.infer<typeof ProbeDataSchema>;

export type { ChangeData, ProbeData };
export { ChangeDataSchema, ProbeDataSchema };
