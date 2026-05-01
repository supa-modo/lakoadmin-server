import { ClaimStatus } from '@prisma/client';

export const transitionMap: Record<ClaimStatus, ClaimStatus[]> = {
  REPORTED: ['REGISTERED', 'WITHDRAWN', 'VOIDED'],
  REGISTERED: ['DOCUMENTS_PENDING', 'DOCUMENTS_COMPLETE', 'WITHDRAWN', 'VOIDED'],
  DOCUMENTS_PENDING: ['DOCUMENTS_COMPLETE', 'WITHDRAWN', 'VOIDED'],
  DOCUMENTS_COMPLETE: ['SUBMITTED_TO_INSURER', 'WITHDRAWN', 'VOIDED'],
  SUBMITTED_TO_INSURER: ['UNDER_REVIEW', 'WITHDRAWN', 'VOIDED'],
  UNDER_REVIEW: ['ADDITIONAL_INFO_REQUESTED', 'ASSESSED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'VOIDED'],
  ADDITIONAL_INFO_REQUESTED: ['DOCUMENTS_PENDING', 'UNDER_REVIEW', 'WITHDRAWN', 'VOIDED'],
  ASSESSED: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'WITHDRAWN', 'VOIDED'],
  APPROVED: ['SETTLEMENT_PENDING', 'WITHDRAWN', 'VOIDED'],
  PARTIALLY_APPROVED: ['SETTLEMENT_PENDING', 'WITHDRAWN', 'VOIDED'],
  REJECTED: ['APPEAL', 'CLOSED', 'VOIDED'],
  APPEAL: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'VOIDED'],
  SETTLEMENT_PENDING: ['PARTIALLY_SETTLED', 'SETTLED', 'VOIDED'],
  PARTIALLY_SETTLED: ['SETTLED', 'VOIDED'],
  SETTLED: ['CLOSED'],
  CLOSED: [],
  WITHDRAWN: [],
  VOIDED: [],
};

export function assertValidTransition(from: ClaimStatus, to: ClaimStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new Error(`Invalid claim status transition from ${from} to ${to}`);
  }
}

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  if (from === to) return true;
  return (transitionMap[from] ?? []).includes(to);
}

export function isFinalClaimStatus(status: ClaimStatus): boolean {
  return ['CLOSED', 'WITHDRAWN', 'VOIDED'].includes(status);
}

export function statusTimestampField(status: ClaimStatus): string | null {
  const map: Partial<Record<ClaimStatus, string>> = {
    SUBMITTED_TO_INSURER: 'submittedToInsurerAt',
    ASSESSED: 'assessedAt',
    APPROVED: 'approvedAt',
    PARTIALLY_APPROVED: 'approvedAt',
    REJECTED: 'rejectedAt',
    SETTLED: 'settledAt',
    CLOSED: 'closedAt',
    WITHDRAWN: 'withdrawnAt',
    VOIDED: 'voidedAt',
  };
  return map[status] ?? null;
}
