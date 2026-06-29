import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

const folderPath = "c:/Users/Onkar/Desktop/Work@SPTBI/ExamPortal/samplequestions/DSP Resolvable";
const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".docx"));

for (const file of files) {
  const filePath = path.join(folderPath, file);
  const fileBuffer = fs.readFileSync(filePath);
  
  const zip = new AdmZip(fileBuffer);
  const xmlContent = zip.readAsText("word/document.xml");
  const $ = cheerio.load(xmlContent, { xmlMode: true });

  const drawingsCount = $("w\\:drawing").length;
  const pictCount = $("w\\:pict").length;
  const objectCount = $("w\\:object").length;
  const oMathCount = $("m\\:oMath").length;

  console.log(`FILE: ${file}`);
  console.log(`  w:drawing: ${drawingsCount}`);
  console.log(`  w:pict: ${pictCount}`);
  console.log(`  w:object: ${objectCount}`);
  console.log(`  m:oMath: ${oMathCount}`);
}
