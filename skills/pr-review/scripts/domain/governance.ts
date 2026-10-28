import { z } from 'zod';
import { DefinitionSchema, PrincipleSchema, RuleSchema } from './contracts.g.ts';

export const GovernanceSchema = z.object({
  rules: z.object({ rules: z.array(RuleSchema) }).transform((file) => file.rules),
  principles: z.object({ principles: z.array(PrincipleSchema) }).transform((file) => file.principles),
  definitions: z.object({ definitions: z.array(DefinitionSchema) }).transform((file) => file.definitions),
});
