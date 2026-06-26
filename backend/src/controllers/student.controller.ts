import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";
import { scoreAttempt } from "../lib/scoring";
import {
  beginTestSchema,
  enrollSchema,
  saveAnswerSchema,
  submitAttemptSchema
} from "../validators/student.validators";

const prisma = new PrismaClient();

function stableShuffle<T>(array: T[], seed: string, getId: (item: T) => string): T[] {
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  };

  return [...array].sort((a, b) => {
    const hashA = hashCode(seed + "_" + getId(a));
    const hashB = hashCode(seed + "_" + getId(b));
    return hashA - hashB;
  });
}

function nowDate(): Date {
  return new Date();
}

function getAttemptDeadline(testEndTime: Date, startedAt: Date, durationMinutes: number): Date {
  const durationDeadline = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
  return durationDeadline < testEndTime ? durationDeadline : testEndTime;
}

function calculateTimeRemainingSeconds(
  now: Date,
  testEndTime: Date,
  startedAt: Date,
  durationMinutes: number
): number {
  const deadline = getAttemptDeadline(testEndTime, startedAt, durationMinutes);
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.max(0, Math.floor(remainingMs / 1000));
}

function serializeAttempt(attempt: any, now: Date) {
  const timeRemainingSeconds = attempt.isSubmitted
    ? 0
    : calculateTimeRemainingSeconds(
        now,
        attempt.enrollment.test.endTime,
        attempt.startedAt,
        attempt.enrollment.test.durationMinutes
      );

  const rules = attempt.enrollment?.test?.testQbRules ?? [];

  return {
    id: attempt.id,
    enrollmentId: attempt.enrollmentId,
    testTitle: attempt.enrollment.test.title,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    isSubmitted: attempt.isSubmitted,
    score: attempt.score,
    totalMarks: attempt.enrollment.test.totalMarks,
    timeRemainingSeconds,
    attemptQuestions: attempt.questions.map((item: any) => {
      const rule = rules.find((r: any) => r.qbId === item.question.qbId);
      const shuffleOptions = rule?.shuffleOptions ?? false;

      return {
        id: item.id,
        attemptId: item.attemptId,
        questionId: item.questionId,
        question: {
          id: item.question.id,
          type: item.question.type,
          questionText: item.question.questionText,
          qbId: item.question.qbId,
          mcqMode:
            item.question.type === "MCQ" &&
            item.question.mcqOptions.filter((option: any) => option.scorePercent === 100)
              .length === 1
              ? "single"
              : "multi",
          mcqOptions:
            item.question.type === "MCQ"
              ? (() => {
                  const opts = item.question.mcqOptions.map((option: any) => ({
                    id: option.id,
                    optionText: option.optionText
                  }));
                  if (shuffleOptions) {
                    return stableShuffle(opts, attempt.id, (opt: any) => opt.id);
                  }
                  return opts;
                })()
              : []
        },
        answer: item.answer
        ? {
            id: item.answer.id,
            textAnswer: item.answer.textAnswer,
            selectedOptionIds: item.answer.selectedOptions.map(
              (selection: any) => selection.mcqOptionId
            )
          }
        : null
      };
    })
  };
}

async function getOwnedAttempt(attemptId: string, studentId: string) {
  return prisma.attempt.findFirst({
    where: {
      id: attemptId,
      enrollment: {
        studentId
      }
    },
    include: {
      enrollment: {
        include: {
          test: true
        }
      },
      questions: {
        include: {
          question: {
            include: {
              mcqOptions: true
            }
          },
          answer: {
            include: {
              selectedOptions: true
            }
          }
        }
      }
    }
  });
}

async function autoSubmitAttempt(attemptId: string): Promise<number> {
  const result = await scoreAttempt(attemptId);

  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      isSubmitted: true,
      submittedAt: nowDate(),
      score: result
    }
  });

  return result;
}

