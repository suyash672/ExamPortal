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

    const results = await fetchSubmittedResults(testId);

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
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      totalMarks: ownedTest.totalMarks,
      student: {
        id: attempt.enrollment.student.id,
        name: attempt.enrollment.student.name,
        email: attempt.enrollment.student.email
      },
      questions: attempt.questions.map((item) => ({
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
        marksAwarded: item.answer?.marksAwarded ?? null,
        maxMarks: marksByQbId.get(item.question.qbId) ?? null
      }))
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