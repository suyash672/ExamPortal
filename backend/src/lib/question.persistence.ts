import { Prisma } from "@prisma/client";
import { createQuestionSchema } from "../validators/question.validators";

export type QuestionInput =
  | {
      qbId: string;
      type: "MCQ";
      questionText: string;
      imageUrl?: string | null;
      options: Array<{ optionText: string; scorePercent: number }>;
    }
  | {
      qbId: string;
      type: "TEXT";
      questionText: string;
      imageUrl?: string | null;
      acceptedAnswers: string[];
    };

export function questionInclude() {
  return {
    mcqOptions: true,
    acceptedAnswers: true
  } as const;
}

async function createRelatedRecords(tx: Prisma.TransactionClient, data: QuestionInput, questionId: string) {
  if (data.type === "MCQ") {
    if (data.options.length > 0) {
      await tx.mcqOption.createMany({
        data: data.options.map((option: { optionText: string; scorePercent: number }) => ({
          questionId,
          optionText: option.optionText,
          scorePercent: option.scorePercent
        }))
      });
    }
    return;
  }

  if (data.acceptedAnswers.length > 0) {
    await tx.textAcceptedAnswer.createMany({
      data: data.acceptedAnswers.map((answerText: string) => ({
        questionId,
        answerText
      }))
    });
  }
}

export async function createQuestionRecord(
  tx: Prisma.TransactionClient,
  data: QuestionInput,
  options?: { includeRelations?: boolean }
) {
  const question = await tx.question.create({
    data: {
      qbId: data.qbId,
      type: data.type,
      questionText: data.questionText,
      imageUrl: data.imageUrl
    }
  });

  await createRelatedRecords(tx, data, question.id);

  if (options?.includeRelations === false) {
    return question;
  }

  return tx.question.findUniqueOrThrow({
    where: { id: question.id },
    include: questionInclude()
  });
}

export async function replaceQuestionRecord(
  tx: Prisma.TransactionClient,
  questionId: string,
  data: QuestionInput
) {
  await tx.mcqOption.deleteMany({
    where: { questionId }
  });

  await tx.textAcceptedAnswer.deleteMany({
    where: { questionId }
  });

  await tx.question.update({
    where: { id: questionId },
    data: {
      qbId: data.qbId,
      type: data.type,
      questionText: data.questionText,
      imageUrl: data.imageUrl
    }
  });

  await createRelatedRecords(tx, data, questionId);

  return tx.question.findUniqueOrThrow({
    where: { id: questionId },
    include: questionInclude()
  });
}
