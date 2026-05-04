import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Decimal } from '@prisma/client/runtime/client';

async function main() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    console.log('Workflow integration tests skipped: set TEST_DATABASE_URL to a disposable PostgreSQL database.');
    return;
  }

  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = 'test';
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });

  const { prisma } = await import('../config/database');
  const { recordPayment, recordDirectInsurerPayment, verifyDirectInsurerPayment } = await import('../modules/payments/payments.service');
  const { getPolicyActivationReadiness } = await import('../modules/policies/policies.service');
  const { createClaimQuery, respondClaimQuery, submitClaimQueryToInsurer, closeClaimQuery } = await import('../modules/claims/claims.service');
  const { runRenewalReminderScan } = await import('../modules/renewals/renewalReminder.service');

  const tag = `wf-${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      email: `${tag}@lako.test`,
      password: 'test',
      firstName: 'Workflow',
      lastName: 'Tester',
      refreshTokens: [],
    },
  });

  async function createCorePolicy(suffix: string, totalPremium = 100000, overrides: Record<string, unknown> = {}) {
    const client = await prisma.client.create({
      data: {
        clientNumber: `TCL-${suffix}`,
        type: 'INDIVIDUAL',
        firstName: 'Achieng',
        lastName: `Test ${suffix}`,
        email: `${tag}-${suffix}@client.test`,
        phone: '+254700000001',
        county: 'Nairobi',
        createdById: user.id,
      },
    });
    const insurer = await prisma.insurer.create({
      data: {
        name: `Jubilee Test ${suffix}`,
        shortName: `JUB-${suffix}`,
        iraClassifications: ['MOTOR_PRIVATE'],
        createdById: user.id,
      },
    });
    const product = await prisma.product.create({
      data: {
        insurerId: insurer.id,
        code: `MOTOR-${suffix}`,
        name: `Motor Comprehensive ${suffix}`,
        insuranceClass: 'MOTOR_PRIVATE',
        category: 'Motor',
        eligibleClientTypes: ['INDIVIDUAL'],
        policyDurations: ['12 months'],
        paymentOptions: ['ANNUAL'],
        requiredDocuments: ['ID', 'KRA_PIN'],
        createdById: user.id,
      },
    });
    const policy = await prisma.policy.create({
      data: {
        policyNumber: `POL-${suffix}`,
        clientId: client.id,
        insurerId: insurer.id,
        productId: product.id,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        basePremium: new Decimal(totalPremium),
        totalPremium: new Decimal(totalPremium),
        totalPremiumAmount: new Decimal(totalPremium),
        outstandingAmount: new Decimal(totalPremium),
        outstandingPremiumAmount: new Decimal(totalPremium),
        status: 'PENDING_PAYMENT',
        underwritingStatus: 'APPROVED',
        commissionSettlementMode: 'PAID_BY_INSURER',
        createdById: user.id,
        ...overrides,
      } as any,
    });
    return { client, insurer, product, policy };
  }

  async function assertJournalsBalance() {
    const entries = await prisma.journalEntry.findMany({ include: { lines: true } });
    for (const entry of entries) {
      const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);
      assert.equal(debit.toFixed(2), credit.toFixed(2), `Journal ${entry.entryNumber} is unbalanced`);
    }
  }

  const broker = await createCorePolicy('BROKER', 120000);
  const payment = await recordPayment({
    clientId: broker.client.id,
    amount: 120000,
    currency: 'KES',
    premiumCollectionMode: 'BROKER_COLLECTED',
    method: 'BANK_TRANSFER',
    reference: `BANK-${tag}`,
    paymentDate: '2026-05-02',
    autoVerify: true,
    allocations: [{ policyId: broker.policy.id, amount: 120000 }],
  }, user.id);
  assert.equal(payment.receipt?.clientName.includes('Achieng'), true);
  assert.equal((await prisma.commissionEntry.count({ where: { policyId: broker.policy.id, agentId: null } })), 1);

  const direct = await createCorePolicy('DIRECT', 80000, { premiumCollectionMode: 'DIRECT_TO_INSURER', premiumPaidTo: 'INSURER' });
  const proof = await prisma.document.create({
    data: {
      entityType: 'POLICY',
      entityId: direct.policy.id,
      clientId: direct.client.id,
      policyId: direct.policy.id,
      insurerId: direct.insurer.id,
      type: 'PROOF_OF_PAYMENT',
      documentType: 'PROOF_OF_PAYMENT',
      category: 'PAYMENTS',
      name: 'Direct proof.pdf',
      fileUrl: 'memory://direct-proof.pdf',
      fileSize: 100,
      mimeType: 'application/pdf',
      tags: ['test'],
      createdById: user.id,
    },
  });
  const beforeCashPayments = await prisma.payment.count();
  const directPayment = await recordDirectInsurerPayment({
    policyId: direct.policy.id,
    amount: 80000,
    currency: 'KES',
    paymentDate: '2026-05-02',
    method: 'BANK_TRANSFER',
    insurerReference: `INS-${tag}`,
    proofOfPaymentDocumentId: proof.id,
    verificationStatus: 'UNVERIFIED',
    generateAcknowledgement: true,
  }, user.id);
  await verifyDirectInsurerPayment(directPayment.id, { verificationStatus: 'VERIFIED' }, user.id);
  assert.equal(await prisma.payment.count(), beforeCashPayments, 'Direct insurer flow must not create broker cash payment');
  assert.equal((await prisma.directInsurerPayment.findUniqueOrThrow({ where: { id: directPayment.id } })).accountingPostedStatus, 'POSTED');

  const mixed = await createCorePolicy('MIXED', 100000);
  await recordPayment({
    clientId: mixed.client.id,
    amount: 40000,
    currency: 'KES',
    premiumCollectionMode: 'MIXED',
    method: 'BANK_TRANSFER',
    reference: `MIX-BANK-${tag}`,
    paymentDate: '2026-05-02',
    autoVerify: true,
    allocations: [{ policyId: mixed.policy.id, amount: 40000 }],
  }, user.id);
  const mixedDirect = await recordDirectInsurerPayment({
    policyId: mixed.policy.id,
    amount: 60000,
    currency: 'KES',
    paymentDate: '2026-05-02',
    method: 'BANK_TRANSFER',
    insurerReference: `MIX-INS-${tag}`,
    verificationStatus: 'VERIFIED',
    generateAcknowledgement: true,
  }, user.id);
  assert.ok(mixedDirect.id);
  const mixedPolicy = await prisma.policy.findUniqueOrThrow({ where: { id: mixed.policy.id } });
  assert.equal(Number(mixedPolicy.outstandingAmount), 0);
  assert.equal((await prisma.commissionEntry.count({ where: { policyId: mixed.policy.id, agentId: null } })), 1);

  const readinessBlocked = await getPolicyActivationReadiness(direct.policy.id);
  assert.equal(readinessBlocked.ready, false);

  const claim = await prisma.claim.create({
    data: {
      claimNumber: `CLM-${tag}`,
      policyId: broker.policy.id,
      clientId: broker.client.id,
      insurerId: broker.insurer.id,
      productId: broker.product.id,
      claimantName: 'Achieng Test',
      dateOfLoss: new Date('2026-04-20T00:00:00.000Z'),
      dateReported: new Date('2026-04-21T00:00:00.000Z'),
      lossType: 'Accident',
      lossDescription: 'Workflow test claim',
      amountClaimed: new Decimal(50000),
      status: 'SUBMITTED_TO_INSURER',
      createdById: user.id,
    },
  });
  const query = await createClaimQuery(claim.id, { source: 'INSURER', queryType: 'DOCUMENT_REQUEST', queryText: 'Please share police abstract' }, user.id);
  assert.equal((await prisma.task.count({ where: { claimQueryId: query.id } })), 1);
  await respondClaimQuery(claim.id, query.id, { responseSource: 'CLIENT', responseText: 'Police abstract attached', documentIds: [] }, user.id);
  await submitClaimQueryToInsurer(claim.id, query.id, user.id);
  await closeClaimQuery(claim.id, query.id, user.id);
  assert.equal((await prisma.claimQuery.findUniqueOrThrow({ where: { id: query.id } })).status, 'CLOSED');

  const expiring = await createCorePolicy('RENEW30', 50000, { status: 'ACTIVE', endDate: new Date('2026-06-01T12:00:00.000Z') });
  const firstRun = await runRenewalReminderScan(new Date('2026-05-02T09:00:00.000Z'), user.id);
  const secondRun = await runRenewalReminderScan(new Date('2026-05-02T09:00:00.000Z'), user.id);
  assert.equal(firstRun.cadences[30].created >= 1, true);
  assert.equal(secondRun.cadences[30].created, 0);
  assert.equal(await prisma.renewalReminderLog.count({ where: { policyId: expiring.policy.id, cadenceDays: 30 } }), 1);

  await assertJournalsBalance();
  await prisma.$disconnect();
  console.log('Workflow integration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
