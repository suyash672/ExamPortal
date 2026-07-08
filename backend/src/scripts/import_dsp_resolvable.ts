import { PrismaClient } from "@prisma/client";
import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { createQuestionRecord } from "../lib/question.persistence";

const prisma = new PrismaClient();

const folderPath = "c:/Users/Onkar/Desktop/Work@SPTBI/ExamPortal/samplequestions/DSP Resolvable";
const files = [
  { file: "Comlex question answers DFT.docx", moduleName: "DFT", qbName: "DFT Complex", type: "complex" },
  { file: "Complex-Discrete Time Signal.docx", moduleName: "DT Signal", qbName: "Discrete Time Signal Complex", type: "complex" },
  { file: "Complex-FFT-ANSWERS.docx", moduleName: "FFT", qbName: "FFT Complex", type: "complex" },
  { file: "Hard -DFT questions.docx", moduleName: "DFT", qbName: "DFT Hard", type: "hard" },
  { file: "Hard--FFT-Questions-ANSWERS.docx", moduleName: "FFT", qbName: "FFT Hard", type: "hard" },
  { file: "Hard-Discrete Time Signal.docx", moduleName: "DT Signal", qbName: "Discrete Time Signal Hard", type: "hard" },
  { file: "Z-Transform-Complex.docx", moduleName: "Z-Transform", qbName: "Z-Transform Complex", type: "complex" },
  { file: "Z-Transform-Hard.docx", moduleName: "Z-Transform", qbName: "Z-Transform Hard", type: "hard" }
];

interface ParsedQuestion {
  num: string;
  title: string;
  textLines: string[];
  options: { [key: string]: string };
  answer: string;
}

function cleanText(text: string): string {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/(?:Correct\s+)?Answer[s]?:\s*[A-F\s,✅\-\d]+/gi, "");
  cleaned = cleaned.replace(/(?:Correct\s+)?Ans:\s*[A-F\s,✅\-\d]+/gi, "");
  cleaned = cleaned.replace(/Correct:\s*[A-F\s,✅\-\d]+/gi, "");
  cleaned = cleaned.replace(/Top\s+of\s+Form/gi, "");
  cleaned = cleaned.replace(/Bottom\s+of\s+Form/gi, "");
  // Replace non-newline whitespace sequences with a single space, but keep newlines!
  cleaned = cleaned.replace(/[ \t\r\f]+/g, " ");
  // Trim spaces around line breaks and at ends
  cleaned = cleaned.replace(/^[ \t]+|[ \t]+$/gm, "");
  cleaned = cleaned.trim();
  return cleaned;
}

