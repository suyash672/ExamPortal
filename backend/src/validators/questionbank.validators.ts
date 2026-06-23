import { z } from "zod";

export const createQbSchema = z.object({
  name: z.string().trim().min(1).max(100),
  moduleId: z.string().regex(/^[a-fA-F0-9]{24}$/)
});

export const updateQbSchema = z.object({
  name: z.string().trim().min(1).max(100)
});
