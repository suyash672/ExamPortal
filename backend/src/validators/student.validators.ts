import { z } from "zod";

export const enrollSchema = z.object({
  testId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  enrollmentKey: z.string().min(1)
});

export const beginTestSchema = z.object({
  enrollmentId: z.string().regex(/^[a-fA-F0-9]{24}$/)
});

export const saveAnswerSchema = z.object({
  attemptId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  attemptQuestionId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  selectedOptionIds: z.array(z.string().regex(/^[a-fA-F0-9]{24}$/)).optional(),
  textAnswer: z.string().trim().max(1000).optional()
});

export const submitAttemptSchema = z.object({
  attemptId: z.string().regex(/^[a-fA-F0-9]{24}$/)
});
