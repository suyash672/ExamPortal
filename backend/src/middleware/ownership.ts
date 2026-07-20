import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

const prisma = new PrismaClient();

function getParamValue(req: Request, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = req.params[key] ?? req.body?.[key];
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

export async function requireSubjectOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const subjectId = getParamValue(req, ["subjectId", "id"]);

  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!subjectId) {
    res.status(400).json({ message: "subjectId is required" });
    return;
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { teacherId: true }
  });

  if (!subject || subject.teacherId !== req.user.id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  next();
}

export async function requireModuleOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const moduleId = getParamValue(req, ["moduleId", "id"]);

  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!moduleId) {
    res.status(400).json({ message: "Module id is required" });
    return;
  }

  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    select: {
      subject: {
        select: {
          teacherId: true
        }
      }
    }
  });

  if (!module || module.subject.teacherId !== req.user.id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  next();
}

export async function requireQbOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const qbId = getParamValue(req, ["qbId", "id"]);

  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!qbId) {
    res.status(400).json({ message: "Question bank id is required" });
    return;
  }

  let qb = null;
  if (qbId.match(/^[a-fA-F0-9]{24}$/)) {
    qb = await prisma.questionBank.findUnique({
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
  } else {
    qb = await prisma.questionBank.findFirst({
      where: { name: qbId },
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
  }

  if (!qb || qb.module.subject.teacherId !== req.user.id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  next();
}

export async function requireQuestionOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const questionId = getParamValue(req, ["id"]);

  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!questionId) {
    res.status(400).json({ message: "Question id is required" });
    return;
  }

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

  if (!question || question.questionBank.module.subject.teacherId !== req.user.id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  next();
}
