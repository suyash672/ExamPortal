import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { AppError } from "../lib/AppError";

const prisma = new PrismaClient();
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const uploadsDir = path.join(__dirname, "../../uploads/question_images");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export type DocxQuestionPreview = {
  tempId: string;
  num: string;
  questionText: string;
  textLines: string[];
  options: Record<string, string>;
  answerLetter: string;
  hasEquation: boolean;
  suggestedType: "MCQ_TEXT" | "MCQ_IMAGE";
  rawXmls: string[];
};

function parseNode($: cheerio.CheerioAPI, node: any): string {
  const tagName = node.name || "";

  if (tagName === "w:t" || tagName === "m:t" || tagName.endsWith(":t")) {
    return $(node).text();
  }

  if (tagName === "w:r" || tagName === "m:r" || tagName.endsWith(":r")) {
    let runText = "";
    $(node).children().each((_, child) => {
      runText += parseNode($, child);
    });
    if (runText && tagName.startsWith("w:")) {
      const rPr = $(node).find("w\\:rPr");
      if (rPr.length > 0) {
        const vertAlign = rPr.find("w\\:vertAlign").attr("w:val");
        const isItalic = rPr.find("w\\:i").length > 0;
        const isBold = rPr.find("w\\:b").length > 0;

        if (vertAlign === "subscript") {
          runText = `<sub>${runText}</sub>`;
        } else if (vertAlign === "superscript") {
          runText = `<sup>${runText}</sup>`;
        }
        if (isItalic) {
          runText = `<i>${runText}</i>`;
        }
        if (isBold) {
          runText = `<b>${runText}</b>`;
        }
      }
    }
    return runText;
  }

  if (tagName === "m:sSub" || tagName.toLowerCase() === "m:ssub") {
    let baseHtml = "";
    let subHtml = "";
    $(node).children().each((_, child) => {
      const cName = child.name || "";
      if (cName.endsWith(":e") || cName === "e") {
        baseHtml = parseNode($, child);
      } else if (cName.endsWith(":sub") || cName === "sub") {
        subHtml = parseNode($, child);
      }
    });
    return `${baseHtml}<sub>${subHtml}</sub>`;
  }

  if (tagName === "m:sSup" || tagName.toLowerCase() === "m:ssup") {
    let baseHtml = "";
    let supHtml = "";
    $(node).children().each((_, child) => {
      const cName = child.name || "";
      if (cName.endsWith(":e") || cName === "e") {
        baseHtml = parseNode($, child);
      } else if (cName.endsWith(":sup") || cName === "sup") {
        supHtml = parseNode($, child);
      }
    });
    return `${baseHtml}<sup>${supHtml}</sup>`;
  }

  if (tagName === "m:sSubSup" || tagName.toLowerCase() === "m:ssubsup") {
    let baseHtml = "";
    let subHtml = "";
    let supHtml = "";
    $(node).children().each((_, child) => {
      const cName = child.name || "";
      if (cName.endsWith(":e") || cName === "e") {
        baseHtml = parseNode($, child);
      } else if (cName.endsWith(":sub") || cName === "sub") {
        subHtml = parseNode($, child);
      } else if (cName.endsWith(":sup") || cName === "sup") {
        supHtml = parseNode($, child);
      }
    });
    return `${baseHtml}<sub>${subHtml}</sub><sup>${supHtml}</sup>`;
  }

  if (tagName === "m:f" || tagName.toLowerCase() === "m:f") {
    let numHtml = "";
    let denHtml = "";
    $(node).children().each((_, child) => {
      const cName = child.name || "";
      if (cName.endsWith(":num") || cName === "num") {
        numHtml = parseNode($, child);
      } else if (cName.endsWith(":den") || cName === "den") {
        denHtml = parseNode($, child);
      }
    });
    return `(${numHtml}/${denHtml})`;
  }

  if (tagName === "m:oMath" || tagName.endsWith(":oMath")) {
    let mathText = "";
    $(node).children().each((_, child) => {
      mathText += parseNode($, child);
    });
    return ` ${mathText.trim()} `;
  }

  let childText = "";
  $(node).children().each((_, child) => {
    childText += parseNode($, child);
  });
  return childText;
}

