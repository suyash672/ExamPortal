import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import {
  createModuleSchema,
  updateModuleSchema
} from "../validators/module.validators";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getModules(req: Request, res: Response): Promise<void> {
  const subjectId = getParamAsString(req.params.subjectId);

  if (!subjectId) {
    res.status(400).json({ message: "subjectId is required" });
    return;
  }

  const modules = await prisma.module.findMany({
    where: { subjectId },
    include: {
      _count: {
        select: {
          questionBanks: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  res.status(200).json(modules);
}

export async function createModule(req: Request, res: Response): Promise<void> {
  const payload = {
    ...req.body,
    subjectId: req.params.subjectId ?? req.body.subjectId
  };

  const parsed = createModuleSchema.safeParse(payload);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const createdModule = await prisma.module.create({
    data: {
      subjectId: parsed.data.subjectId,
      name: parsed.data.name
    }
  });

  res.status(201).json(createdModule);
}

export async function updateModule(req: Request, res: Response): Promise<void> {
  const moduleId = getParamAsString(req.params.id);

  if (!moduleId) {
    res.status(400).json({ message: "Module id is required" });
    return;
  }

  const parsed = updateModuleSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const updatedModule = await prisma.module.update({
    where: { id: moduleId },
    data: parsed.data
  });

  res.status(200).json(updatedModule);
}

export async function deleteModule(req: Request, res: Response): Promise<void> {
  const moduleId = getParamAsString(req.params.id);

  if (!moduleId) {
    res.status(400).json({ message: "Module id is required" });
    return;
  }

  const questionBankCount = await prisma.questionBank.count({
    where: { moduleId }
  });

  if (questionBankCount > 0) {
    res.status(400).json({ message: "Delete all question banks first" });
    return;
  }

  await prisma.module.delete({
    where: { id: moduleId }
  });

  res.status(200).json({ message: "Module deleted" });
}
