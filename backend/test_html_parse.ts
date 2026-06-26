import * as cheerio from "cheerio";
import fs from "fs";

const htmlContent = fs.readFileSync(
  "c:/Users/Onkar/Desktop/Work@SPTBI/ExamPortal/samplequestions/questions-DSP-EXTC-2025-26-Default for DSP-EXTC-2025-26-20260624-1658.html",
  "utf8"
);
const $ = cheerio.load(htmlContent);

const validQuestions = [];
const errors = [];

$(".question").each((index, element) => {
  const q = $(element);
  
  let questionText = q.find(".questiontext").text().trim();
  
  if (!questionText) {
    questionText = q.text().trim();
  }

  if (!questionText) {
    errors.push(`Question block ${index + 1} has no identifiable question text.`);
    return;
  }

  const options = [];

  q.find("ul.multichoice li").each((_, liElem) => {
    // Just find the text directly or remove the input first?
    const optionText = $(liElem).text().trim();
    if (optionText) {
      options.push({
        optionText: optionText,
        scorePercent: 0
      });
    }
  });

  if (options.length === 0) {
    errors.push(`Question block ${index + 1} ("${questionText.substring(0, 30)}...") has no valid options. Only MCQ is supported via HTML import.`);
    return;
  }

  validQuestions.push({
    questionText,
    options
  });
});

console.log(`Valid questions: ${validQuestions.length}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) {
  console.log("First 5 errors:");
  console.log(errors.slice(0, 5));
}
