import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";
import { createQuestionRecord, questionInclude, replaceQuestionRecord } from "../lib/question.persistence";

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

async function ensureOwnedQuestion(questionId: string, teacherId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      questionBank: {
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
      }
    }
  });

  return question?.questionBank.module.subject.teacherId === teacherId;
}

export async function getQuestions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const qbId = getParamAsString(req.params.qbId);

    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    if (!qbId) {
      throw new AppError("qbId is required", 400);
    }

    const owned = await ensureOwnedQuestionBank(qbId, req.user.id);
    if (!owned) {
      throw new AppError("Forbidden", 403);
    }

    const questions = await prisma.question.findMany({
      where: {
        qbId,
        // Prisma's MongoDB connector stores a null value as an absent field, so
        // a `deletedAt: null` equality filter matches nothing. `isSet: false`
        // correctly matches not-yet-deleted (absent deletedAt) questions.
        deletedAt: { isSet: false }
      },
      include: questionInclude(),
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json(questions);
  } catch (error) {
    next(error);
  }
}

export async function createQuestion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const payload = req.body as {
      qbId: string;
      type: "MCQ" | "TEXT";
      questionText: string;
      options?: Array<{ optionText: string; scorePercent: number }>;
      acceptedAnswers?: string[];
    };

    const owned = await ensureOwnedQuestionBank(payload.qbId, req.user.id);
    if (!owned) {
      throw new AppError("Forbidden", 403);
    }

    const createdQuestion = await prisma.$transaction(async (tx) => {
      return createQuestionRecord(tx, payload as any);
    });

    res.status(201).json(createdQuestion);
  } catch (error) {
    next(error);
  }
}

export async function updateQuestion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const questionId = getParamAsString(req.params.id);

    if (!questionId) {
      throw new AppError("Question id is required", 400);
    }

    const payload = req.body as {
      qbId: string;
      type: "MCQ" | "TEXT";
      questionText: string;
      options?: Array<{ optionText: string; scorePercent: number }>;
      acceptedAnswers?: string[];
    };

    const ownedQuestion = await ensureOwnedQuestion(questionId, req.user.id);
    if (!ownedQuestion) {
      throw new AppError("Forbidden", 403);
    }

    const ownedQuestionBank = await ensureOwnedQuestionBank(payload.qbId, req.user.id);
    if (!ownedQuestionBank) {
      throw new AppError("Forbidden", 403);
    }

    const updatedQuestion = await prisma.$transaction(async (tx) => {
      return replaceQuestionRecord(tx, questionId, payload as any);
    });

    res.status(200).json(updatedQuestion);
  } catch (error) {
    next(error);
  }
}

export async function deleteQuestion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const questionId = getParamAsString(req.params.id);

    if (!questionId) {
      throw new AppError("Question id is required", 400);
    }

    const owned = await ensureOwnedQuestion(questionId, req.user.id);
    if (!owned) {
      throw new AppError("Forbidden", 403);
    }

    const attemptCount = await prisma.attemptQuestion.count({
      where: { questionId }
    });

    if (attemptCount > 0) {
      throw new AppError("Question has been used in an attempt and cannot be deleted", 400);
    }

    await prisma.question.update({
      where: { id: questionId },
      data: { deletedAt: new Date() }
    });

    res.status(200).json({ message: "Question deleted" });
  } catch (error) {
    next(error);
  }
}
