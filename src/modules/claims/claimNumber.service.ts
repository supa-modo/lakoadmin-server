import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

type ClaimNumberClient = Prisma.TransactionClient | typeof prisma;

export async function generateClaimNumber(client: ClaimNumberClient = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CLM-${year}-`;
  const lockKey = `${20260430}${year}`;

  await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;

  const latest = await client.claim.findFirst({
    where: { claimNumber: { startsWith: prefix } },
    orderBy: { claimNumber: 'desc' },
    select: { claimNumber: true },
  });

  const next = latest?.claimNumber
    ? Number(latest.claimNumber.replace(prefix, '')) + 1
    : 1;

  return `${prefix}${String(next).padStart(6, '0')}`;
}
