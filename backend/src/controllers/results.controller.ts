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
      attempts: {
        some: {
          isSubmitted: true
        }
      }
    },
    include: {
      student: {
        select: {
          name: true,
          email: true
        }
      },
      attempts: {
        where: {
          isSubmitted: true
        },
        select: {
          id: true,
          score: true,
          submittedAt: true
        }
      }
    }
  });

  const results: Array<{
    studentName: string;
    studentEmail: string;
    score: number;
    submittedAt: Date | null;
    attemptId: string;
  }> = [];

  for (const enrollment of enrollments) {
    for (const attempt of enrollment.attempts) {
      results.push({
        studentName: enrollment.student.name,
        studentEmail: enrollment.student.email,
        score: attempt.score ?? 0,
        submittedAt: attempt.submittedAt,
        attemptId: attempt.id
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

async function fetchAllResults(testId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      testId,
      attempts: {
        some: {}
      }
    },
    include: {
      student: {
        select: {
          name: true,
          email: true
        }
      },
      attempts: {
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

  const results: Array<{
    studentName: string;
    studentEmail: string;
    score: number | null;
    isSubmitted: boolean;
    submittedAt: Date | null;
    attemptId: string;
    isBlocked: boolean;
    activities: any[];
  }> = [];

  for (const enrollment of enrollments) {
    for (const attempt of enrollment.attempts) {
      results.push({
        studentName: enrollment.student.name,
        studentEmail: enrollment.student.email,
        score: attempt.score,
        isSubmitted: attempt.isSubmitted,
        submittedAt: attempt.submittedAt,
        attemptId: attempt.id,
        isBlocked: attempt.isBlocked ?? false,
        activities: attempt.activities || []
      });
    }
  }

  return results;
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

export async function calculateScoreCard(attemptId: string, studentId: string, testId: string) {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      testQbRules: {
        include: {
          questionBank: {
            include: {
              module: true
            }
          }
        }
      }
    }
  });

  if (!test) return [];

  const subjectId = test.testQbRules[0]?.questionBank?.module?.subjectId;
  const marksByQbId = new Map(test.testQbRules.map(r => [r.qbId, r.marksPerQuestion]));

  const currentAttempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      questions: {
        include: {
          question: {
            include: {
              questionBank: {
                include: {
                  module: true
                }
              }
            }
          },
          answer: true
        }
      }
    }
  });

  if (!currentAttempt) return [];

  const currentMap = new Map<string, { scored: number; max: number; moduleName: string; type: string }>();

  for (const item of currentAttempt.questions) {
    const qb = item.question.questionBank;
    if (!qb) continue;
    const key = `${qb.module.name}-${qb.type}`;
    const maxMarks = marksByQbId.get(item.question.qbId) ?? 0;
    const scored = item.answer?.marksAwarded ?? 0;

    const existing = currentMap.get(key) || { scored: 0, max: 0, moduleName: qb.module.name, type: qb.type };
    currentMap.set(key, {
      scored: existing.scored + scored,
      max: existing.max + maxMarks,
      moduleName: existing.moduleName,
      type: existing.type
    });
  }

  const testAttempts = await prisma.attempt.findMany({
    where: {
      enrollment: { testId },
      isSubmitted: true
    },
    include: {
      questions: {
        include: {
          question: true,
          answer: true
        }
      }
    }
  });

  const classSums = new Map<string, { sumPercent: number; count: number }>();
  for (const att of testAttempts) {
    const attScores = new Map<string, { scored: number; max: number }>();
    for (const item of att.questions) {
      const qbRule = test.testQbRules.find(r => r.qbId === item.question.qbId);
      if (!qbRule) continue;
      const qb = qbRule.questionBank;
      const key = `${qb.module.name}-${qb.type}`;
      const maxMarks = marksByQbId.get(item.question.qbId) ?? 0;
      const scored = item.answer?.marksAwarded ?? 0;

      const val = attScores.get(key) || { scored: 0, max: 0 };
      attScores.set(key, { scored: val.scored + scored, max: val.max + maxMarks });
    }

    for (const [key, val] of attScores.entries()) {
      if (val.max > 0) {
        const pct = (val.scored / val.max) * 100;
        const sums = classSums.get(key) || { sumPercent: 0, count: 0 };
        classSums.set(key, { sumPercent: sums.sumPercent + pct, count: sums.count + 1 });
      }
    }
  }

  const historicalSums = new Map<string, { sumPercent: number; count: number }>();
  if (subjectId) {
    const historicalAttempts = await prisma.attempt.findMany({
      where: {
        enrollment: {
          studentId,
          test: {
            testQbRules: {
              some: {
                questionBank: {
                  module: { subjectId }
                }
              }
            }
          }
        },
        isSubmitted: true
      },
      include: {
        questions: {
          include: {
            question: {
              include: {
                questionBank: {
                  include: {
                    module: true
                  }
                }
              }
            },
            answer: true
          }
        },
        enrollment: {
          include: {
            test: {
              include: {
                testQbRules: true
              }
            }
          }
        }
      }
    });

    for (const att of historicalAttempts) {
      const histMarksByQbId = new Map(att.enrollment.test.testQbRules.map(r => [r.qbId, r.marksPerQuestion]));
      const attScores = new Map<string, { scored: number; max: number }>();

      for (const item of att.questions) {
        const qb = item.question.questionBank;
        if (!qb) continue;
        const key = `${qb.module.name}-${qb.type}`;
        const maxMarks = histMarksByQbId.get(item.question.qbId) ?? 0;
        const scored = item.answer?.marksAwarded ?? 0;

        const val = attScores.get(key) || { scored: 0, max: 0 };
        attScores.set(key, { scored: val.scored + scored, max: val.max + maxMarks });
      }

      for (const [key, val] of attScores.entries()) {
        if (val.max > 0) {
          const pct = (val.scored / val.max) * 100;
          const sums = historicalSums.get(key) || { sumPercent: 0, count: 0 };
          historicalSums.set(key, { sumPercent: sums.sumPercent + pct, count: sums.count + 1 });
        }
      }
    }
  }

  const sections: any[] = [];
  for (const [key, currentVal] of currentMap.entries()) {
    const classAvgVal = classSums.get(key);
    const histAvgVal = historicalSums.get(key);

    sections.push({
      moduleName: currentVal.moduleName,
      type: currentVal.type,
      studentScore: currentVal.scored,
      maxMarks: currentVal.max,
      classAvg: classAvgVal ? Math.round(classAvgVal.sumPercent / classAvgVal.count) : null,
      historicalAvg: histAvgVal ? Math.round(histAvgVal.sumPercent / histAvgVal.count) : null
    });
  }

  return sections;
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
                questionBank: {
                  select: {
                    name: true,
                    type: true
                  }
                },
                mcqOptions: {
                  select: {
                    id: true,
                    optionText: true,
                    imageUrl: true,
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

    const scorecard = await calculateScoreCard(attempt.id, attempt.enrollment.student.id, ownedTest.id);

    // Multi-attempt analytics for this student
    const studentAllAttempts = await prisma.attempt.findMany({
      where: {
        enrollment: {
          testId: ownedTest.id,
          studentId: attempt.enrollment.student.id
        }
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        score: true,
        startedAt: true,
        submittedAt: true,
        isSubmitted: true,
        isBlocked: true
      }
    });

    const submittedStudentAttempts = studentAllAttempts.filter((a) => a.isSubmitted);
    const totalAttemptsCount = studentAllAttempts.length;
    const submittedScores = submittedStudentAttempts.map((a) => a.score ?? 0);
    const bestScore = submittedScores.length > 0 ? Math.max(...submittedScores) : (attempt.score ?? 0);
    const avgScoreSum = submittedScores.reduce((a, b) => a + b, 0);
    const averageScore = submittedScores.length > 0 ? Math.round((avgScoreSum / submittedScores.length) * 10) / 10 : (attempt.score ?? 0);

    const attemptsList = studentAllAttempts.map((a, idx) => ({
      id: a.id,
      attemptNumber: idx + 1,
      score: a.score,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      isSubmitted: a.isSubmitted,
      isBlocked: a.isBlocked ?? false
    }));

    // Calculate Module-wise & Bank-wise statistics for this student attempt
    const fullTestInfo = await prisma.test.findUnique({
      where: { id: ownedTest.id },
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
        }
      }
    });

    const bankAcc = new Map<string, {
      qbId: string;
      qbName: string;
      difficulty: string;
      moduleName: string;
      questionsAttempted: number;
      marksPerQuestion: number;
      totalMarks: number;
      earnedScore: number;
    }>();

    const moduleAcc = new Map<string, {
      moduleId: string;
      moduleName: string;
      subjectName: string;
      questionsAttempted: number;
      totalMarks: number;
      earnedScore: number;
    }>();

    if (fullTestInfo) {
      for (const rule of fullTestInfo.testQbRules) {
        const qb = rule.questionBank;
        const mod = qb.module;
        const qbMaxMarks = rule.questionsToPick * rule.marksPerQuestion;

        if (!bankAcc.has(qb.id)) {
          bankAcc.set(qb.id, {
            qbId: qb.id,
            qbName: qb.name,
            difficulty: qb.type || "easy",
            moduleName: mod.name,
            questionsAttempted: rule.questionsToPick,
            marksPerQuestion: rule.marksPerQuestion,
            totalMarks: qbMaxMarks,
            earnedScore: 0
          });
        }

        if (!moduleAcc.has(mod.id)) {
          moduleAcc.set(mod.id, {
            moduleId: mod.id,
            moduleName: mod.name,
            subjectName: mod.subject.name,
            questionsAttempted: rule.questionsToPick,
            totalMarks: qbMaxMarks,
            earnedScore: 0
          });
        } else {
          const m = moduleAcc.get(mod.id)!;
          m.questionsAttempted += rule.questionsToPick;
          m.totalMarks += qbMaxMarks;
        }
      }

      for (const item of attempt.questions) {
        const qbId = item.question.qbId;
        const earned = item.answer?.marksAwarded ?? 0;
        if (bankAcc.has(qbId)) {
          bankAcc.get(qbId)!.earnedScore += earned;
        }
        const qb = fullTestInfo.testQbRules.find((r) => r.qbId === qbId)?.questionBank;
        if (qb && moduleAcc.has(qb.moduleId)) {
          moduleAcc.get(qb.moduleId)!.earnedScore += earned;
        }
      }
    }

    const studentModuleStats = Array.from(moduleAcc.values()).map((m) => ({
      ...m,
      accuracyPercent: m.totalMarks > 0 ? Math.round((m.earnedScore / m.totalMarks) * 100) : 0
    }));

    const studentBankStats = Array.from(bankAcc.values()).map((b) => ({
      ...b,
      accuracyPercent: b.totalMarks > 0 ? Math.round((b.earnedScore / b.totalMarks) * 100) : 0
    }));

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
      scorecard,
      studentSummary: {
        totalAttemptsCount,
        bestScore,
        averageScore,
        attemptsList
      },
      moduleStats: studentModuleStats,
      bankStats: studentBankStats,
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
            qbId: item.question.qbId,
            qbName: (item.question as any).questionBank?.name ?? "Default",
            qbType: (item.question as any).questionBank?.type ?? "easy",
            mcqOptions: item.question.mcqOptions.map((option) => ({
              id: option.id,
              optionText: option.optionText,
              imageUrl: option.imageUrl,
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