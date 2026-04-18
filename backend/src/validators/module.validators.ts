import { z } from "zod";

export const createModuleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subjectId: z.string().uuid()
});

export const updateModuleSchema = z.object({
  name: z.string().trim().min(1).max(100)
});
