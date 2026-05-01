import assert from 'node:assert/strict';
import { canTransition, assertValidTransition } from './claimWorkflow.service';
import { createClaimSchema, settlementSchema, updateClaimStatusSchema } from './claims.validation';
import { prisma } from '../../config/database';
import { generateClaimNumber } from './claimNumber.service';

function expectInvalidTransition(from: any, to: any) {
  assert.equal(canTransition(from, to), false);
  assert.throws(() => assertValidTransition(from, to), /Invalid claim status transition/);
}

assert.equal(canTransition('REPORTED', 'REGISTERED'), true);
assert.equal(canTransition('REGISTERED', 'DOCUMENTS_PENDING'), true);
assert.equal(canTransition('DOCUMENTS_PENDING', 'DOCUMENTS_COMPLETE'), true);
assert.equal(canTransition('DOCUMENTS_COMPLETE', 'SUBMITTED_TO_INSURER'), true);
assert.equal(canTransition('SUBMITTED_TO_INSURER', 'UNDER_REVIEW'), true);
assert.equal(canTransition('UNDER_REVIEW', 'ASSESSED'), true);
assert.equal(canTransition('ASSESSED', 'APPROVED'), true);
assert.equal(canTransition('APPROVED', 'SETTLEMENT_PENDING'), true);
assert.equal(canTransition('SETTLEMENT_PENDING', 'SETTLED'), true);
assert.equal(canTransition('SETTLED', 'CLOSED'), true);
assert.equal(canTransition('REJECTED', 'APPEAL'), true);
assert.equal(canTransition('APPEAL', 'UNDER_REVIEW'), true);

expectInvalidTransition('REPORTED', 'SETTLED');
expectInvalidTransition('DOCUMENTS_PENDING', 'SUBMITTED_TO_INSURER');
expectInvalidTransition('REJECTED', 'SETTLEMENT_PENDING');
expectInvalidTransition('CLOSED', 'UNDER_REVIEW');
expectInvalidTransition('VOIDED', 'REGISTERED');

assert.doesNotThrow(() => updateClaimStatusSchema.parse({ status: 'VOIDED', reason: 'Duplicate claim opened in error' }));
assert.throws(() => updateClaimStatusSchema.parse({ status: 'INVALID' }), /Invalid enum value/);

const claimInput = createClaimSchema.parse({
  policyId: '11111111-1111-4111-8111-111111111111',
  claimantName: 'Jane Claimant',
  dateOfLoss: '2026-04-30',
  lossType: 'Motor accident',
  lossDescription: 'Rear impact accident at insured location',
  overridePolicyEligibility: true,
  overrideReason: 'Authorized exception after manager review',
  acknowledgeDuplicateWarning: true,
});
assert.equal(claimInput.acknowledgeDuplicateWarning, true);
assert.equal(claimInput.overridePolicyEligibility, true);

const settlementInput = settlementSchema.parse({
  amount: 1000,
  status: 'EXPECTED',
  allowPreApprovalSettlement: true,
  overrideApprovedAmount: true,
  overrideReason: 'Urgent ex-gratia settlement approved by management',
});
assert.equal(settlementInput.overrideApprovedAmount, true);

async function runDbSmoke() {
  if (process.env.CLAIMS_DB_SMOKE !== '1') return;
  const nextNumber = await prisma.$transaction((tx) => generateClaimNumber(tx));
  assert.match(nextNumber, /^CLM-\d{4}-\d{6}$/);
}

runDbSmoke()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Claims edge-case tests passed');
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    throw error;
  });