export function parseDocxBufferToQuestions(fileBuffer: Buffer): DocxQuestionPreview[] {
  const zip = new AdmZip(fileBuffer);
  const xmlContent = zip.readAsText("word/document.xml");
  const $ = cheerio.load(xmlContent, { xmlMode: true });

  const rawParagraphs: { htmlText: string; rawXml: string }[] = [];
  $("w\\:p").each((_, pElem) => {
    const rawXml = $.html(pElem);
    const htmlText = parseNode($, pElem).trim();
    if (htmlText) {
      rawParagraphs.push({ htmlText, rawXml });
    }
  });

  const questions: DocxQuestionPreview[] = [];
  let currentQ: DocxQuestionPreview | null = null;

  for (let i = 0; i < rawParagraphs.length; i++) {
    const { htmlText, rawXml } = rawParagraphs[i];
    const plainText = htmlText.replace(/<[^>]*>/g, "").trim();

    const explicitStart = plainText.match(/^Question\s+(\d+)[:\s]*(.*)/i) || plainText.match(/^Q(\d+)\.?\s*(.*)/i);
    const numericStart = plainText.match(/^(\d+)[\.\)]\s*(.*)/);

    let isNewQ = false;
    let match: RegExpMatchArray | null = null;

    if (explicitStart) {
      isNewQ = true;
      match = explicitStart;
    } else if (numericStart) {
      const isNotOption =
        !plainText.match(/^[A-F][\.\)]/i) &&
        !plainText.startsWith("Answer:") &&
        !plainText.startsWith("Ans:") &&
        !plainText.startsWith("Explanation:");
      if (isNotOption) {
        if (!currentQ) {
          isNewQ = true;
          match = numericStart;
        } else {
          const hasOptions = Object.keys(currentQ.options).length > 0;
          const hasAnswer = currentQ.answerLetter !== "";
          if (hasOptions || hasAnswer) {
            isNewQ = true;
            match = numericStart;
          }
        }
      }
    }

    if (isNewQ && match) {
      if (currentQ) {
        currentQ.hasEquation = checkHasEquation(currentQ);
        currentQ.suggestedType = currentQ.hasEquation ? "MCQ_IMAGE" : "MCQ_TEXT";
        questions.push(currentQ);
      }
      const num = match[1];
      const rest = htmlText.replace(/^\s*(?:<b>|<i>)?\s*(?:Question\s+\d+[:\s]*|Q\d+\.?\s*|\d+[\.\)])\s*(?:<\/b>|<\/i>)?\s*/i, "").trim();
      currentQ = {
        tempId: `docx-q-${Date.now()}-${i}`,
        num,
        questionText: rest,
        textLines: rest ? [rest] : [],
        options: {},
        answerLetter: "",
        hasEquation: false,
        suggestedType: "MCQ_TEXT",
        rawXmls: [rawXml]
      };
      continue;
    }

    if (!currentQ) continue;

    const optionMatch = plainText.match(/^\s*([A-F])[\.\)]\s*(.*)/i);
    if (optionMatch) {
      const optLetter = optionMatch[1].toUpperCase();
      const optVal = htmlText.replace(/^\s*(?:<b>|<i>)?\s*[A-F][\.\)]\s*(?:<\/b>|<\/i>)?\s*/i, "").trim();
      currentQ.options[optLetter] = optVal;
      currentQ.rawXmls.push(rawXml);
      continue;
    }

    const answerMatch =
      plainText.match(/^(?:Correct\s+)?Answer[s]?:\s*([A-F])/i) ||
      plainText.match(/^(?:Correct\s+)?Ans:\s*([A-F])/i) ||
      plainText.match(/^Correct:\s*([A-F])/i);
    if (answerMatch) {
      currentQ.answerLetter = answerMatch[1].toUpperCase();
      continue;
    }

    if (Object.keys(currentQ.options).length === 0) {
      currentQ.textLines.push(htmlText);
      currentQ.rawXmls.push(rawXml);
    }
  }

  if (currentQ) {
    currentQ.hasEquation = checkHasEquation(currentQ);
    currentQ.suggestedType = currentQ.hasEquation ? "MCQ_IMAGE" : "MCQ_TEXT";
    questions.push(currentQ);
  }

  return questions;
}

