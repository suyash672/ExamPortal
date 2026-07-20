const { PrismaClient } = require('@prisma/client');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const uploadsDir = path.join(__dirname, 'uploads', 'question_images');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const folderPath = path.join(__dirname, '../samplequestions/DSP Resolvable');

const filesToProcess = [
  { file: "Comlex question answers DFT.docx", moduleName: "DFT", qbName: "Resolved DFT Complex", key: "res-dft-c" },
  { file: "Complex-Discrete Time Signal.docx", moduleName: "DT Signal", qbName: "Resolved Discrete Time Signal Complex", key: "res-dt-c" },
  { file: "Complex-FFT-ANSWERS.docx", moduleName: "FFT", qbName: "Resolved FFT Complex", key: "res-fft-c" },
  { file: "Hard -DFT questions.docx", moduleName: "DFT", qbName: "Resolved DFT Hard", key: "res-dft-h" },
  { file: "Hard--FFT-Questions-ANSWERS.docx", moduleName: "FFT", qbName: "Resolved FFT Hard", key: "res-fft-h" },
  { file: "Hard-Discrete Time Signal.docx", moduleName: "DT Signal", qbName: "Resolved Discrete Time Signal Hard", key: "res-dt-h" },
  { file: "Z-Transform-Complex.docx", moduleName: "Z-Transform", qbName: "Resolved Z-Transform Complex", key: "res-z-c" },
  { file: "Z-Transform-Hard.docx", moduleName: "Z-Transform", qbName: "Resolved Z-Transform Hard", key: "res-z-h" }
];

