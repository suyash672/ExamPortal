import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getSubjects(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const subjects = await prisma.subject.findMany({
      where: { teacherId: req.user.id },
      include: {
        _count: {
          select: {
            modules: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json(subjects);
  } catch (error) {
    next(error);
  }
}

export async function createSubject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const { name, description } = req.body as {
      name: string;
      description?: string;
    };

    const createdSubject = await prisma.subject.create({
      data: {
        teacherId: req.user.id,
        name,
        description
      }
    });

    res.status(201).json(createdSubject);
  } catch (error) {
    next(error);
  }
}

export async function updateSubject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const subjectId = getParamAsString(req.params.id);

    if (!subjectId) {
      throw new AppError("Subject id is required", 400);
    }

    const updatedSubject = await prisma.subject.update({
      where: { id: subjectId },
      data: req.body as { name?: string; description?: string }
    });

    res.status(200).json(updatedSubject);
  } catch (error) {
    next(error);
  }
}

export async function deleteSubject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const subjectId = getParamAsString(req.params.id);

    if (!subjectId) {
      throw new AppError("Subject id is required", 400);
    }

    const moduleCount = await prisma.module.count({
      where: { subjectId }
    });

    if (moduleCount > 0) {
      throw new AppError("Delete all modules first", 400);
    }

    await prisma.subject.delete({
      where: { id: subjectId }
    });

    res.status(200).json({ message: "Subject deleted" });
  } catch (error) {
    next(error);
  }
}
