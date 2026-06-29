import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

async function getOwnedTestOrRespond(
  req: Request,
  testId: string
): Promise<{
  id: string;
  title: string;
  totalMarks: number;
  rules: Array<{ qbId: string; marksPerQuestion: number }>;
}> {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    select: {
      id: true,
      teacherId: true,
      title: true,
      totalMarks: true,
      testQbRules: {
        select: {
          qbId: true,
          marksPerQuestion: true
        }
      }
    }
  });

  if (!test) {
    throw new AppError("Test not found", 404);
  }

  if (!req.user || test.teacherId !== req.user.id) {
    throw new AppError("Forbidden", 403);
  }

  return {
    id: test.id,
    title: test.title,
    totalMarks: test.totalMarks,
    rules: test.testQbRules
  };
}

async function fetchSubmittedResults(testId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      testId,
      attempt: {
        isSubmitted: true
      }
    },
    include: {
      student: {
        select: {
          name: true,
          email: true
        }
      },
      attempt: {
        select: {
          id: true,
          score: true,
          submittedAt: true
        }
      }
    }
  });

  return enrollments
    .map((enrollment) => ({
      studentName: enrollment.student.name,
      studentEmail: enrollment.student.email,
      score: enrollment.attempt?.score ?? 0,
      submittedAt: enrollment.attempt?.submittedAt,
      attemptId: enrollment.attempt?.id
    }))
    .filter(
      (item): item is {
        studentName: string;
        studentEmail: string;
        score: number;
        submittedAt: Date | null;
        attemptId: string;
      } => Boolean(item.attemptId)
    )
    .sort((a, b) => b.score - a.score);
}

async function fetchAllResults(testId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      testId,
      attempt: {
        isNot: null
      }
    },
    include: {
      student: {
        select: {
          name: true,
          email: true
        }
      },
      attempt: {
        select: {
          id: true,
          score: true,
          isSubmitted: true,
          submittedAt: true,
          isBlocked: true,
          activities: true
        }
      }
    }
  });

  return enrollments
    .map((enrollment) => ({
      studentName: enrollment.student.name,
      studentEmail: enrollment.student.email,
      score: enrollment.attempt?.score ?? null,
      isSubmitted: enrollment.attempt?.isSubmitted ?? false,
      submittedAt: enrollment.attempt?.submittedAt ?? null,
      attemptId: enrollment.attempt?.id,
      isBlocked: enrollment.attempt?.isBlocked ?? false,
      activities: enrollment.attempt?.activities ?? []
    }))
    .filter(
      (item): item is {
        studentName: string;
        studentEmail: string;
        score: number | null;
        isSubmitted: boolean;
        submittedAt: Date | null;
        attemptId: string;
        isBlocked: boolean;
        activities: any[];
      } => Boolean(item.attemptId)
    );
}

export async function getTestResults(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const testId = getParamAsString(req.params.testId);

    if (!testId) {
      throw new AppError("testId is required", 400);
    }

    const ownedTest = await getOwnedTestOrRespond(req, testId);

    const results = await fetchAllResults(testId);

    res.status(200).json(
      results.map((item) => ({
        ...item,
        totalMarks: ownedTest.totalMarks
      }))
    );
  } catch (error) {
    next(error);
  }
}