function parseNode($, node) {
  const tagName = node.name || '';

  if (tagName === 'w:t' || tagName === 'm:t' || tagName.endsWith(':t')) {
    return $(node).text();
  }

  if (tagName === 'w:r' || tagName === 'm:r' || tagName.endsWith(':r')) {
    let runText = '';
    $(node).children().each((_, child) => {
      runText += parseNode($, child);
    });
    if (runText && tagName.startsWith('w:')) {
      const rPr = $(node).find('w\\:rPr');
      if (rPr.length > 0) {
        const vertAlign = rPr.find('w\\:vertAlign').attr('w:val');
        const isItalic = rPr.find('w\\:i').length > 0;
        const isBold = rPr.find('w\\:b').length > 0;

        if (vertAlign === 'subscript') {
          runText = `<sub>${runText}</sub>`;
        } else if (vertAlign === 'superscript') {
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

  if (tagName === 'm:sSub' || tagName.toLowerCase() === 'm:ssub') {
    let baseHtml = '';
    let subHtml = '';
    $(node).children().each((_, child) => {
      const cName = child.name || '';
      if (cName.endsWith(':e') || cName === 'e') {
        baseHtml = parseNode($, child);
      } else if (cName.endsWith(':sub') || cName === 'sub') {
        subHtml = parseNode($, child);
      }
    });
    return `${baseHtml}<sub>${subHtml}</sub>`;
  }

  if (tagName === 'm:sSup' || tagName.toLowerCase() === 'm:ssup') {
    let baseHtml = '';
    let supHtml = '';
    $(node).children().each((_, child) => {
      const cName = child.name || '';
      if (cName.endsWith(':e') || cName === 'e') {
        baseHtml = parseNode($, child);
      } else if (cName.endsWith(':sup') || cName === 'sup') {
        supHtml = parseNode($, child);
      }
    });
    return `${baseHtml}<sup>${supHtml}</sup>`;
  }

  if (tagName === 'm:sSubSup' || tagName.toLowerCase() === 'm:ssubsup') {
    let baseHtml = '';
    let subHtml = '';
    let supHtml = '';
    $(node).children().each((_, child) => {
      const cName = child.name || '';
      if (cName.endsWith(':e') || cName === 'e') {
        baseHtml = parseNode($, child);
      } else if (cName.endsWith(':sub') || cName === 'sub') {
        subHtml = parseNode($, child);
      } else if (cName.endsWith(':sup') || cName === 'sup') {
        supHtml = parseNode($, child);
      }
    });
    return `${baseHtml}<sub>${subHtml}</sub><sup>${supHtml}</sup>`;
  }

  if (tagName === 'm:f' || tagName.toLowerCase() === 'm:f') {
    let numHtml = '';
    let denHtml = '';
    $(node).children().each((_, child) => {
      const cName = child.name || '';
      if (cName.endsWith(':num') || cName === 'num') {
        numHtml = parseNode($, child);
      } else if (cName.endsWith(':den') || cName === 'den') {
        denHtml = parseNode($, child);
      }
    });
    return `(${numHtml}/${denHtml})`;
  }

  if (tagName === 'm:oMath' || tagName.endsWith(':oMath')) {
    let mathText = '';
    $(node).children().each((_, child) => {
      mathText += parseNode($, child);
    });
    return ` ${mathText.trim()} `;
  }

  let childText = '';
  $(node).children().each((_, child) => {
    childText += parseNode($, child);
  });
  return childText;
}

function parseDocxQuestions(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const zip = new AdmZip(fileBuffer);
  const xmlContent = zip.readAsText('word/document.xml');
  const $ = cheerio.load(xmlContent, { xmlMode: true });

  const rawParagraphs = [];
  $('w\\:p').each((_, pElem) => {
    const rawXml = $.html(pElem);
    const htmlText = parseNode($, pElem).trim();
    if (htmlText) {
      rawParagraphs.push({ htmlText, rawXml });
    }
  });

  const questions = [];
  let currentQ = null;

  for (let i = 0; i < rawParagraphs.length; i++) {
    const { htmlText, rawXml } = rawParagraphs[i];
    const plainText = htmlText.replace(/<[^>]*>/g, '').trim();

    const explicitStart = plainText.match(/^Question\s+(\d+)[:\s]*(.*)/i) || plainText.match(/^Q(\d+)\.?\s*(.*)/i);
    const numericStart = plainText.match(/^(\d+)[\.\)]\s*(.*)/);

    let isNewQ = false;
    let match = null;

    if (explicitStart) {
      isNewQ = true;
      match = explicitStart;
    } else if (numericStart) {
      const isNotOption = !plainText.match(/^[A-F][\.\)]/i) &&
                          !plainText.startsWith('Answer:') &&
                          !plainText.startsWith('Ans:') &&
                          !plainText.startsWith('Explanation:');
      if (isNotOption) {
        if (!currentQ) {
          isNewQ = true;
          match = numericStart;
        } else {
          const hasOptions = Object.keys(currentQ.options).length > 0;
          const hasAnswer = currentQ.answer !== '';
          if (hasOptions || hasAnswer) {
            isNewQ = true;
            match = numericStart;
          }
        }
      }
    }

    if (isNewQ && match) {
      if (currentQ) {
        questions.push(currentQ);
      }
      const num = match[1];
      const rest = htmlText.replace(/^\s*(?:<b>|<i>)?\s*(?:Question\s+\d+[:\s]*|Q\d+\.?\s*|\d+[\.\)])\s*(?:<\/b>|<\/i>)?\s*/i, '').trim();
      currentQ = {
        num,
        textLines: rest ? [rest] : [],
        rawXmls: [rawXml],
        options: {},
        answer: ''
      };
      continue;
    }

    if (!currentQ) continue;

    const optionMatch = plainText.match(/^\s*([A-F])[\.\)]\s*(.*)/i);
    if (optionMatch) {
      const optLetter = optionMatch[1].toUpperCase();
      const optVal = htmlText.replace(/^\s*(?:<b>|<i>)?\s*[A-F][\.\)]\s*(?:<\/b>|<\/i>)?\s*/i, '').trim();
      currentQ.options[optLetter] = optVal;
      currentQ.rawXmls.push(rawXml);
      continue;
    }

    const answerMatch = plainText.match(/^(?:Correct\s+)?Answer[s]?:\s*([A-F])/i) ||
                        plainText.match(/^(?:Correct\s+)?Ans:\s*([A-F])/i) ||
                        plainText.match(/^Correct:\s*([A-F])/i);
    if (answerMatch) {
      currentQ.answer = answerMatch[1].toUpperCase();
      continue;
    }

    if (Object.keys(currentQ.options).length === 0) {
      currentQ.textLines.push(htmlText);
      currentQ.rawXmls.push(rawXml);
    }
  }

  if (currentQ) {
    questions.push(currentQ);
  }

  return questions;
}

