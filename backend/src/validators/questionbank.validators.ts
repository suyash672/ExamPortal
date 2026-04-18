import { z } from "zod";

export const createQbSchema = z.object({
  name: z.string().trim().min(1).max(100),
  moduleId: z.string().uuid()
});

export const updateQbSchema = z.object({
  name: z.string().trim().min(1).max(100)
});
