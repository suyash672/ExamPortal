import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { createQuestionSchema } from "../validators/question.validators";
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

export async function getQuestions(req: Request, res: Response): Promise<void> {
  const qbId = getParamAsString(req.params.qbId);

  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!qbId) {
    res.status(400).json({ message: "qbId is required" });
    return;
  }

  const owned = await ensureOwnedQuestionBank(qbId, req.user.id);
  if (!owned) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const questions = await prisma.question.findMany({
    where: {
      qbId,
      deletedAt: null
    },
    include: questionInclude(),
    orderBy: { createdAt: "desc" }
  });

  res.status(200).json(questions);
}

export async function createQuestion(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const payload = {
    ...req.body,
    qbId: req.params.qbId ?? req.body.qbId
  };

  const parsed = createQuestionSchema.safeParse(payload);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const owned = await ensureOwnedQuestionBank(parsed.data.qbId, req.user.id);
  if (!owned) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const createdQuestion = await prisma.$transaction(async (tx) => {
    return createQuestionRecord(tx, parsed.data);
  });

  res.status(201).json(createdQuestion);
}

export async function updateQuestion(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const questionId = getParamAsString(req.params.id);

  if (!questionId) {
    res.status(400).json({ message: "Question id is required" });
    return;
  }

  const parsed = createQuestionSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const ownedQuestion = await ensureOwnedQuestion(questionId, req.user.id);
  if (!ownedQuestion) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const ownedQuestionBank = await ensureOwnedQuestionBank(parsed.data.qbId, req.user.id);
  if (!ownedQuestionBank) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const updatedQuestion = await prisma.$transaction(async (tx) => {
    return replaceQuestionRecord(tx, questionId, parsed.data);
  });

  res.status(200).json(updatedQuestion);
}

export async function deleteQuestion(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const questionId = getParamAsString(req.params.id);

  if (!questionId) {
    res.status(400).json({ message: "Question id is required" });
    return;
  }

  const owned = await ensureOwnedQuestion(questionId, req.user.id);
  if (!owned) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const attemptCount = await prisma.attemptQuestion.count({
    where: { questionId }
  });

  if (attemptCount > 0) {
    res.status(400).json({ message: "Question has been used in an attempt and cannot be deleted" });
    return;
  }

  await prisma.question.update({
    where: { id: questionId },
    data: { deletedAt: new Date() }
  });

  res.status(200).json({ message: "Question deleted" });
}
