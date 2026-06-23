import { z } from "zod";

export const createModuleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subjectId: z.string().regex(/^[a-fA-F0-9]{24}$/)
});

export const updateModuleSchema = z.object({
  name: z.string().trim().min(1).max(100)
});
