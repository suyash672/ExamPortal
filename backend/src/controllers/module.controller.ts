import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getModules(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const subjectId = getParamAsString(req.params.subjectId);

    if (!subjectId) {
      throw new AppError("subjectId is required", 400);
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
  } catch (error) {
    next(error);
  }
}

export async function createModule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { subjectId, name } = req.body as { subjectId: string; name: string };

    const createdModule = await prisma.module.create({
      data: {
        subjectId,
        name
      }
    });

    res.status(201).json(createdModule);
  } catch (error) {
    next(error);
  }
}

export async function updateModule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const moduleId = getParamAsString(req.params.id);

    if (!moduleId) {
      throw new AppError("Module id is required", 400);
    }

    const updatedModule = await prisma.module.update({
      where: { id: moduleId },
      data: req.body as { name: string }
    });

    res.status(200).json(updatedModule);
  } catch (error) {
    next(error);
  }
}

export async function deleteModule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const moduleId = getParamAsString(req.params.id);

    if (!moduleId) {
      throw new AppError("Module id is required", 400);
    }

    const questionBankCount = await prisma.questionBank.count({
      where: { moduleId }
    });

    if (questionBankCount > 0) {
      throw new AppError("Delete all question banks first", 400);
    }

    await prisma.module.delete({
      where: { id: moduleId }
    });

    res.status(200).json({ message: "Module deleted" });
  } catch (error) {
    next(error);
  }
}
