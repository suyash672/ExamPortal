import { z } from "zod";

export const testQbRuleSchema = z.object({
  qbId: z.string().uuid(),
  questionsToPick: z.number().int().min(1),
  marksPerQuestion: z.number().int().min(1)
});

export const createTestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    enrollmentKey: z.string().min(4).max(50).regex(/^\S+$/),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    durationMinutes: z.number().int().min(1),
    qbRules: z.array(testQbRuleSchema).min(1)
  })
  .superRefine((data, ctx) => {
    if (data.endTime <= data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "endTime must be greater than startTime"
      });
    }

    const durationWindowMinutes =
      (data.endTime.getTime() - data.startTime.getTime()) / (60 * 1000);

    if (data.durationMinutes > durationWindowMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMinutes"],
        message: "durationMinutes must be less than or equal to the test window"
      });
    }
  });
