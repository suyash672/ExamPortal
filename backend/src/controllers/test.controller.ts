import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { createTestSchema } from "../validators/test.validators";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function createTest(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = createTestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const { title, enrollmentKey, startTime, endTime, durationMinutes, qbRules } =
    parsed.data;

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
    res.status(400).json({ message: "One or more question banks do not exist" });
    return;
  }

  const qbById = new Map(qbs.map((qb) => [qb.id, qb]));

  for (const qbId of qbIds) {
    const qb = qbById.get(qbId);

    if (!qb || qb.module.subject.teacherId !== req.user.id) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
  }

  const groupedCounts = await prisma.question.groupBy({
    by: ["qbId"],
    where: {
      qbId: { in: qbIds },
      deletedAt: null
    },
    _count: {
      _all: true
    }
  });

  const questionCountByQbId = new Map(
    groupedCounts.map((entry) => [entry.qbId, entry._count._all])
  );

  for (const rule of qbRules) {
    const qb = qbById.get(rule.qbId);
    const questionCount = questionCountByQbId.get(rule.qbId) ?? 0;

    if (rule.questionsToPick > questionCount) {
      res.status(400).json({
        message: `QB '${qb?.name ?? rule.qbId}' only has ${questionCount} questions, cannot pick ${rule.questionsToPick}`
      });
      return;
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
        enrollmentKey,
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
        marksPerQuestion: rule.marksPerQuestion
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
}

export async function getTests(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
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
}

export async function getTestById(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const testId = getParamAsString(req.params.id);

  if (!testId) {
    res.status(400).json({ message: "Test id is required" });
    return;
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
    res.status(404).json({ message: "Test not found" });
    return;
  }

  res.status(200).json({
    ...test,
    enrollmentCount: test._count.enrollments,
    _count: undefined
  });
}

export async function deleteTest(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const testId = getParamAsString(req.params.id);

  if (!testId) {
    res.status(400).json({ message: "Test id is required" });
    return;
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
    res.status(404).json({ message: "Test not found" });
    return;
  }

  if (test.isLocked || test._count.enrollments > 0) {
    res.status(400).json({ message: "Cannot delete a test with enrollments" });
    return;
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
}
