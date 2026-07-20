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

    const {
      title,
      enrollmentKey,
      startTime,
      endTime,
      durationMinutes,
      qbRules,
      isLocked,
      useFullscreen,
      logActivities,
      preventCopyPaste,
      saveAttempts,
      infiniteTries,
      resultsReveal
    } = req.body as {
      title: string;
      enrollmentKey?: string | null;
      startTime: Date;
      endTime: Date;
      durationMinutes: number;
      isLocked?: boolean;
      useFullscreen?: boolean;
      logActivities?: boolean;
      preventCopyPaste?: boolean;
      saveAttempts?: boolean;
      infiniteTries?: boolean;
      resultsReveal?: boolean;
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
          totalMarks,
          isLocked: isLocked ?? false,
          useFullscreen: useFullscreen ?? false,
          logActivities: logActivities ?? false,
          preventCopyPaste: preventCopyPaste ?? false,
          saveAttempts: saveAttempts ?? true,
          infiniteTries: infiniteTries ?? false,
          resultsReveal: resultsReveal ?? true
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

export async function releaseTestResults(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const testId = getParamAsString(req.params.id || req.params.testId);

    if (!testId) {
      throw new AppError("Test id is required", 400);
    }

    const test = await prisma.test.findUnique({
      where: { id: testId }
    });

    if (!test) {
      throw new AppError("Test not found", 404);
    }

    if (test.teacherId !== req.user.id) {
      throw new AppError("Forbidden", 403);
    }

    const updated = await prisma.test.update({
      where: { id: testId },
      data: { resultsReveal: true }
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function getTestStatistics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401);
    const rawId = req.params.id || req.params.testId;
    const testId = Array.isArray(rawId) ? rawId[0] : (rawId || "");
    if (!testId) throw new AppError("Test ID is required", 400);

    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        testQbRules: {
          include: {
            questionBank: {
              include: {
                module: {
                  include: {
                    subject: true
                  }
                }
              }
            }
          }
        },
        enrollments: {
          include: {
            attempts: {
              include: {
                questions: {
                  include: {
                    question: true,
                    answer: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!test) throw new AppError("Test not found", 404);
    if (test.teacherId !== req.user.id) throw new AppError("Forbidden", 403);

    const totalEnrollments = test.enrollments.length;

    let attemptedCount = 0;
    let attemptingCount = 0;
    const scores: number[] = [];

    const ruleByQbId = new Map<string, typeof test.testQbRules[0]>();
    for (const rule of test.testQbRules) {
      ruleByQbId.set(rule.qbId, rule);
    }

    const bankAccumulator = new Map<string, {
      qbId: string;
      qbName: string;
      difficulty: string;
      moduleName: string;
      questionsPicked: number;
      marksPerQuestion: number;
      totalMarks: number;
      earnedMarksSum: number;
    }>();

    const moduleAccumulator = new Map<string, {
      moduleId: string;
      moduleName: string;
      subjectName: string;
      questionsPicked: number;
      totalMarks: number;
      earnedMarksSum: number;
    }>();

    for (const rule of test.testQbRules) {
      const qb = rule.questionBank;
      const mod = qb.module;
      const qbMaxMarks = rule.questionsToPick * rule.marksPerQuestion;

      if (!bankAccumulator.has(qb.id)) {
        bankAccumulator.set(qb.id, {
          qbId: qb.id,
          qbName: qb.name,
          difficulty: qb.type || "easy",
          moduleName: mod.name,
          questionsPicked: rule.questionsToPick,
          marksPerQuestion: rule.marksPerQuestion,
          totalMarks: qbMaxMarks,
          earnedMarksSum: 0
        });
      }

      if (!moduleAccumulator.has(mod.id)) {
        moduleAccumulator.set(mod.id, {
          moduleId: mod.id,
          moduleName: mod.name,
          subjectName: mod.subject.name,
          questionsPicked: rule.questionsToPick,
          totalMarks: qbMaxMarks,
          earnedMarksSum: 0
        });
      } else {
        const existing = moduleAccumulator.get(mod.id)!;
        existing.questionsPicked += rule.questionsToPick;
        existing.totalMarks += qbMaxMarks;
      }
    }

    let submittedAttemptsCount = 0;

    for (const enr of test.enrollments) {
      if (enr.attempts.length === 0) continue;

      const hasSubmitted = enr.attempts.some((a) => a.isSubmitted);
      if (hasSubmitted) {
        attemptedCount++;
        const submittedAttempts = enr.attempts.filter((a) => a.isSubmitted);
        for (const att of submittedAttempts) {
          submittedAttemptsCount++;
          if (typeof att.score === "number") {
            scores.push(att.score);
          }

          for (const attQ of att.questions) {
            const qbId = attQ.question.qbId;
            const earnedMarks = attQ.answer?.marksAwarded ?? 0;

            if (bankAccumulator.has(qbId)) {
              const bAcc = bankAccumulator.get(qbId)!;
              bAcc.earnedMarksSum += earnedMarks;
            }

            const qb = test.testQbRules.find((r) => r.qbId === qbId)?.questionBank;
            if (qb && moduleAccumulator.has(qb.moduleId)) {
              const mAcc = moduleAccumulator.get(qb.moduleId)!;
              mAcc.earnedMarksSum += earnedMarks;
            }
          }
        }
      } else {
        attemptingCount++;
      }
    }

    const notAttemptedCount = Math.max(0, totalEnrollments - attemptedCount - attemptingCount);
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const avgSum = scores.reduce((sum, val) => sum + val, 0);
    const averageScore = scores.length > 0 ? Math.round((avgSum / scores.length) * 10) / 10 : 0;

    const moduleStats = Array.from(moduleAccumulator.values()).map((m) => {
      const avgMarks = submittedAttemptsCount > 0 ? Math.round((m.earnedMarksSum / submittedAttemptsCount) * 10) / 10 : 0;
      const accuracyPercent = m.totalMarks > 0 ? Math.round((avgMarks / m.totalMarks) * 100) : 0;
      return {
        moduleId: m.moduleId,
        moduleName: m.moduleName,
        subjectName: m.subjectName,
        questionsPicked: m.questionsPicked,
        totalMarks: m.totalMarks,
        averageScore: avgMarks,
        accuracyPercent
      };
    });

    const bankStats = Array.from(bankAccumulator.values()).map((b) => {
      const avgMarks = submittedAttemptsCount > 0 ? Math.round((b.earnedMarksSum / submittedAttemptsCount) * 10) / 10 : 0;
      const accuracyPercent = b.totalMarks > 0 ? Math.round((avgMarks / b.totalMarks) * 100) : 0;
      return {
        qbId: b.qbId,
        qbName: b.qbName,
        difficulty: b.difficulty,
        moduleName: b.moduleName,
        questionsPicked: b.questionsPicked,
        marksPerQuestion: b.marksPerQuestion,
        totalMarks: b.totalMarks,
        averageScore: avgMarks,
        accuracyPercent
      };
    });

    res.status(200).json({
      totalEnrollments,
      attemptedCount,
      attemptingCount,
      notAttemptedCount,
      averageScore,
      highestScore,
      lowestScore,
      totalMarks: test.totalMarks,
      moduleStats,
      bankStats
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTestSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401);
    const rawId = req.params.id || req.params.testId;
    const testId = Array.isArray(rawId) ? rawId[0] : (rawId || "");
    if (!testId) throw new AppError("Test ID is required", 400);

    const test = await prisma.test.findUnique({ where: { id: testId } });
    if (!test) throw new AppError("Test not found", 404);
    if (test.teacherId !== req.user.id) throw new AppError("Forbidden", 403);

    const {
      title,
      enrollmentKey,
      startTime,
      endTime,
      durationMinutes,
      isLocked,
      useFullscreen,
      logActivities,
      preventCopyPaste,
      saveAttempts,
      infiniteTries,
      resultsReveal
    } = req.body;

    const updated = await prisma.test.update({
      where: { id: testId },
      data: {
        ...(title !== undefined && { title }),
        ...(enrollmentKey !== undefined && { enrollmentKey: enrollmentKey || null }),
        ...(startTime !== undefined && { startTime: new Date(startTime) }),
        ...(endTime !== undefined && { endTime: new Date(endTime) }),
        ...(durationMinutes !== undefined && { durationMinutes: Number(durationMinutes) }),
        ...(isLocked !== undefined && { isLocked: Boolean(isLocked) }),
        ...(useFullscreen !== undefined && { useFullscreen: Boolean(useFullscreen) }),
        ...(logActivities !== undefined && { logActivities: Boolean(logActivities) }),
        ...(preventCopyPaste !== undefined && { preventCopyPaste: Boolean(preventCopyPaste) }),
        ...(saveAttempts !== undefined && { saveAttempts: Boolean(saveAttempts) }),
        ...(infiniteTries !== undefined && { infiniteTries: Boolean(infiniteTries) }),
        ...(resultsReveal !== undefined && { resultsReveal: Boolean(resultsReveal) })
      }
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}