function hasEquation(question) {
  const combinedXml = question.rawXmls.join(' ');
  const combinedHtml = question.textLines.join(' ') + ' ' + Object.values(question.options).join(' ');

  if (/m:oMath|m:f|m:sSub|m:sSup|m:rad|w:drawing/i.test(combinedXml)) {
    return true;
  }

  if (/<sub>|<sup>|&sum;|[∑∫πΩωδθ]|e\^|W_N|X\(k\)|x\(n\)|H\(z\)|=|\+|\*|\//i.test(combinedHtml)) {
    return true;
  }

  return false;
}

function renderQuestionCardToImage(question, filePrefix, index) {
  const filename = `q_${filePrefix}_${Date.now()}_${index}.png`;
  const tempHtmlPath = path.join(__dirname, `temp_${filePrefix}_${Date.now()}_${index}.html`);
  const outputPngPath = path.join(uploadsDir, filename);

  const questionContent = question.textLines.join('<br>');

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
    .badge {
      display: inline-block;
      background: #0f766e;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      padding: 5px 14px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 16px;
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
      const optKeys = Object.keys(question.options);
      if (optKeys.length === 0) return '';
      const items = optKeys.map(key => {
        const val = question.options[key];
        return `<div class="option-item"><span class="option-key">${key})</span><span class="option-val">${val}</span></div>`;
      }).join('');
      return `<div class="options-container">${items}</div>`;
    })()}
  </div>