export async function getAvailableTests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

  const now = nowDate();

  const tests = await prisma.test.findMany({
    where: {
      endTime: { gt: now }
    },
    include: {
      enrollments: {
        where: { studentId: req.user.id },
        include: {
          attempt: {
            select: {
              id: true,
              isSubmitted: true,
              score: true,
              startedAt: true,
              submittedAt: true
            }
          }
        }
      }
    },
    orderBy: { startTime: "asc" }
  });

  const result = [] as Array<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    totalMarks: number;
    enrolled: boolean;
    enrollmentId: string | null;
    hasEnrollmentKey: boolean;
    attempt: {
      id: string;
      isSubmitted: boolean;
      score: number | null;
      startedAt: Date;
      submittedAt: Date | null;
      timeRemainingSeconds: number;
    } | null;
  }>;

  for (const test of tests) {
    const enrollment = test.enrollments[0] ?? null;
    let attempt = enrollment?.attempt ?? null;

    if (attempt && !attempt.isSubmitted) {
      const timeRemainingSeconds = calculateTimeRemainingSeconds(
        now,
        test.endTime,
        attempt.startedAt,
        test.durationMinutes
      );

      if (timeRemainingSeconds <= 0) {
        const score = await autoSubmitAttempt(attempt.id);
        attempt = {
          ...attempt,
          isSubmitted: true,
          score,
          submittedAt: now
        };
      }
    }

    result.push({
      id: test.id,
      title: test.title,
      startTime: test.startTime,
      endTime: test.endTime,
      durationMinutes: test.durationMinutes,
      totalMarks: test.totalMarks,
      enrolled: Boolean(enrollment),
      enrollmentId: enrollment?.id ?? null,
      hasEnrollmentKey: Boolean(test.enrollmentKey && test.enrollmentKey.trim() !== ""),
      attempt: attempt
        ? {
            id: attempt.id,
            isSubmitted: attempt.isSubmitted,
            score: attempt.score,
            startedAt: attempt.startedAt,
            submittedAt: attempt.submittedAt,
            timeRemainingSeconds: attempt.isSubmitted
              ? 0
              : calculateTimeRemainingSeconds(
                  now,
                  test.endTime,
                  attempt.startedAt,
                  test.durationMinutes
                )
          }
        : null
    });
  }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function enrollInTest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const { testId, enrollmentKey } = req.body as ReturnType<typeof enrollSchema.parse>;

    const test = await prisma.test.findUnique({
      where: { id: testId }
    });

    if (!test) {
      throw new AppError("Test not found", 404);
    }

    const hasKey = test.enrollmentKey && test.enrollmentKey.trim() !== "";
    if (hasKey && test.enrollmentKey !== enrollmentKey) {
      throw new AppError("Invalid enrollment key", 400);
    }

    const now = nowDate();

    // Enrollment stays open for the whole active window. A student may still
    // join after the test has started (they simply get less time); enrollment
    // only closes once the test has ended.
    if (now >= test.endTime) {
      throw new AppError("Enrollment is closed, test has already ended", 400);
    }

  const existing = await prisma.enrollment.findUnique({
    where: {
      studentId_testId: {
        studentId: req.user.id,
        testId
      }
    }
  });

    if (existing) {
      throw new AppError("Already enrolled", 400);
    }

    const enrollment = await prisma.$transaction(async (tx) => {
      await tx.test.update({
        where: { id: testId },
        data: { isLocked: true }
      });

      return tx.enrollment.create({
        data: {
          studentId: req.user!.id,
          testId
        }
      });
    });

    res.status(201).json(enrollment);
  } catch (error) {
    next(error);
  }
}

export async function beginTest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const { enrollmentId } = req.body as ReturnType<typeof beginTestSchema.parse>;

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      studentId: req.user.id
    },
    include: {
      test: {
        include: {
          testQbRules: true
        }
      },
      attempt: true
    }
  });

    if (!enrollment) {
      throw new AppError("Enrollment not found", 404);
    }

  const now = nowDate();

    if (now < enrollment.test.startTime) {
      throw new AppError("Test has not started yet", 400);
    }

    if (now >= enrollment.test.endTime) {
      throw new AppError("Test has ended", 400);
    }

    if (enrollment.attempt) {
      throw new AppError("Attempt already started", 400);
    }

  const questionIdsToAssign: string[] = [];

    for (const rule of enrollment.test.testQbRules) {
      const questions = await prisma.question.findMany({
        where: {
          qbId: rule.qbId,
          deletedAt: { isSet: false }
        },
        select: {
          id: true
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      if (questions.length < rule.questionsToPick) {
        throw new AppError(
          "Insufficient questions in one or more selected question banks",
          400
        );
      }

      let availableQuestions = questions;
      if (rule.uniqueQuestions) {
        const assignedQuestions = await prisma.attemptQuestion.findMany({
          where: {
            attempt: {
              enrollment: {
                testId: enrollment.testId
              }
            },
            question: {
              qbId: rule.qbId
            }
          },
          select: {
            questionId: true
          }
        });
        const assignedIds = new Set(assignedQuestions.map((aq) => aq.questionId));
        const unassigned = questions.filter((q) => !assignedIds.has(q.id));

        if (unassigned.length >= rule.questionsToPick) {
          availableQuestions = unassigned;
        }
      }

      let picked: Array<{ id: string }> = [];
      if (rule.randomQuestions) {
        const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
        picked = shuffled.slice(0, rule.questionsToPick);
      } else {
        picked = availableQuestions.slice(0, rule.questionsToPick);
      }

      let assigned: Array<{ id: string }> = [];
      if (rule.randomOrder) {
        assigned = [...picked].sort(() => Math.random() - 0.5);
      } else {
        const indexMap = new Map(questions.map((q, idx) => [q.id, idx]));
        assigned = [...picked].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0));
      }

      questionIdsToAssign.push(...assigned.map((question) => question.id));
    }

  const createdAttempt = await prisma.$transaction(async (tx) => {
    const createdAttempt = await tx.attempt.create({
      data: {
        enrollmentId: enrollment.id,
        startedAt: now
      }
    });

    await tx.attemptQuestion.createMany({
      data: questionIdsToAssign.map((questionId) => ({
        attemptId: createdAttempt.id,
        questionId
      }))
    });

    return { id: createdAttempt.id };
  });

    const attempt = await getOwnedAttempt(createdAttempt.id, req.user.id);

    if (!attempt) {
      throw new AppError("Attempt not found", 404);
    }

    res.status(200).json(serializeAttempt(attempt, now));
  } catch (error) {
    next(error);
  }
}

