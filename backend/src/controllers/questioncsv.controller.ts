import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { parse } from "csv-parse/sync";
import { AppError } from "../lib/AppError";
import type { QuestionInput } from "../lib/question.persistence";
import { createQuestionSchema } from "../validators/question.validators";
import { createQuestionRecord } from "../lib/question.persistence";

const prisma = new PrismaClient();

type CsvRowError = {
  row: number;
  errors: string[];
};

type CsvRecord = Record<string, string>;

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeCell(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseScore(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildQuestionPayloadFromRow(row: CsvRecord, qbId: string) {
  const type = normalizeCell(row.type).toUpperCase();
  const questionText = normalizeCell(row.question_text);

  if (type === "MCQ") {
    const options = [] as Array<{ optionText: string; scorePercent: number }>;

    for (let index = 1; index <= 6; index += 1) {
      const optionText = normalizeCell(row[`option_${index}_text`]);
      const scoreText = normalizeCell(row[`option_${index}_score`]);

      if (!optionText && !scoreText) {
        continue;
      }

      if (!optionText || !scoreText) {
        return {
          errors: [`option_${index}_text and option_${index}_score must both be provided`]
        };
      }

      const scorePercent = parseScore(scoreText);
      if (scorePercent === null) {
        return {
          errors: [`option_${index}_score must be an integer`] 
        };
      }

      options.push({ optionText, scorePercent });
    }

    return {
      payload: {
        qbId,
        type: "MCQ" as const,
        questionText,
        options
      }
    };
  }

  if (type === "TEXT") {
    const acceptedAnswers = [] as string[];

    for (let index = 1; index <= 5; index += 1) {
      const answer = normalizeCell(row[`accepted_answer_${index}`]);
      if (answer) {
        acceptedAnswers.push(answer.toLowerCase());
      }
    }

    return {
      payload: {
        qbId,
        type: "TEXT" as const,
        questionText,
        acceptedAnswers
      }
    };
  }

  return {
    errors: ["type must be MCQ or TEXT"]
  };
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

export async function importCsv(
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

    let records: CsvRecord[];

    try {
      records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true
      }) as CsvRecord[];
    } catch {
      throw new AppError("Invalid CSV file", 400);
    }

    const rowErrors: CsvRowError[] = [];
    const validQuestions = [] as Array<
      | {
          qbId: string;
          type: "MCQ";
          questionText: string;
          options: Array<{ optionText: string; scorePercent: number }>;
        }
      | {
          qbId: string;
          type: "TEXT";
          questionText: string;
          acceptedAnswers: string[];
        }
    >;

    records.forEach((row, index) => {
      const rowNumber = index + 2;
      const candidate = buildQuestionPayloadFromRow(row, qbId);

      if ("errors" in candidate) {
        rowErrors.push({ row: rowNumber, errors: candidate.errors ?? ["Invalid row"] });
        return;
      }

      const parsed = createQuestionSchema.safeParse(candidate.payload);
      if (!parsed.success) {
        rowErrors.push({
          row: rowNumber,
          errors: parsed.error.issues.map((issue) => issue.message)
        });
        return;
      }

      validQuestions.push(parsed.data as QuestionInput);
    });

    if (rowErrors.length > 0) {
      throw new AppError(JSON.stringify({ errors: rowErrors }), 400);
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

    res.status(200).json({ imported: validQuestions.length });
  } catch (error) {
    next(error);
  }
}
