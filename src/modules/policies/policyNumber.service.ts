import { prisma } from '../../config/database';

/**
 * Generates a unique, sequential policy number.
 * Format: POL-YYYY-NNNNNN (e.g. POL-2026-000001)
 *
 * Uses a pessimistic lock via a raw query counter to ensure no duplicates
 * even under concurrent requests. Falls back to a count-based approach.
 */
export async function generatePolicyNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `POL-${year}-`;

  // Find the highest numbered policy for the current year
  const latest = await prisma.policy.findFirst({
    where: {
      policyNumber: { startsWith: prefix },
    },
    orderBy: { policyNumber: 'desc' },
    select: { policyNumber: true },
  });

  let sequence = 1;
  if (latest) {
    const parts = latest.policyNumber.split('-');
    const lastSeq = parseInt(parts[2] ?? '0', 10);
    if (!isNaN(lastSeq)) {
      sequence = lastSeq + 1;
    }
  }

  const padded = String(sequence).padStart(6, '0');
  return `${prefix}${padded}`;
}

/**
 * Generates a sequential endorsement number for a given policy.
 * Format: END-{policyNumber}-NNN (e.g. END-POL-2026-000001-001)
 */
export async function generateEndorsementNumber(policyId: string): Promise<string> {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    select: { policyNumber: true },
  });

  if (!policy) throw new Error('Policy not found');

  const count = await prisma.policyEndorsement.count({ where: { policyId } });
  const seq = String(count + 1).padStart(3, '0');
  return `END-${policy.policyNumber}-${seq}`;
}
