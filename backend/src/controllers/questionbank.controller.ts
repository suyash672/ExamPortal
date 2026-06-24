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
            }
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
    const { moduleId, name } = req.body as { moduleId: string; name: string };

    const createdQb = await prisma.questionBank.create({
      data: {
        moduleId,
        name
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

    const updatedQb = await prisma.questionBank.update({
      where: { id: qbId },
      data: req.body as { name: string }
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
    const qbId = getParamAsString(req.params.id);

    if (!qbId) {
      throw new AppError("Question bank id is required", 400);
    }

    const ruleCount = await prisma.testQbRule.count({
      where: { qbId }
    });

    if (ruleCount > 0) {
      throw new AppError("This question bank is used in a test and cannot be deleted", 400);
    }

    const activeQuestionCount = await prisma.question.count({
      where: {
        qbId,
        deletedAt: { isSet: false }
      }
    });

    if (activeQuestionCount > 0) {
      throw new AppError("Delete all questions first", 400);
    }

    await prisma.questionBank.delete({
      where: { id: qbId }
    });

    res.status(200).json({ message: "Question bank deleted" });
  } catch (error) {
    next(error);
  }
}
