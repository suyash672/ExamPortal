import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeTextAnswer(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function scoreAttempt(attemptId: string): Promise<number> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      enrollment: {
        include: {
          test: {
            include: {
              testQbRules: true
            }
          }
        }
      },
      questions: {
        include: {
          question: {
            include: {
              mcqOptions: true,
              acceptedAnswers: true
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

  if (!attempt) {
    throw new Error("Attempt not found");
  }

  const ruleByQbId = new Map(
    attempt.enrollment.test.testQbRules.map((rule) => [rule.qbId, rule])
  );

  let total = 0;

  for (const attemptQuestion of attempt.questions) {
    const question = attemptQuestion.question;
    const answer = attemptQuestion.answer;
    const rule = ruleByQbId.get(question.qbId);

    if (!rule) {
      continue;
    }

    const marksPerQuestion = rule.marksPerQuestion;
    let questionScore = 0;

    if (answer) {
      if (question.type === "TEXT") {
        const normalizedAnswer = normalizeTextAnswer(answer.textAnswer);

        if (normalizedAnswer) {
          const acceptedSet = new Set(
            question.acceptedAnswers.map((item) => normalizeTextAnswer(item.answerText))
          );

          if (acceptedSet.has(normalizedAnswer)) {
            questionScore = marksPerQuestion;
          }
        }
      } else {
        const optionsById = new Map(
          question.mcqOptions.map((option) => [option.id, option])
        );
        const selectedIds = Array.from(
          new Set(answer.selectedOptions.map((selection) => selection.mcqOptionId))
        );

        if (selectedIds.length > 0) {
          const hasZeroPercentSelection = selectedIds.some((id) => {
            const option = optionsById.get(id);
            return !option || option.scorePercent === 0;
          });

          if (!hasZeroPercentSelection) {
            const totalPercent = selectedIds.reduce((sum, id) => {
              const option = optionsById.get(id);
              return sum + (option?.scorePercent ?? 0);
            }, 0);

            questionScore = Math.floor((totalPercent / 100) * marksPerQuestion);
          }
        }
      }

      await prisma.attemptAnswer.update({
        where: { id: answer.id },
        data: { marksAwarded: questionScore }
      });
    }

    total += questionScore;
  }

  return Math.floor(total);
}
