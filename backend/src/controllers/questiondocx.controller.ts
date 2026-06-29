import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import { AppError } from "../lib/AppError";
import type { QuestionInput } from "../lib/question.persistence";
import { createQuestionSchema } from "../validators/question.validators";
import { createQuestionRecord } from "../lib/question.persistence";

const prisma = new PrismaClient();

function getParamAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function standardizeMarkers(text: string): string {
  return text
    .replace(/(?:\b|(?<=:))[aA]\s*[\).]/g, "A)")
    .replace(/(?:\b|(?<=[a-z]))[bB]\s*[\).]/g, "B)")
    .replace(/(?:\b|(?<=[a-z]))[cC]\s*[\).]/g, "C)")
    .replace(/(?:\b|(?<=[a-z]))[dD]\s*[\).]/g, "D)")
    .replace(/(?:\b|(?<=[a-z]))[eE]\s*[\).]/g, "E)");
}

function parseOptions(text: string): { questionText: string; options: string[] } {
  const markers = ["A)", "B)", "C)", "D)", "E)", "F)"];
  let questionText = text;
  const options: string[] = [];

  const firstMarkerIndex = text.indexOf("A)");
  if (firstMarkerIndex !== -1) {
    questionText = text.substring(0, firstMarkerIndex).trim();
    const optionsPart = text.substring(firstMarkerIndex);

    for (let i = 0; i < markers.length; i++) {
      const currentMarker = markers[i];
      const nextMarker = markers[i + 1];

      const startIdx = optionsPart.indexOf(currentMarker);
      if (startIdx !== -1) {
        const contentStart = startIdx + currentMarker.length;
        let contentEnd = optionsPart.length;

        if (nextMarker) {
          const nextIdx = optionsPart.indexOf(nextMarker);
          if (nextIdx !== -1) {
            contentEnd = nextIdx;
          }
        }

        const optionVal = optionsPart.substring(contentStart, contentEnd).trim();
        options.push(optionVal);
      }
    }
  }

  return { questionText, options };
}

function parseDocxText(fileBuffer: Buffer): string {
  const zip = new AdmZip(fileBuffer);
  const xmlContent = zip.readAsText("word/document.xml");
  const $ = cheerio.load(xmlContent, { xmlMode: true });

  const paragraphs: string[] = [];

  $("w\\:p").each((_, pElem) => {
    const texts: string[] = [];
    $(pElem).find("w\\:t, m\\:t").each((_, tElem) => {
      texts.push($(tElem).text());
    });
    const paragraphText = texts.join("").trim();
    if (paragraphText) {
      paragraphs.push(paragraphText);
    }
  });

  return paragraphs.join("\n");
}

function parseDocxQuestions(rawText: string, qbId: string): QuestionInput[] {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  const questions: QuestionInput[] = [];

  let currentQuestionText = "";
  let currentOptionsText = "";
  let correctAnswerLetter = "";
  let inQuestion = false;

  const saveCurrentQuestion = () => {
    if (!inQuestion) return;

    let fullText = currentQuestionText;
    if (currentOptionsText) {
      fullText += " " + currentOptionsText;
    }

    const standardized = standardizeMarkers(fullText);
    const parsed = parseOptions(standardized);

    if (parsed.questionText && parsed.options.length > 0) {
      const correctIndex = correctAnswerLetter ? correctAnswerLetter.charCodeAt(0) - 65 : -1;

      const options = parsed.options.map((opt, idx) => ({
        optionText: opt,
        scorePercent: idx === correctIndex ? 100 : 0
      }));

      const hasCorrect = options.some((opt) => opt.scorePercent > 0);
      if (!hasCorrect && options.length > 0) {
        options[0].scorePercent = 100;
      }

      questions.push({
        qbId,
        type: "MCQ" as const,
        questionText: parsed.questionText,
        options
      });
    }

    currentQuestionText = "";
    currentOptionsText = "";
    correctAnswerLetter = "";
    inQuestion = false;
  };

  for (const line of lines) {
    const questionStartMatch = line.match(/^\s*(\d+)\.\s+(.*)/);

    if (questionStartMatch) {
      saveCurrentQuestion();
      inQuestion = true;
      currentQuestionText = questionStartMatch[2].trim();
    } else if (inQuestion) {
      const answerMatch = line.match(/^Answer:\s*([A-F])/i);
      if (answerMatch) {
        correctAnswerLetter = answerMatch[1].toUpperCase();
        saveCurrentQuestion();
      } else {
        if (line.match(/(?:^|:|\s)[A-F]\)/i)) {
          currentOptionsText = currentOptionsText ? currentOptionsText + " " + line : line;
        } else {
          if (currentOptionsText) {
            currentOptionsText += " " + line;
          } else {
            currentQuestionText += " " + line;
          }
        }
      }
    }
  }

  saveCurrentQuestion();
  return questions;
}

async function ensureOwnedQuestionBank(qbId: string, teacherId: string) {
  const qb = await prisma.questionBank.findUnique({
    where: { id: qbId },
    select: {
      module: {
        select: {
          subject: {
            select: {
              teacherId: true
            }
          }
        }
      }
    }
  });

  return qb?.module.subject.teacherId === teacherId;
}

export async function importDocx(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const qbId = getParamAsString(req.body.qbId);
    if (!qbId) {
      throw new AppError("qbId is required", 400);
    }

    const owned = await ensureOwnedQuestionBank(qbId, req.user.id);
    if (!owned) {
      throw new AppError("Forbidden", 403);
    }

    if (!req.file?.buffer) {
      throw new AppError("file is required", 400);
    }

    let rawText: string;
    try {
      rawText = parseDocxText(req.file.buffer);
    } catch (err) {
      throw new AppError("Invalid or corrupted Word (.docx) file", 400);
    }

    const parsedQuestions = parseDocxQuestions(rawText, qbId);
    const validQuestions: QuestionInput[] = [];
    const errors: string[] = [];

    parsedQuestions.forEach((q, index) => {
      const parsed = createQuestionSchema.safeParse(q);
      if (!parsed.success) {
        errors.push(
          `Question ${index + 1} failed validation: ${parsed.error.issues.map((i) => i.message).join(", ")}`
        );
        return;
      }
      validQuestions.push(parsed.data as QuestionInput);
    });

    if (errors.length > 0 && validQuestions.length === 0) {
      throw new AppError(
        JSON.stringify({
          errors: errors.map((err, i) => ({ row: i + 1, errors: [err] }))
        }),
        400
      );
    }

    await prisma.$transaction(
      async (tx) => {
        for (const question of validQuestions) {
          await createQuestionRecord(tx, question, { includeRelations: false });
        }
      },
      {
        timeout: 60000
      }
    );

    res.status(200).json({
      imported: validQuestions.length,
      warnings: errors
    });
  } catch (error) {
    next(error);
  }
}
