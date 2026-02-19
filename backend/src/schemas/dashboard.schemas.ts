import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  projectId: z.string().regex(/^\d+$/).optional(),
});
