import { z } from "zod";

export const enrollSchema = z.object({
  testId: z.string().uuid(),
  enrollmentKey: z.string().min(1)
});

export const beginTestSchema = z.object({
  enrollmentId: z.string().uuid()
});

export const saveAnswerSchema = z.object({
  attemptId: z.string().uuid(),
  attemptQuestionId: z.string().uuid(),
  selectedOptionIds: z.array(z.string().uuid()).optional(),
  textAnswer: z.string().trim().max(1000).optional()
});

export const submitAttemptSchema = z.object({
  attemptId: z.string().uuid()
});