function parseDocx(filePath: string): ParsedQuestion[] {
  const fileBuffer = fs.readFileSync(filePath);
  const zip = new AdmZip(fileBuffer);
  const xmlContent = zip.readAsText("word/document.xml");
  const $ = cheerio.load(xmlContent, { xmlMode: true });

  function parseNode(node: any): string {
    const tagName = node.name || "";
    
    if (tagName === "w:t" || tagName === "m:t" || tagName.endsWith(":t")) {
      return $(node).text();
    }
    
    if (tagName === "w:r" || tagName === "m:r" || tagName.endsWith(":r")) {
      let runText = "";
      $(node).children().each((_, child) => {
        runText += parseNode(child);
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
          baseHtml = parseNode(child);
        } else if (cName.endsWith(":sub") || cName === "sub") {
          subHtml = parseNode(child);
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
          baseHtml = parseNode(child);
        } else if (cName.endsWith(":sup") || cName === "sup") {
          supHtml = parseNode(child);
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
          baseHtml = parseNode(child);
        } else if (cName.endsWith(":sub") || cName === "sub") {
          subHtml = parseNode(child);
        } else if (cName.endsWith(":sup") || cName === "sup") {
          supHtml = parseNode(child);
        }
      });
      return `${baseHtml}<sub>${subHtml}</sub><sup>${supHtml}</sup>`;
    }

    if (tagName === "m:oMath" || tagName.endsWith(":oMath")) {
      let mathText = "";
      $(node).children().each((_, child) => {
        mathText += parseNode(child);
      });
      return ` ${mathText.trim()} `;
    }

    let childText = "";
    $(node).children().each((_, child) => {
      childText += parseNode(child);
    });
    return childText;
  }

  const paragraphs: string[] = [];
  $("w\\:p").each((_, pElem) => {
    const paragraphText = parseNode(pElem).trim();
    if (paragraphText) {
      paragraphs.push(paragraphText);
    }
  });

  const questions: ParsedQuestion[] = [];
  let currentQ: ParsedQuestion | null = null;
  let mode: "text" | "options" | "answer" | "explanation" | "idle" = "idle";

  for (let i = 0; i < paragraphs.length; i++) {
    const line = paragraphs[i].trim();
    
    // Strip HTML tags for clean matching against regexes
    const plainLine = line.replace(/<[^>]*>/g, "").trim();
    
    const explicitQStart = plainLine.match(/^Question\s+(\d+)[:\s]*(.*)/i) || plainLine.match(/^Q(\d+)\.?\s*(.*)/i);
    const numericQStart = plainLine.match(/^(\d+)[\.\)]\s*(.*)/);
    
    let isNewQ = false;
    let match: RegExpMatchArray | null = null;

    if (explicitQStart) {
      isNewQ = true;
      match = explicitQStart;
    } else if (numericQStart) {
      const isNotOptionOrAnswer = !plainLine.match(/^[A-F][\.\)]/i) &&
                                  !plainLine.match(/^[P-T][\.\)]/i) &&
                                  !plainLine.startsWith("Answer:") &&
                                  !plainLine.startsWith("Explanation:");
      
      if (isNotOptionOrAnswer) {
        if (!currentQ) {
          isNewQ = true;
          match = numericQStart;
        } else {
          const hasOptions = Object.keys(currentQ.options).length > 0;
          const hasAnswer = currentQ.answer !== "";
          if (hasOptions || hasAnswer) {
            isNewQ = true;
            match = numericQStart;
          }
        }
      }
    }

    if (isNewQ && match) {
      if (currentQ) {
        questions.push(currentQ);
      }
      const num = match[1];
      // Get the rest of the question text from the original line by removing the matched prefix
      const rest = explicitQStart 
        ? line.replace(/^\s*(?:<b>|<i>)?\s*(?:Question\s+\d+[:\s]*|Q\d+\.?\s*)\s*(?:<\/b>|<\/i>)?\s*/i, "").trim()
        : line.replace(/^\s*(?:<b>|<i>)?\s*\d+[\.\)]\s*(?:<\/b>|<\/i>)?\s*/i, "").trim();

      currentQ = {
        num,
        title: line,
        textLines: rest ? [rest] : [],
        options: {},
        answer: ""
      };
      mode = "text";
      continue;
    }

    if (!currentQ) {
      continue;
    }

    const optionMatch = plainLine.match(/^\s*([A-F])[\.\)]\s*(.*)/i);
    if (optionMatch) {
      const optLetter = optionMatch[1].toUpperCase();
      const optVal = line.replace(/^\s*(?:<b>|<i>)?\s*[A-F][\.\)]\s*(?:<\/b>|<\/i>)?\s*/i, "").trim();
      currentQ.options[optLetter] = optVal;
      mode = "options";
      continue;
    }

    if (mode === "text" || mode === "options") {
      const hasMultipleOptions = plainLine.match(/^[A-F][\.\)]\s+.*[B-F][\.\)]\s+/i);
      if (hasMultipleOptions) {
        const parts = line.split(/(?=(?:<b>|<i>)?\s*[A-F][\.\)])/gi);
        for (const part of parts) {
          const cleanPart = part.replace(/<[^>]*>/g, "").trim();
          const optMatch = cleanPart.match(/^\s*([A-F])[\.\)]\s*(.*)/i);
          if (optMatch) {
            const optLetter = optMatch[1].toUpperCase();
            const optVal = part.replace(/^\s*(?:<b>|<i>)?\s*[A-F][\.\)]\s*(?:<\/b>|<\/i>)?\s*/i, "").trim();
            currentQ.options[optLetter] = optVal;
          }
        }
        mode = "options";
        continue;
      }
    }

    const answerMatch = plainLine.match(/^(?:Correct\s+)?Answer[s]?:\s*(.*)/i) || 
                        plainLine.match(/^(?:Correct\s+)?Ans:\s*(.*)/i) ||
                        plainLine.match(/^Correct:\s*(.*)/i);
    if (answerMatch) {
      const val = answerMatch[1].replace(/[^A-F]/gi, "").toUpperCase();
      currentQ.answer = val;
      mode = "answer";
      continue;
    }

    const explanationMatch = plainLine.match(/^Explanation:\s*(.*)/i) || plainLine.match(/^Explain:\s*(.*)/i);
    if (explanationMatch) {
      mode = "explanation";
      continue;
    }

    if (mode === "explanation") {
      continue;
    }

    if (mode === "answer") {
      mode = "explanation";
      continue;
    }

    if (mode === "text") {
      currentQ.textLines.push(line);
      continue;
    }

    if (mode === "options") {
      const lastOptKey = Object.keys(currentQ.options).pop();
      if (lastOptKey) {
        currentQ.options[lastOptKey] += " " + line;
      } else {
        currentQ.textLines.push(line);
      }
    }
  }

  if (currentQ) {
    questions.push(currentQ);
  }

  // Clean text and titles
  for (const q of questions) {
    const cleanTitle = cleanText(q.title).replace(/^(?:Question\s+\d+[:\s]*|Q\d+\.?\s*|\d+[\.\)]\s*)/i, "").trim();
    let text = cleanText(q.textLines.join("\n"));
    if (text.startsWith(cleanTitle)) {
      text = text.substring(cleanTitle.length).trim();
    }
    text = text.replace(/^(?:Question\s+\d+[:\s]*|Q\d+\.?\s*|\d+[\.\)]\s*)/i, "").trim();
    q.textLines = [text];

    for (const key of Object.keys(q.options)) {
      q.options[key] = cleanText(q.options[key]);
    }
  }

  return questions;
}