export async function getAttemptDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const testId = getParamAsString(req.params.testId);
    const attemptId = getParamAsString(req.params.attemptId);

    if (!testId || !attemptId) {
      throw new AppError("testId and attemptId are required", 400);
    }

    const ownedTest = await getOwnedTestOrRespond(req, testId);

    const attempt = await prisma.attempt.findFirst({
      where: {
        id: attemptId,
        enrollment: {
          testId: ownedTest.id
        }
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        questions: {
          include: {
            question: {
              select: {
                id: true,
                qbId: true,
                type: true,
                questionText: true,
                mcqOptions: {
                  select: {
                    id: true,
                    optionText: true,
                    scorePercent: true
                  }
                },
                acceptedAnswers: {
                  select: {
                    answerText: true
                  }
                }
              }
            },
            answer: {
              include: {
                selectedOptions: {
                  select: {
                    mcqOptionId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!attempt) {
      throw new AppError("Attempt not found", 404);
    }

    const marksByQbId = new Map(
      ownedTest.rules.map((rule) => [rule.qbId, rule.marksPerQuestion])
    );

    res.status(200).json({
      id: attempt.id,
      testId: ownedTest.id,
      testTitle: ownedTest.title,
      enrollmentId: attempt.enrollmentId,
      isSubmitted: attempt.isSubmitted,
      isBlocked: attempt.isBlocked ?? false,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      totalMarks: ownedTest.totalMarks,
      activities: attempt.activities || [],
      student: {
        id: attempt.enrollment.student.id,
        name: attempt.enrollment.student.name,
        email: attempt.enrollment.student.email
      },
      questions: attempt.questions.map((item) => {
        const maxMarks = marksByQbId.get(item.question.qbId) ?? null;

        let marksAwarded = null;
        if (item.answer) {
          if (item.answer.marksAwarded !== null) {
            marksAwarded = item.answer.marksAwarded;
          } else {
            // Fallback calculation for legacy records
            const maxMarksVal = maxMarks ?? 0;
            if (item.question.type === "TEXT") {
              const normalized = (item.answer.textAnswer ?? "").trim().toLowerCase();
              const accepted = new Set(item.question.acceptedAnswers.map(a => a.answerText.trim().toLowerCase()));
              marksAwarded = accepted.has(normalized) ? maxMarksVal : 0;
            } else {
              const selectedIds = item.answer.selectedOptions.map(o => o.mcqOptionId);
              const options = item.question.mcqOptions;
              const hasZero = selectedIds.some(id => {
                const opt = options.find(o => o.id === id);
                return !opt || opt.scorePercent === 0;
              });
              if (hasZero || selectedIds.length === 0) {
                marksAwarded = 0;
              } else {
                const totalPercent = selectedIds.reduce((sum, id) => {
                  const opt = options.find(o => o.id === id);
                  return sum + (opt?.scorePercent ?? 0);
                }, 0);
                marksAwarded = Math.floor((totalPercent / 100) * maxMarksVal);
              }
            }
          }
        }

        return {
          attemptQuestionId: item.id,
          question: {
            id: item.question.id,
            text: item.question.questionText,
            type: item.question.type,
            mcqOptions: item.question.mcqOptions.map((option) => ({
              id: option.id,
              optionText: option.optionText,
              isCorrect: option.scorePercent === 100
            })),
            acceptedAnswers: item.question.acceptedAnswers.map((answer) => answer.answerText)
          },
          studentAnswer: item.answer
            ? {
                textAnswer: item.answer.textAnswer,
                selectedOptionIds: item.answer.selectedOptions.map(
                  (selection) => selection.mcqOptionId
                )
              }
            : null,
          marksAwarded,
          maxMarks
        };
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function exportResultsCsv(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const testId = getParamAsString(req.params.testId);

    if (!testId) {
      throw new AppError("testId is required", 400);
    }

    const ownedTest = await getOwnedTestOrRespond(req, testId);

    const results = await fetchSubmittedResults(testId);

    const header = [
      "student_name",
      "student_email",
      "score",
      "total_marks",
      "percentage",
      "submitted_at"
    ];

    const rows = results.map((item) => {
      const percentage =
        ownedTest.totalMarks > 0
          ? ((item.score / ownedTest.totalMarks) * 100).toFixed(2)
          : "0.00";

      return [
        escapeCsv(item.studentName),
        escapeCsv(item.studentEmail),
        String(item.score),
        String(ownedTest.totalMarks),
        percentage,
        item.submittedAt ? item.submittedAt.toISOString() : ""
      ];
    });

    const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="results-${testId}.csv"`
    );

    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

export async function updateAttemptBlockStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }
    const testId = getParamAsString(req.params.testId);
    const attemptId = getParamAsString(req.params.attemptId);
    const { isBlocked } = req.body as { isBlocked: boolean };

    if (!testId || !attemptId || typeof isBlocked !== "boolean") {
      throw new AppError("testId, attemptId and isBlocked boolean are required", 400);
    }

    const ownedTest = await getOwnedTestOrRespond(req, testId);

    const attempt = await prisma.attempt.findFirst({
      where: {
        id: attemptId,
        enrollment: {
          testId: ownedTest.id
        }
      }
    });

    if (!attempt) {
      throw new AppError("Attempt not found", 404);
    }

    const updated = await prisma.attempt.update({
      where: { id: attemptId },
      data: { isBlocked }
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}