import { PrismaClient } from "@prisma/client";

export async function resetDatabase(prisma: PrismaClient) {
  await prisma.recordSnapshot.deleteMany();
  await prisma.recordTag.deleteMany();
  await prisma.record.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
}
