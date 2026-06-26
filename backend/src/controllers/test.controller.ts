import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function createTest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const { title, enrollmentKey, startTime, endTime, durationMinutes, qbRules } =
      req.body as {
        title: string;
        enrollmentKey?: string | null;
        startTime: Date;
        endTime: Date;
        durationMinutes: number;
        qbRules: Array<{
          qbId: string;
          questionsToPick: number;
          marksPerQuestion: number;
          randomQuestions?: boolean;
          randomOrder?: boolean;
          uniqueQuestions?: boolean;
          shuffleOptions?: boolean;
        }>;
      };

  const qbIds = Array.from(new Set(qbRules.map((rule) => rule.qbId)));

  const qbs = await prisma.questionBank.findMany({
    where: { id: { in: qbIds } },
    select: {
      id: true,
      name: true,
      module: {
        select: {
          subject: {
            select: {
              teacherId: true,
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

    if (qbs.length !== qbIds.length) {
      throw new AppError("One or more question banks do not exist", 400);
    }

  const qbById = new Map(qbs.map((qb) => [qb.id, qb]));

    for (const qbId of qbIds) {
      const qb = qbById.get(qbId);

      if (!qb || qb.module.subject.teacherId !== req.user.id) {
        throw new AppError("Forbidden", 403);
      }
    }

  const questionCountByQbId = new Map<string, number>();
  for (const qbId of qbIds) {
    const count = await prisma.question.count({
      where: {
        qbId,
        // MongoDB stores null as an absent field; isSet:false matches
        // not-deleted questions (deletedAt: null would match nothing).
        deletedAt: { isSet: false }
      }
    });
    questionCountByQbId.set(qbId, count);
  }

    for (const rule of qbRules) {
      const qb = qbById.get(rule.qbId);
      const questionCount = questionCountByQbId.get(rule.qbId) ?? 0;

      if (rule.questionsToPick > questionCount) {
        throw new AppError(
          `QB '${qb?.name ?? rule.qbId}' only has ${questionCount} questions, cannot pick ${rule.questionsToPick}`,
          400
        );
      }
    }

  const totalMarks = qbRules.reduce(
    (sum, rule) => sum + rule.questionsToPick * rule.marksPerQuestion,
    0
  );

    const createdTest = await prisma.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          teacherId: req.user!.id,
          title,
          enrollmentKey: enrollmentKey || null,
          startTime,
          endTime,
          durationMinutes,
          totalMarks
        }
      });

      await tx.testQbRule.createMany({
        data: qbRules.map((rule) => ({
          testId: test.id,
          qbId: rule.qbId,
          questionsToPick: rule.questionsToPick,
          marksPerQuestion: rule.marksPerQuestion,
          randomQuestions: rule.randomQuestions ?? true,
          randomOrder: rule.randomOrder ?? true,
          uniqueQuestions: rule.uniqueQuestions ?? false,
          shuffleOptions: rule.shuffleOptions ?? false
        }))
      });

      return tx.test.findUniqueOrThrow({
        where: { id: test.id },
        include: {
          testQbRules: true
        }
      });
    });

    res.status(201).json(createdTest);
  } catch (error) {
    next(error);
  }
}

export async function getTests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

  const tests = await prisma.test.findMany({
    where: { teacherId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          enrollments: true
        }
      }
    }
  });

    res.status(200).json(
      tests.map((test) => ({
        ...test,
        enrollmentCount: test._count.enrollments,
        _count: undefined
      }))
    );
  } catch (error) {
    next(error);
  }
}

export async function getTestById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

  const testId = getParamAsString(req.params.id);

    if (!testId) {
      throw new AppError("Test id is required", 400);
    }

  const test = await prisma.test.findFirst({
    where: {
      id: testId,
      teacherId: req.user.id
    },
    include: {
      testQbRules: {
        include: {
          questionBank: {
            select: {
              id: true,
              name: true,
              module: {
                select: {
                  id: true,
                  name: true,
                  subject: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              }
            }
          }
        }
      },
      _count: {
        select: {
          enrollments: true
        }
      }
    }
  });

    if (!test) {
      throw new AppError("Test not found", 404);
    }

    res.status(200).json({
      ...test,
      enrollmentCount: test._count.enrollments,
      _count: undefined
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

  const testId = getParamAsString(req.params.id);

    if (!testId) {
      throw new AppError("Test id is required", 400);
    }

  const test = await prisma.test.findFirst({
    where: {
      id: testId,
      teacherId: req.user.id
    },
    include: {
      _count: {
        select: {
          enrollments: true
        }
      }
    }
  });

    if (!test) {
      throw new AppError("Test not found", 404);
    }

    if (test.isLocked || test._count.enrollments > 0) {
      throw new AppError("Cannot delete a test with enrollments", 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.testQbRule.deleteMany({
        where: { testId }
      });

      await tx.test.delete({
        where: { id: testId }
      });
    });

    res.status(200).json({ message: "Test deleted" });
  } catch (error) {
    next(error);
  }
}
