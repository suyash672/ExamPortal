import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getQbs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const moduleId = getParamAsString(req.params.moduleId);

    if (!moduleId) {
      throw new AppError("moduleId is required", 400);
    }

    const qbs = await prisma.questionBank.findMany({
      where: { moduleId },
      include: {
        _count: {
          select: {
            questions: {
              // MongoDB stores null as an absent field; isSet:false matches
              // not-deleted questions (deletedAt: null fails to match).
              where: { deletedAt: { isSet: false } }
            },
            testQbRules: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json(qbs);
  } catch (error) {
    next(error);
  }
}

export async function createQb(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { moduleId, name, type } = req.body as { moduleId: string; name: string; type?: string };

    const createdQb = await prisma.questionBank.create({
      data: {
        moduleId,
        name,
        type: type || "easy"
      }
    });

    res.status(201).json(createdQb);
  } catch (error) {
    next(error);
  }
}

export async function updateQb(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const qbId = getParamAsString(req.params.id);

    if (!qbId) {
      throw new AppError("Question bank id is required", 400);
    }

    const { name, type } = req.body as { name?: string; type?: string };

    const updatedQb = await prisma.questionBank.update({
      where: { id: qbId },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type })
      }
    });

    res.status(200).json(updatedQb);
  } catch (error) {
    next(error);
  }
}

export async function deleteQb(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawId = req.params.id;
    const qbId = Array.isArray(rawId) ? rawId[0] : (rawId || "");

    if (!qbId) {
      throw new AppError("Question bank id is required", 400);
    }

    let targetQbId = qbId;
    let qbRecord = null;

    if (qbId.match(/^[a-fA-F0-9]{24}$/)) {
      qbRecord = await prisma.questionBank.findUnique({ where: { id: qbId } });
    } else {
      qbRecord = await prisma.questionBank.findFirst({ where: { name: qbId } });
    }

    if (!qbRecord) {
      throw new AppError("Question bank not found", 404);
    }
    targetQbId = qbRecord.id;

    // 1. Delete associated McqOptions & TextAcceptedAnswers
    const questions = await prisma.question.findMany({
      where: { qbId: targetQbId },
      select: { id: true }
    });
    const questionIds = questions.map((q) => q.id);

    if (questionIds.length > 0) {
      await prisma.mcqOption.deleteMany({
        where: { questionId: { in: questionIds } }
      });
      await prisma.textAcceptedAnswer.deleteMany({
        where: { questionId: { in: questionIds } }
      });
      await prisma.question.deleteMany({
        where: { id: { in: questionIds } }
      });
    }

    // 2. Delete associated TestQbRule entries
    await prisma.testQbRule.deleteMany({
      where: { qbId: targetQbId }
    });

    // 3. Delete Question Bank record
    await prisma.questionBank.delete({
      where: { id: targetQbId }
    });

    res.status(200).json({ message: "Question bank deleted successfully" });
  } catch (error) {
    next(error);
  }
}
