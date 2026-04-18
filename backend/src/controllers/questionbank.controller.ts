import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { createQbSchema, updateQbSchema } from "../validators/questionbank.validators";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getQbs(req: Request, res: Response): Promise<void> {
  const moduleId = getParamAsString(req.params.moduleId);

  if (!moduleId) {
    res.status(400).json({ message: "moduleId is required" });
    return;
  }

  const qbs = await prisma.questionBank.findMany({
    where: { moduleId },
    include: {
      _count: {
        select: {
          questions: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  res.status(200).json(qbs);
}

export async function createQb(req: Request, res: Response): Promise<void> {
  const payload = {
    ...req.body,
    moduleId: req.params.moduleId ?? req.body.moduleId
  };

  const parsed = createQbSchema.safeParse(payload);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const createdQb = await prisma.questionBank.create({
    data: {
      moduleId: parsed.data.moduleId,
      name: parsed.data.name
    }
  });

  res.status(201).json(createdQb);
}

export async function updateQb(req: Request, res: Response): Promise<void> {
  const qbId = getParamAsString(req.params.id);

  if (!qbId) {
    res.status(400).json({ message: "Question bank id is required" });
    return;
  }

  const parsed = updateQbSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const updatedQb = await prisma.questionBank.update({
    where: { id: qbId },
    data: parsed.data
  });

  res.status(200).json(updatedQb);
}

export async function deleteQb(req: Request, res: Response): Promise<void> {
  const qbId = getParamAsString(req.params.id);

  if (!qbId) {
    res.status(400).json({ message: "Question bank id is required" });
    return;
  }

  const ruleCount = await prisma.testQbRule.count({
    where: { qbId }
  });

  if (ruleCount > 0) {
    res.status(400).json({ message: "This question bank is used in a test and cannot be deleted" });
    return;
  }

  const activeQuestionCount = await prisma.question.count({
    where: {
      qbId,
      deletedAt: null
    }
  });

  if (activeQuestionCount > 0) {
    res.status(400).json({ message: "Delete all questions first" });
    return;
  }

  await prisma.questionBank.delete({
    where: { id: qbId }
  });

  res.status(200).json({ message: "Question bank deleted" });
}
