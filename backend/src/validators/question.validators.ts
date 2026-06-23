import { z } from "zod";

const createMcqSchemaBase = z.object({
  qbId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  type: z.literal("MCQ"),
  questionText: z.string().trim().min(5).max(1000),
  options: z.array(z.object({
    optionText: z.string().trim().min(1).max(500),
    scorePercent: z.number().int().min(0).max(100)
  })).min(2).max(6)
});

const createTextSchemaBase = z.object({
  qbId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  type: z.literal("TEXT"),
  questionText: z.string().trim().min(5).max(1000),
  acceptedAnswers: z.array(
    z
      .string()
      .trim()
      .min(1)
      .max(200)
      .transform((value) => value.toLowerCase())
  ).min(1).max(10)
});

export const mcqOptionSchema = z.object({
  optionText: z.string().trim().min(1).max(500),
  scorePercent: z.number().int().min(0).max(100)
});

export const createMcqSchema = createMcqSchemaBase
  .superRefine((data, context) => {
    const totalScore = data.options.reduce((sum, option) => sum + option.scorePercent, 0);

    if (totalScore !== 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "MCQ option scores must add up to 100"
      });
    }

    if (!data.options.some((option) => option.scorePercent > 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "At least one option must have a scorePercent greater than 0"
      });
    }
  });

export const createTextSchema = createTextSchemaBase;

export const createQuestionSchema = z
  .discriminatedUnion("type", [createMcqSchemaBase, createTextSchemaBase])
  .superRefine((data, context) => {
    if (data.type !== "MCQ") {
      return;
    }

    const totalScore = data.options.reduce((sum, option) => sum + option.scorePercent, 0);

    if (totalScore !== 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "MCQ option scores must add up to 100"
      });
    }

    if (!data.options.some((option) => option.scorePercent > 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "At least one option must have a scorePercent greater than 0"
      });
    }
  });
