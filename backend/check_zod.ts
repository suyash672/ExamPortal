import { z } from "zod";

export const testQbRuleSchema = z.object({
  qbId: z.string().regex(/^[a-fA-F0-9]{24}$/),
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

try {
  createTestSchema.parse({
    title: "Test",
    enrollmentKey: "test1234",
    startTime: "2026-06-23T11:16:00.000Z", // say 16:46 IST
    endTime: "2026-06-23T12:16:00.000Z",
    durationMinutes: 60,
    qbRules: [
      {
        qbId: "60b8d295f1c4e7240c1e0b5a",
        questionsToPick: 1,
        marksPerQuestion: 1
      }
    ]
  });
  console.log("Valid");
} catch (e: any) {
  console.log(e.errors);
}
