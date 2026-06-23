import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import http from 'http';

const prisma = new PrismaClient();

async function main() {
  // Find any teacher
  const teacher = await prisma.teacher.findFirst();
  if (!teacher) {
    console.log("No teacher found in DB.");
    return;
  }

  // Generate a token just like auth.controller.ts does
  const accessToken = jwt.sign(
    { userId: teacher.id, role: "TEACHER" },
    process.env.JWT_SECRET || "supersecret",
    { expiresIn: "1h" }
  );

  // Find a question bank with questions
  const qb = await prisma.questionBank.findFirst({
    where: {
      module: {
        subject: {
          teacherId: teacher.id
        }
      }
    },
    include: {
      _count: {
        select: { questions: true }
      }
    }
  });

  if (!qb) {
    console.log("No Question Bank found for teacher.");
    return;
  }

  console.log(`Using QB: ${qb.id}, Questions: ${qb._count.questions}`);

  // Construct payload
  const payload = JSON.stringify({
    title: "Test API",
    enrollmentKey: "test1234",
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    durationMinutes: 60,
    qbRules: [
      {
        qbId: qb.id,
        questionsToPick: 1,
        marksPerQuestion: 1
      }
    ]
  });

  const req = http.request("http://localhost:4000/api/tests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Response: ${data}`);
    });
  });

  req.on('error', error => {
    console.error(error);
  });

  req.write(payload);
  req.end();
}

main().catch(console.error).finally(() => prisma.$disconnect());
