import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import * as cheerio from "cheerio";
import { AppError } from "../lib/AppError";
import type { QuestionInput } from "../lib/question.persistence";
import { createQuestionSchema } from "../validators/question.validators";
import { createQuestionRecord } from "../lib/question.persistence";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function ensureOwnedQuestionBank(qbId: string, teacherId: string) {
  const qb = await prisma.questionBank.findUnique({
    where: { id: qbId },
    select: {
      module: {
        select: {
          subject: {
            select: {
              teacherId: true
            }
          }
        }
      }
    }
  });

  return qb?.module.subject.teacherId === teacherId;
}

export async function importMoodleHtml(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const qbId = getParamAsString(req.body.qbId);
    if (!qbId) {
      throw new AppError("qbId is required", 400);
    }

    const owned = await ensureOwnedQuestionBank(qbId, req.user.id);
    if (!owned) {
      throw new AppError("Forbidden", 403);
    }

    if (!req.file?.buffer) {
      throw new AppError("file is required", 400);
    }

    const htmlContent = req.file.buffer.toString("utf8");
    const $ = cheerio.load(htmlContent);

    const validQuestions: QuestionInput[] = [];
    const errors: string[] = [];

    $(".question").each((index, element) => {
      const q = $(element);
      
      // Moodle XHTML uses <p class="questiontext"> or just the text inside
      let questionText = q.find(".questiontext").text().trim();
      
      if (!questionText) {
        // Fallback if structure varies slightly
        questionText = q.text().trim();
      }

      if (!questionText) {
        errors.push(`Question block ${index + 1} has no identifiable question text.`);
        return; // continue to next element in each()
      }

      const options: Array<{ optionText: string; scorePercent: number }> = [];

      q.find("ul.multichoice li").each((optionIndex, liElem) => {
        const optionText = $(liElem).text().trim();
        if (optionText) {
          // Because the schema strictly requires scores to add up to 100
          // and at least one > 0, we must default the first option to 100%.
          // The teacher will need to manually adjust this later.
          options.push({
            optionText: optionText,
            scorePercent: optionIndex === 0 ? 100 : 0
          });
        }
      });

      if (options.length === 0) {
        // Text questions or unsupported format
        errors.push(`Question block ${index + 1} ("${questionText.substring(0, 30)}...") has no valid options. Only MCQ is supported via HTML import.`);
        return;
      }

      const payload = {
        qbId,
        type: "MCQ" as const,
        questionText,
        options
      };

      const parsed = createQuestionSchema.safeParse(payload);
      if (!parsed.success) {
        errors.push(`Question block ${index + 1} failed validation: ${parsed.error.issues.map(i => i.message).join(", ")}`);
        return;
      }

      validQuestions.push(parsed.data as QuestionInput);
    });

    if (errors.length > 0 && validQuestions.length === 0) {
      // If we got NO valid questions but we had errors, it's a complete failure.
      throw new AppError(JSON.stringify({ errors: errors.map((err, i) => ({ row: i + 1, errors: [err] })) }), 400);
    }

    await prisma.$transaction(
      async (tx) => {
        for (const question of validQuestions) {
          await createQuestionRecord(tx, question, { includeRelations: false });
        }
      },
      {
        timeout: 60000
      }
    );

    res.status(200).json({ imported: validQuestions.length, warnings: errors });
  } catch (error) {
    next(error);
  }
}