</body>
</html>
`;

  const textChars = questionContent.replace(/<[^>]*>/g, "").length;
  const lineEstimate = Math.ceil(textChars / 70) + question.textLines.length;

  const optKeys = Object.keys(question.options);
  let optionsHeightSum = 0;
  optKeys.forEach((key) => {
    const valText = (question.options[key] || "").replace(/<[^>]*>/g, "");
    const optLines = Math.ceil(valText.length / 65) || 1;
    optionsHeightSum += optLines * 38 + 24;
  });

  const estimatedHeight = Math.min(1150, Math.max(360, lineEstimate * 32 + optionsHeightSum + 110));

  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

  try {
    const cmd = `"${edgePath}" --headless --hide-scrollbars --disable-gpu --screenshot="${outputPngPath}" --window-size=960,${estimatedHeight} "${tempHtmlPath}"`;
    execSync(cmd);
  } catch (err) {
    console.error('Failed edge screenshot for question', index, err);
  } finally {
    if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
  }

  return `/uploads/question_images/${filename}`;
}

async function run() {
  console.log('===================================================');
  console.log('Re-Importing All Resolved DSP Question Banks (High Res)');
  console.log('===================================================');

  const subject = await prisma.subject.findFirst({ where: { name: 'DSP' } });
  if (!subject) {
    console.error('Subject DSP not found in database.');
    return;
  }

  const teacher = await prisma.teacher.findFirst();
  if (!teacher) {
    console.error('Teacher not found in database.');
    return;
  }

  // Delete previous combined tests
  const oldTests = await prisma.test.findMany({
    where: {
      OR: [
        { title: { contains: 'Preview' } },
        { title: { contains: 'Resolved DSP Comprehensive Practice Test' } },
        { title: { contains: 'DFT Complex Image Preview Test' } },
        { title: { contains: 'Resolved DFT Complex Test' } }
      ]
    }
  });

  for (const t of oldTests) {
    await prisma.testQbRule.deleteMany({ where: { testId: t.id } });
    await prisma.enrollment.deleteMany({ where: { testId: t.id } });
    await prisma.test.delete({ where: { id: t.id } });
    console.log(`Removed old test: ${t.title}`);
  }

  const createdTestSummaries = [];

  for (const item of filesToProcess) {
    const filePath = path.join(folderPath, item.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}, skipping.`);
      continue;
    }

    const moduleObj = await prisma.module.findFirst({
      where: { subjectId: subject.id, name: item.moduleName }
    });
    if (!moduleObj) {
      console.warn(`Module ${item.moduleName} not found, skipping file ${item.file}.`);
      continue;
    }

    let qb = await prisma.questionBank.findFirst({
      where: { moduleId: moduleObj.id, name: item.qbName }
    });

    if (!qb) {
      qb = await prisma.questionBank.create({
        data: {
          moduleId: moduleObj.id,
          name: item.qbName,
          type: 'hard'
        }
      });
      console.log(`Created new Question Bank: '${item.qbName}' (ID: ${qb.id})`);
    } else {
      console.log(`Using existing Question Bank: '${item.qbName}' (ID: ${qb.id})`);
    }

    // Clear previous questions in this QB
    const existingQuestions = await prisma.question.findMany({ where: { qbId: qb.id }, select: { id: true } });
    if (existingQuestions.length > 0) {
      const qIds = existingQuestions.map(q => q.id);
      await prisma.mcqOption.deleteMany({ where: { questionId: { in: qIds } } });
      await prisma.question.deleteMany({ where: { id: { in: qIds } } });
      console.log(`Cleared ${existingQuestions.length} existing questions from '${item.qbName}'.`);
    }

    const parsed = parseDocxQuestions(filePath);
    let imageCount = 0;
    let textCount = 0;

    const cleanPrefix = item.file.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 15);

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      const isEquation = hasEquation(q);

      const correctLetter = q.answer || 'A';
      const correctIndex = ['A', 'B', 'C', 'D', 'E'].indexOf(correctLetter);
      const finalCorrectIdx = correctIndex !== -1 ? correctIndex : 0;

      if (isEquation) {
        imageCount++;
        const imgUrl = renderQuestionCardToImage(q, cleanPrefix, i);

        const optionsData = ['A', 'B', 'C', 'D'].map((label, idx) => ({
          optionText: label,
          scorePercent: idx === finalCorrectIdx ? 100 : 0
        }));

        await prisma.question.create({
          data: {
            qbId: qb.id,
            type: 'MCQ',
            questionText: '',
            imageUrl: imgUrl,
            mcqOptions: {
              create: optionsData
            }
          }
        });
      } else {
        textCount++;
        const optKeys = Object.keys(q.options);
        const optionsData = (optKeys.length > 0 ? optKeys : ['A', 'B', 'C', 'D']).map((letter, idx) => {
          const textVal = q.options[letter] || letter;
          return {
            optionText: textVal,
            scorePercent: letter === correctLetter || (idx === finalCorrectIdx) ? 100 : 0
          };
        });

        if (!optionsData.some(o => o.scorePercent > 0)) {
          optionsData[0].scorePercent = 100;
        }

        await prisma.question.create({
          data: {
            qbId: qb.id,
            type: 'MCQ',
            questionText: q.textLines.join(' ') || `Question ${i + 1}`,
            imageUrl: null,
            mcqOptions: {
              create: optionsData
            }
          }
        });
      }
    }

    console.log(`-> ${item.qbName}: Total ${parsed.length} imported (${imageCount} Image/Equation, ${textCount} Pure Text)`);

    // Create an INDIVIDUAL test for this Question Bank with NO SHUFFLING
    const testTitle = item.qbName;
    const test = await prisma.test.create({
      data: {
        teacherId: teacher.id,
        title: testTitle,
        enrollmentKey: item.key,
        startTime: new Date(),
        endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        durationMinutes: 60,
        totalMarks: parsed.length * 2,
        useFullscreen: false,
        logActivities: false,
        preventCopyPaste: false,
        saveAttempts: true,
        infiniteTries: true,
        resultsReveal: true
      }
    });

    await prisma.testQbRule.create({
      data: {
        testId: test.id,
        qbId: qb.id,
        questionsToPick: parsed.length, // Include all questions in exact order!
        marksPerQuestion: 2,
        randomQuestions: false, // NO SHUFFLING OF QUESTIONS!
        randomOrder: false,     // NO SHUFFLING OF QUESTION ORDER!
        uniqueQuestions: false,
        shuffleOptions: false   // NO SHUFFLING OF OPTIONS!
      }
    });

    createdTestSummaries.push({
      qbName: item.qbName,
      testTitle: test.title,
      enrollmentKey: item.key,
      totalQuestions: parsed.length
    });
  }

  console.log('\n===================================================');
  console.log('ALL INDIVIDUAL PREVIEW TESTS CREATED SUCCESSFULLY!');
  console.log('===================================================');
  for (const t of createdTestSummaries) {
    console.log(`QB Name:        ${t.qbName}`);
    console.log(`Test Title:     ${t.testTitle}`);
    console.log(`Enrollment Key: ${t.enrollmentKey}`);
    console.log(`Questions Count:${t.totalQuestions} (Strict Order 1..N)`);
    console.log('---------------------------------------------------');
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
