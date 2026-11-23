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

const AssignmentDataSchema = z.object({
	author: z.string().min(1),
	probe: z.string().min(1),
	group: z.string().min(1),
});

type AssignmentData = z.infer<typeof AssignmentDataSchema>;

export type { AssignmentData, ChangeData, ProbeData };
export { AssignmentDataSchema, ChangeDataSchema, ProbeDataSchema };