function checkHasEquation(q: DocxQuestionPreview): boolean {
  const combinedXml = q.rawXmls.join(" ");
  const combinedHtml = q.textLines.join(" ") + " " + Object.values(q.options).join(" ");

  if (/m:oMath|m:f|m:sSub|m:sSup|m:rad|w:drawing/i.test(combinedXml)) {
    return true;
  }
  if (/<sub>|<sup>|&sum;|[∑∫πΩωδθ]|e\^|W_N|X\(k\)|x\(n\)|H\(z\)|=|\+|\*|\//i.test(combinedHtml)) {
    return true;
  }
  return false;
}

export function renderDynamicQuestionCardImage(q: DocxQuestionPreview, index: number): string {
  const filename = `q_docx_${Date.now()}_${index}.png`;
  const tempHtmlPath = path.join(uploadsDir, `temp_q_${Date.now()}_${index}.html`);
  const outputPngPath = path.join(uploadsDir, filename);

  const safeTextLines = Array.isArray(q.textLines) && q.textLines.length > 0 ? q.textLines : [q.questionText || ""];
  const safeOptions = q.options || {};

  const questionContent = safeTextLines.join("<br>");

  // Dynamic Content-Aware Height Calculation
  const textChars = questionContent.replace(/<[^>]*>/g, "").length;
  const lineEstimate = Math.ceil(textChars / 70) + safeTextLines.length;

  const optKeys = Object.keys(safeOptions);
  let optionsHeightSum = 0;
  optKeys.forEach((key) => {
    const valText = (safeOptions[key] || "").replace(/<[^>]*>/g, "");
    const optLines = Math.ceil(valText.length / 65) || 1;
    optionsHeightSum += optLines * 38 + 24;
  });

  const estimatedHeight = Math.min(1150, Math.max(380, lineEstimate * 32 + optionsHeightSum + 110));

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body {
      overflow: hidden !important;
      margin: 0;
      padding: 0;
      background: transparent;
    }
    body {
      font-family: 'Segoe UI', -apple-system, system-ui, Roboto, sans-serif;
      padding: 12px;
      width: 900px;
    }
    .card {
      background: #ffffff;
      border: 2px solid #cbd5e1;
      border-radius: 20px;
      padding: 24px 28px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      color: #0f172a;
      overflow: hidden;
      width: 100%;
      box-sizing: border-box;
    }
    .question-text {
      font-size: 21px;
      line-height: 1.65;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 16px;
    }
    .options-container {
      margin-top: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .option-item {
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 14px;
      padding: 12px 18px;
      font-size: 19px;
      color: #1e293b;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .option-key {
      font-weight: 800;
      color: #0f766e;
      min-width: 26px;
    }
    .option-val {
      font-weight: 500;
      line-height: 1.55;
    }
    sub { font-size: 0.75em; vertical-align: sub; }
    sup { font-size: 0.75em; vertical-align: super; }
  </style>
</head>
<body>
  <div class="card">
    <div class="question-text">${questionContent}</div>
    ${(() => {
      if (optKeys.length === 0) return "";
      const items = optKeys.map((key) => {
        const val = safeOptions[key];
        return `<div class="option-item"><span class="option-key">${key})</span><span class="option-val">${val}</span></div>`;
      }).join("");
      return `<div class="options-container">${items}</div>`;
    })()}
  </div>
</body>
</html>
`;

  fs.writeFileSync(tempHtmlPath, htmlContent, "utf-8");

  try {
    const cmd = `"${edgePath}" --headless --hide-scrollbars --disable-gpu --screenshot="${outputPngPath}" --window-size=960,${estimatedHeight} "${tempHtmlPath}"`;
    execSync(cmd);
  } catch (err) {
    console.error("Failed edge screenshot for question", index, err);
  } finally {
    if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
  }

  return `/uploads/question_images/${filename}`;
}

export async function previewDocxImport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawQbId = req.params.qbId;
    const qbId = Array.isArray(rawQbId) ? rawQbId[0] : (rawQbId || "");
    if (!qbId) throw new AppError("Question Bank ID is required", 400);

    if (!req.file || !req.file.buffer) {
      throw new AppError("Please upload a valid .docx file", 400);
    }

    const parsedQuestions = parseDocxBufferToQuestions(req.file.buffer);

    let pureTextCount = 0;
    let equationCount = 0;
    parsedQuestions.forEach((q) => {
      if (q.hasEquation) equationCount++;
      else pureTextCount++;
    });

    const cleanedQuestions = parsedQuestions.map(({ rawXmls, ...rest }) => rest);

    res.status(200).json({
      success: true,
      totalQuestions: cleanedQuestions.length,
      pureTextCount,
      equationCount,
      questions: cleanedQuestions
    });
  } catch (err) {
    next(err);
  }
}

export async function commitDocxImport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawQbId = req.params.qbId;
    const qbId = Array.isArray(rawQbId) ? rawQbId[0] : (rawQbId || "");
    if (!qbId) throw new AppError("Question Bank ID is required", 400);

    let targetQbId = qbId;
    if (!qbId.match(/^[a-fA-F0-9]{24}$/)) {
      const qbRecord = await prisma.questionBank.findFirst({
        where: { name: qbId }
      });
      if (qbRecord) {
        targetQbId = qbRecord.id;
      }
    }

    const { questions: itemsPayload } = req.body;
    if (!Array.isArray(itemsPayload) || itemsPayload.length === 0) {
      throw new AppError("No questions selected for import", 400);
    }

    const createdRecords = [];

    for (let i = 0; i < itemsPayload.length; i++) {
      const item: DocxQuestionPreview & { importType?: "MCQ_TEXT" | "MCQ_IMAGE" } = itemsPayload[i];
      const targetType = item.importType || item.suggestedType || "MCQ_TEXT";

      const safeTextLines = Array.isArray(item.textLines) && item.textLines.length > 0 ? item.textLines : [item.questionText || ""];
      const safeOptions = item.options || {};

      const correctLetter = item.answerLetter || "A";
      const correctIdx = ["A", "B", "C", "D", "E"].indexOf(correctLetter);
      const finalCorrectIdx = correctIdx !== -1 ? correctIdx : 0;

      if (targetType === "MCQ_IMAGE") {
        const imageUrl = renderDynamicQuestionCardImage({
          ...item,
          textLines: safeTextLines,
          options: safeOptions
        }, i);
        const optionsData = ["A", "B", "C", "D"].map((label, idx) => ({
          optionText: label,
          scorePercent: idx === finalCorrectIdx ? 100 : 0
        }));

        const created = await prisma.question.create({
          data: {
            qbId: targetQbId,
            type: "MCQ",
            questionText: "",
            imageUrl,
            mcqOptions: {
              create: optionsData
            }
          },
          include: { mcqOptions: true }
        });
        createdRecords.push(created);
      } else {
        const optKeys = Object.keys(safeOptions);
        const optionsData = (optKeys.length > 0 ? optKeys : ["A", "B", "C", "D"]).map((letter, idx) => {
          const textVal = safeOptions[letter] || letter;
          return {
            optionText: textVal,
            scorePercent: letter === correctLetter || idx === finalCorrectIdx ? 100 : 0
          };
        });

        if (!optionsData.some((o) => o.scorePercent > 0)) {
          optionsData[0].scorePercent = 100;
        }

        const created = await prisma.question.create({
          data: {
            qbId: targetQbId,
            type: "MCQ",
            questionText: safeTextLines.join(" ") || `Question ${i + 1}`,
            imageUrl: null,
            mcqOptions: {
              create: optionsData
            }
          },
          include: { mcqOptions: true }
        });
        createdRecords.push(created);
      }
    }

    res.status(201).json({
      success: true,
      importedCount: createdRecords.length,
      message: `Successfully imported ${createdRecords.length} questions into Question Bank.`
    });
  } catch (err) {
    next(err);
  }
}