async function run() {
  console.log("Starting DSP Resolvable Questions Import...");

  // Fetch modules belonging to DSP subject (id: 6a41529fdf54a636539772ed)
  const dbModules = await prisma.module.findMany({
    where: {
      subjectId: "6a41529fdf54a636539772ed"
    }
  });

  let totalQuestionsImported = 0;

  for (const item of files) {
    const filePath = path.join(folderPath, item.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${item.file}, skipping.`);
      continue;
    }

    // Find the correct module by name
    const moduleDb = dbModules.find(m => m.name.toLowerCase() === item.moduleName.toLowerCase());
    if (!moduleDb) {
      console.error(`Database Module not found for name: ${item.moduleName} under subject DSP!`);
      continue;
    }

    // Check if the QuestionBank already exists, otherwise create it
    let qb = await prisma.questionBank.findFirst({
      where: {
        moduleId: moduleDb.id,
        name: item.qbName
      }
    });

    if (qb) {
      // Delete existing questions and sub-records in this bank to avoid duplication and refresh the import
      await prisma.mcqOption.deleteMany({
        where: { question: { qbId: qb.id } }
      });
      await prisma.textAcceptedAnswer.deleteMany({
        where: { question: { qbId: qb.id } }
      });
      await prisma.question.deleteMany({
        where: { qbId: qb.id }
      });
      console.log(`Cleared existing questions from Question Bank: "${item.qbName}"`);
    } else {
      qb = await prisma.questionBank.create({
        data: {
          moduleId: moduleDb.id,
          name: item.qbName,
          type: item.type
        }
      });
      console.log(`Created new Question Bank: "${item.qbName}" in module "${item.moduleName}"`);
    }

    // Parse the docx file questions
    const parsedQuestions = parseDocx(filePath);
    console.log(`Parsed ${parsedQuestions.length} questions from ${item.file}`);

    // Insert questions into database
    await prisma.$transaction(async (tx) => {
      for (const q of parsedQuestions) {
        const optionKeys = Object.keys(q.options).sort(); // A, B, C, D
        
        const correctLetters = q.answer.split(""); // e.g. ["A", "B"]
        const correctIndices = correctLetters.map(letter => optionKeys.indexOf(letter)).filter(idx => idx !== -1);
        
        const optionsData = optionKeys.map((key, index) => {
          let score = 0;
          if (correctIndices.includes(index)) {
            const count = correctIndices.length;
            const baseScore = Math.floor(100 / count);
            const remainder = 100 - baseScore * count;
            
            score = index === correctIndices[0] ? baseScore + remainder : baseScore;
          }
          return {
            optionText: q.options[key],
            scorePercent: score
          };
        });

        const hasCorrect = optionsData.some(opt => opt.scorePercent > 0);
        if (!hasCorrect && optionsData.length > 0) {
          optionsData[0].scorePercent = 100;
        }

        const questionInput = {
          qbId: qb.id,
          type: "MCQ" as const,
          questionText: q.textLines[0] || "Question text not provided.",
          options: optionsData
        };

        await createQuestionRecord(tx, questionInput, { includeRelations: false });
        totalQuestionsImported++;
      }
    }, {
      timeout: 30000
    });

    console.log(`Successfully imported ${parsedQuestions.length} questions into "${item.qbName}"`);
  }

  console.log(`DSP Resolvable Import Completed! Total questions imported: ${totalQuestionsImported}`);
}

run()
  .catch(err => console.error("Import failed:", err))
  .finally(() => prisma.$disconnect());
