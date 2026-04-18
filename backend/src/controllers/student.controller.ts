import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { scoreAttempt } from "../lib/scoring";
import {
  enrollSchema,
  saveAnswerSchema,
  submitAttemptSchema
} from "../validators/student.validators";

const prisma = new PrismaClient();

const beginTestSchema = z.object({
  enrollmentId: z.string().uuid()
});

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
    attemptQuestions: attempt.questions.map((item: any) => ({
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
            ? item.question.mcqOptions.map((option: any) => ({
                id: option.id,
                optionText: option.optionText
              }))
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
    }))
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

export async function getAvailableTests(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
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
}

export async function enrollInTest(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = enrollSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const { testId, enrollmentKey } = parsed.data;

  const test = await prisma.test.findUnique({
    where: { id: testId }
  });

  if (!test || test.enrollmentKey !== enrollmentKey) {
    res.status(400).json({ message: "Invalid enrollment key" });
    return;
  }

  if (nowDate() >= test.endTime) {
    res.status(400).json({ message: "Enrollment is closed, test has already ended" });
    return;
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
    res.status(400).json({ message: "Already enrolled" });
    return;
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
}

export async function beginTest(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = beginTestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const { enrollmentId } = parsed.data;

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
    res.status(404).json({ message: "Enrollment not found" });
    return;
  }

  const now = nowDate();

  if (now < enrollment.test.startTime) {
    res.status(400).json({ message: "Test has not started yet" });
    return;
  }

  if (now >= enrollment.test.endTime) {
    res.status(400).json({ message: "Test has ended" });
    return;
  }

  if (enrollment.attempt) {
    res.status(400).json({ message: "Attempt already started" });
    return;
  }

  const questionIdsToAssign: string[] = [];

  for (const rule of enrollment.test.testQbRules) {
    const questions = await prisma.question.findMany({
      where: {
        qbId: rule.qbId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (questions.length < rule.questionsToPick) {
      res.status(400).json({
        message: "Insufficient questions in one or more selected question banks"
      });
      return;
    }

    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, rule.questionsToPick);
    questionIdsToAssign.push(...picked.map((question) => question.id));
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
    res.status(404).json({ message: "Attempt not found" });
    return;
  }

  res.status(200).json(serializeAttempt(attempt, now));
}

export async function getAttempt(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const attemptId = req.params.attemptId;

  if (!attemptId) {
    res.status(400).json({ message: "attemptId is required" });
    return;
  }

  let attempt = await getOwnedAttempt(attemptId, req.user.id);

  if (!attempt) {
    res.status(404).json({ message: "Attempt not found" });
    return;
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
        res.status(404).json({ message: "Attempt not found" });
        return;
      }
    }
  }

  res.status(200).json(serializeAttempt(attempt, nowDate()));
}

export async function saveAnswer(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = saveAnswerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const { attemptId, attemptQuestionId, selectedOptionIds, textAnswer } = parsed.data;

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
    res.status(404).json({ message: "Attempt not found" });
    return;
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
    res.status(404).json({ message: "Attempt question not found" });
    return;
  }

  if (attempt.isSubmitted) {
    res.status(400).json({ message: "Attempt already submitted" });
    return;
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
    res.status(400).json({ message: "Time expired, test auto-submitted" });
    return;
  }

  const normalizedSelectedIds = Array.from(new Set(selectedOptionIds ?? []));

  if (attemptQuestion.question.type === "MCQ") {
    const allowedIds = new Set(attemptQuestion.question.mcqOptions.map((option) => option.id));

    if (normalizedSelectedIds.some((id) => !allowedIds.has(id))) {
      res.status(400).json({ message: "One or more selected options are invalid" });
      return;
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
}

export async function submitAttempt(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = submitAttemptSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const { attemptId } = parsed.data;

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
    res.status(404).json({ message: "Attempt not found" });
    return;
  }

  if (attempt.isSubmitted) {
    res.status(400).json({ message: "Attempt already submitted" });
    return;
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
}
