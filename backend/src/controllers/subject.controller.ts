import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import {
  createSubjectSchema,
  updateSubjectSchema
} from "../validators/subject.validators";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getSubjects(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
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
}

export async function createSubject(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = createSubjectSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const createdSubject = await prisma.subject.create({
    data: {
      teacherId: req.user.id,
      name: parsed.data.name,
      description: parsed.data.description
    }
  });

  res.status(201).json(createdSubject);
}

export async function updateSubject(req: Request, res: Response): Promise<void> {
  const subjectId = getParamAsString(req.params.id);

  if (!subjectId) {
    res.status(400).json({ message: "Subject id is required" });
    return;
  }

  const parsed = updateSubjectSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const updatedSubject = await prisma.subject.update({
    where: { id: subjectId },
    data: parsed.data
  });

  res.status(200).json(updatedSubject);
}

export async function deleteSubject(req: Request, res: Response): Promise<void> {
  const subjectId = getParamAsString(req.params.id);

  if (!subjectId) {
    res.status(400).json({ message: "Subject id is required" });
    return;
  }

  const moduleCount = await prisma.module.count({
    where: { subjectId }
  });

  if (moduleCount > 0) {
    res.status(400).json({ message: "Delete all modules first" });
    return;
  }

  await prisma.subject.delete({
    where: { id: subjectId }
  });

  res.status(200).json({ message: "Subject deleted" });
}
