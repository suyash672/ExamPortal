import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const qbs = await prisma.questionBank.findMany({
    include: {
      _count: {
        select: { questions: true }
      }
    }
  });

  console.log(JSON.stringify(qbs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
