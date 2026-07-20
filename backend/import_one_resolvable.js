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

    // Append to question text
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

  // Check for XML math tags or drawing tags
  if (/m:oMath|m:f|m:sSub|m:sSup|m:rad|w:drawing/i.test(combinedXml)) {
    return true;
  }

  // Check for common math symbols or equation syntax
  if (/<sub>|<sup>|&sum;|[∑∫πΩωδθ]|e\^|W_N|X\(k\)|x\(n\)|H\(z\)|=|\+|\*|\//i.test(combinedHtml)) {
    return true;
  }

  return false;
}

function renderQuestionCardToImage(question, index) {
  const filename = `q_complex_${Date.now()}_${index}.png`;
  const tempHtmlPath = path.join(__dirname, `temp_${Date.now()}_${index}.html`);
  const outputPngPath = path.join(uploadsDir, filename);

  const questionContent = question.textLines.join('<br>');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Segoe UI', -apple-system, system-ui, Roboto, sans-serif;
      background: transparent;
      margin: 0;
      padding: 16px;
      width: 680px;
    }
    .card {
      background: #ffffff;
      border: 2px solid #e2e8f0;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      color: #0f172a;
    }
    .badge {
      display: inline-block;
      background: #0f766e;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }
    .question-text {
      font-size: 17px;
      line-height: 1.6;
      font-weight: 600;
      color: #1e293b;
    }
    sub { font-size: 0.75em; vertical-align: sub; }
    sup { font-size: 0.75em; vertical-align: super; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Question #${index + 1}</div>
    <div class="question-text">${questionContent}</div>
  </div>
</body>
</html>
`;

  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

  try {
    const cmd = `"${edgePath}" --headless --disable-gpu --screenshot="${outputPngPath}" --window-size=740,360 "${tempHtmlPath}"`;
    execSync(cmd);
  } catch (err) {
    console.error('Failed edge screenshot for question', index, err);
  } finally {
    if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
  }

  return `/uploads/question_images/${filename}`;
}

async function run() {
  console.log('--- Importing 1 Test File: Comlex question answers DFT.docx ---');
  const docxPath = path.join(__dirname, '../samplequestions/DSP Resolvable/Comlex question answers DFT.docx');

  // Find or create Subject "DSP" -> Module "DFT" -> QuestionBank "DFT Complex"
  const subject = await prisma.subject.findFirst({ where: { name: 'DSP' } });
  if (!subject) {
    console.error('Subject DSP not found in database.');
    return;
  }

  const moduleObj = await prisma.module.findFirst({
    where: { subjectId: subject.id, name: 'DFT' }
  });
  if (!moduleObj) {
    console.error('Module DFT not found in database.');
    return;
  }

  let qb = await prisma.questionBank.findFirst({
    where: { moduleId: moduleObj.id, name: 'DFT Complex' }
  });

  if (!qb) {
    qb = await prisma.questionBank.create({
      data: {
        moduleId: moduleObj.id,
        name: 'DFT Complex',
        description: 'Hard & Complex Level Questions for DFT Module',
        type: 'hard'
      }
    });
    console.log('Created new Question Bank: DFT Complex');
  } else {
    console.log('Found existing Question Bank: DFT Complex (ID:', qb.id, ')');
  }

  // Clear previous questions in DFT Complex to ensure clean test import
  const existingQuestions = await prisma.question.findMany({ where: { qbId: qb.id }, select: { id: true } });
  if (existingQuestions.length > 0) {
    const qIds = existingQuestions.map(q => q.id);
    await prisma.mcqOption.deleteMany({ where: { questionId: { in: qIds } } });
    await prisma.question.deleteMany({ where: { id: { in: qIds } } });
    console.log(`Cleared ${existingQuestions.length} existing questions from QB 'DFT Complex'.`);
  }

  const parsed = parseDocxQuestions(docxPath);
  console.log(`Parsed ${parsed.length} total questions from file.`);

  let imageQuestionCount = 0;
  let textQuestionCount = 0;

  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    const isEquation = hasEquation(q);

    const correctLetter = q.answer || 'A';
    const correctIndex = ['A', 'B', 'C', 'D', 'E'].indexOf(correctLetter);
    const finalCorrectIdx = correctIndex !== -1 ? correctIndex : 0;

    if (isEquation) {
      imageQuestionCount++;
      const imgUrl = renderQuestionCardToImage(q, i);

      // Create Image-Only Question with Default Options (A, B, C, D)
      const optionsData = ['A', 'B', 'C', 'D'].map((label, idx) => ({
        optionText: label,
        scorePercent: idx === finalCorrectIdx ? 100 : 0
      }));

      await prisma.question.create({
        data: {
          qbId: qb.id,
          type: 'MCQ',
          questionText: '', // Image-only layout
          imageUrl: imgUrl,
          mcqOptions: {
            create: optionsData
          }
        }
      });
      console.log(`[Q${i + 1}] Math Equation Detected -> Created Image Question with Default Options (A/B/C/D). Correct: ${['A','B','C','D'][finalCorrectIdx]}`);
    } else {
      textQuestionCount++;
      // Create standard text question with text options
      const optKeys = Object.keys(q.options);
      const optionsData = (optKeys.length > 0 ? optKeys : ['A', 'B', 'C', 'D']).map((letter, idx) => {
        const textVal = q.options[letter] || letter;
        return {
          optionText: textVal,
          scorePercent: letter === correctLetter || (idx === finalCorrectIdx) ? 100 : 0
        };
      });

      // Ensure at least one correct option
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
      console.log(`[Q${i + 1}] Pure Text Question -> Created Standard Text Question.`);
    }
  }

  console.log('===================================================');
  console.log('Single File Import Complete!');
  console.log(`Question Bank:     DFT Complex (${qb.id})`);
  console.log(`Total Imported:    ${parsed.length}`);
  console.log(`Image Questions:   ${imageQuestionCount} (Equations/Math)`);
  console.log(`Text Questions:    ${textQuestionCount} (Pure Text)`);
  console.log('===================================================');

  // Create a preview test using this Question Bank
  const teacher = await prisma.teacher.findFirst();
  if (!teacher) {
    console.error('No teacher found for test creation.');
    return;
  }

  const testTitle = 'DFT Complex Image Preview Test';
  const existingTest = await prisma.test.findFirst({ where: { title: testTitle } });
  if (existingTest) {
    await prisma.testQbRule.deleteMany({ where: { testId: existingTest.id } });
    await prisma.enrollment.deleteMany({ where: { testId: existingTest.id } });
    await prisma.test.delete({ where: { id: existingTest.id } });
  }

  const questionsToPick = Math.min(parsed.length, 10);

  const sampleTest = await prisma.test.create({
    data: {
      teacherId: teacher.id,
      title: testTitle,
      enrollmentKey: 'dft123',
      startTime: new Date(),
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      durationMinutes: 30,
      totalMarks: questionsToPick * 2,
      useFullscreen: true,
      logActivities: true,
      preventCopyPaste: true,
      saveAttempts: true,
      infiniteTries: true,
      resultsReveal: true
    }
  });

  await prisma.testQbRule.create({
    data: {
      testId: sampleTest.id,
      qbId: qb.id,
      questionsToPick,
      marksPerQuestion: 2,
      randomQuestions: false,
      randomOrder: false,
      uniqueQuestions: false,
      shuffleOptions: false
    }
  });

  console.log('===================================================');
  console.log('Preview Test Created Successfully!');
  console.log(`Test Title:       ${sampleTest.title}`);
  console.log(`Test ID:          ${sampleTest.id}`);
  console.log(`Enrollment Key:   dft123`);
  console.log(`Questions Picked: ${questionsToPick}`);
  console.log(`Preview Route:    /api/student/attempt/preview-${sampleTest.id}`);
  console.log('===================================================');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