export async function getAttempt(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

  const rawAttemptId = req.params.attemptId;
  const attemptId = Array.isArray(rawAttemptId) ? rawAttemptId[0] : rawAttemptId;

    if (!attemptId) {
      throw new AppError("attemptId is required", 400);
    }

  let attempt = await getOwnedAttempt(attemptId, req.user.id);

    if (!attempt) {
      throw new AppError("Attempt not found", 404);
    }

  if (!attempt.isSubmitted) {
    const now = nowDate();
    const timeRemainingSeconds = calculateTimeRemainingSeconds(
      now,
      attempt.enrollment.test.endTime,
      attempt.startedAt,
      attempt.enrollment.test.durationMinutes
    );

    if (timeRemainingSeconds <= 0) {
      await autoSubmitAttempt(attempt.id);
      attempt = await getOwnedAttempt(attempt.id, req.user.id);

      if (!attempt) {
        throw new AppError("Attempt not found", 404);
      }
    }
  }

    res.status(200).json(serializeAttempt(attempt, nowDate()));
  } catch (error) {
    next(error);
  }
}

export async function saveAnswer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const { attemptId, attemptQuestionId, selectedOptionIds, textAnswer } =
      req.body as ReturnType<typeof saveAnswerSchema.parse>;

  const attempt = await prisma.attempt.findFirst({
    where: {
      id: attemptId,
      enrollment: {
        studentId: req.user.id
      }
    },
    include: {
      enrollment: {
        include: {
          test: true
        }
      }
    }
  });

    if (!attempt) {
      throw new AppError("Attempt not found", 404);
    }

  const attemptQuestion = await prisma.attemptQuestion.findFirst({
    where: {
      id: attemptQuestionId,
      attemptId: attempt.id
    },
    include: {
      question: {
        include: {
          mcqOptions: {
            select: {
              id: true
            }
          }
        }
      }
    }
  });

    if (!attemptQuestion) {
      throw new AppError("Attempt question not found", 404);
    }

    if (attempt.isSubmitted) {
      throw new AppError("Attempt already submitted", 400);
    }

  const now = nowDate();
  const timeRemainingSeconds = calculateTimeRemainingSeconds(
    now,
    attempt.enrollment.test.endTime,
    attempt.startedAt,
    attempt.enrollment.test.durationMinutes
  );

    if (timeRemainingSeconds <= 0) {
      await autoSubmitAttempt(attempt.id);
      throw new AppError("Time expired, test auto-submitted", 400);
    }

  const normalizedSelectedIds = Array.from(new Set(selectedOptionIds ?? []));

    if (attemptQuestion.question.type === "MCQ") {
      const allowedIds = new Set(attemptQuestion.question.mcqOptions.map((option) => option.id));

      if (normalizedSelectedIds.some((id) => !allowedIds.has(id))) {
        throw new AppError("One or more selected options are invalid", 400);
      }
    }

  const answerRecord = await prisma.attemptAnswer.upsert({
    where: { attemptQuestionId: attemptQuestion.id },
    create: {
      attemptQuestionId: attemptQuestion.id,
      textAnswer: attemptQuestion.question.type === "TEXT" ? textAnswer ?? null : null
    },
    update: {
      textAnswer: attemptQuestion.question.type === "TEXT" ? textAnswer ?? null : null
    }
  });

  if (attemptQuestion.question.type === "MCQ") {
    await prisma.attemptAnswerOption.deleteMany({
      where: {
        attemptAnswerId: answerRecord.id
      }
    });

    if (normalizedSelectedIds.length > 0) {
      await prisma.attemptAnswerOption.createMany({
        data: normalizedSelectedIds.map((mcqOptionId) => ({
          attemptAnswerId: answerRecord.id,
          mcqOptionId
        }))
      });
    }
  } else {
    await prisma.attemptAnswerOption.deleteMany({
      where: {
        attemptAnswerId: answerRecord.id
      }
    });
  }

    res.status(200).json({ message: "Answer saved" });
  } catch (error) {
    next(error);
  }
}

export async function submitAttempt(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const { attemptId } = req.body as ReturnType<typeof submitAttemptSchema.parse>;

  const attempt = await prisma.attempt.findFirst({
    where: {
      id: attemptId,
      enrollment: {
        studentId: req.user.id
      }
    },
    include: {
      enrollment: {
        include: {
          test: true
        }
      }
    }
  });

    if (!attempt) {
      throw new AppError("Attempt not found", 404);
    }

    if (attempt.isSubmitted) {
      throw new AppError("Attempt already submitted", 400);
    }

    const result = await scoreAttempt(attempt.id);

    await prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        isSubmitted: true,
        submittedAt: nowDate(),
        score: result
      }
    });

    res.status(200).json({
      score: result,
      totalMarks: attempt.enrollment.test.totalMarks
    });
  } catch (error) {
    next(error);
  }
}
