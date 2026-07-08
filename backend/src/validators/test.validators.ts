import { z } from "zod";

export const testQbRuleSchema = z.object({
  qbId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  questionsToPick: z.number().int().min(1),
  marksPerQuestion: z.number().int().min(1),
  randomQuestions: z.boolean().default(true),
  randomOrder: z.boolean().default(true),
  uniqueQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false)
});

export const createTestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    enrollmentKey: z.string().min(4).max(50).regex(/^\S+$/).optional().or(z.literal("")).or(z.null()),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    durationMinutes: z.number().int().min(1),
    qbRules: z.array(testQbRuleSchema).min(1),
    useFullscreen: z.boolean().default(false),
    logActivities: z.boolean().default(false),
    preventCopyPaste: z.boolean().default(false),
    saveAttempts: z.boolean().default(true),
    infiniteTries: z.boolean().default(false),
    resultsReveal: z.boolean().default(true)
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
