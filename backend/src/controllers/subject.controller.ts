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

    // Find all modules under the subject
    const modules = await prisma.module.findMany({
      where: { subjectId },
      select: { id: true }
    });
    const moduleIds = modules.map((m) => m.id);

    // Find all question banks under those modules
    const qbs = await prisma.questionBank.findMany({
      where: { moduleId: { in: moduleIds } },
      select: { id: true, name: true }
    });
    const qbIds = qbs.map((q) => q.id);

    // Programmatic cascading delete inside a transaction
    await prisma.$transaction(
      async (tx) => {
        // 1. Find all questions in these question banks
        const questions = await tx.question.findMany({
          where: { qbId: { in: qbIds } },
          select: { id: true }
        });
        const questionIds = questions.map((q) => q.id);

        // 2. Find MCQ options associated with those questions
        const mcqOptions = await tx.mcqOption.findMany({
          where: { questionId: { in: questionIds } },
          select: { id: true }
        });
        const mcqOptionIds = mcqOptions.map((o) => o.id);

        // 3. Find AttemptQuestions referencing those questions
        const attemptQuestions = await tx.attemptQuestion.findMany({
          where: { questionId: { in: questionIds } },
          select: { id: true }
        });
        const aqIds = attemptQuestions.map((aq) => aq.id);

        // 4. Delete AttemptAnswerOptions linked to the MCQ options
        if (mcqOptionIds.length > 0) {
          await tx.attemptAnswerOption.deleteMany({
            where: { mcqOptionId: { in: mcqOptionIds } }
          });
        }

        // 5. Delete AttemptAnswers linked to the AttemptQuestions
        if (aqIds.length > 0) {
          await tx.attemptAnswer.deleteMany({
            where: { attemptQuestionId: { in: aqIds } }
          });
        }

        // 6. Delete AttemptQuestions themselves
        if (aqIds.length > 0) {
          await tx.attemptQuestion.deleteMany({
            where: { id: { in: aqIds } }
          });
        }

        // 7. Delete TestQbRules referencing the question banks
        if (qbIds.length > 0) {
          await tx.testQbRule.deleteMany({
            where: { qbId: { in: qbIds } }
          });
        }

        // 8. Delete MCQ options and text accepted answers of the questions
        if (questionIds.length > 0) {
          await tx.mcqOption.deleteMany({
            where: { questionId: { in: questionIds } }
          });
          await tx.textAcceptedAnswer.deleteMany({
            where: { questionId: { in: questionIds } }
          });
        }

        // 9. Delete questions
        if (qbIds.length > 0) {
          await tx.question.deleteMany({
            where: { qbId: { in: qbIds } }
          });
        }

        // 10. Delete question banks
        if (moduleIds.length > 0) {
          await tx.questionBank.deleteMany({
            where: { moduleId: { in: moduleIds } }
          });
        }

        // 11. Delete modules
        await tx.module.deleteMany({
          where: { subjectId }
        });

        // 12. Delete the subject itself
        await tx.subject.delete({
          where: { id: subjectId }
        });
      },
      {
        timeout: 60000
      }
    );

    res.status(200).json({ message: "Subject deleted" });
  } catch (error) {
    next(error);
  }
}
