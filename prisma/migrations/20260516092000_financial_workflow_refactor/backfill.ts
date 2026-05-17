/**
 * Data backfill script for financial workflow refactor
 * 
 * This script migrates:
 * 1. Agency CommissionEntry records (agentId = null) to CommissionQuote
 * 2. InsurerCommissionReceipt records to CommissionPayment
 * 
 * Run with: npx ts-node prisma/migrations/20260516092000_financial_workflow_refactor/backfill.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const Decimal = Prisma.Decimal;

async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CQ-${year}-`;
  const count = await prisma.commissionQuote.count({
    where: { quoteNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

async function generatePaymentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CP-${year}-`;
  const count = await prisma.commissionPayment.count({
    where: { paymentNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

async function backfillCommissionQuotes() {
  console.log('Starting CommissionQuote backfill...');
  
  // Get all agency commission entries (agentId is null)
  const agencyEntries = await prisma.commissionEntry.findMany({
    where: {
      agentId: null,
      commissionQuoteId: null, // Only entries not yet linked
    },
    include: {
      policy: {
        include: {
          client: true,
          insurer: true,
          product: true,
        },
      },
    },
  });

  console.log(`Found ${agencyEntries.length} agency commission entries to migrate`);

  let migrated = 0;
  let errors = 0;

  for (const entry of agencyEntries) {
    try {
      // Determine status based on commission entry status
      let quoteStatus: any = 'DRAFT';
      if (entry.status === 'RECEIVABLE') quoteStatus = 'PENDING_STATEMENT';
      else if (entry.status === 'PARTIALLY_RECEIVED') quoteStatus = 'PARTIALLY_PAID';
      else if (entry.status === 'RECEIVED') quoteStatus = 'PAID';
      else if (entry.status === 'DEDUCTED_AT_SOURCE') quoteStatus = 'RECONCILED';
      else if (entry.status === 'WRITTEN_OFF') quoteStatus = 'WRITTEN_OFF';
      else if (entry.status === 'CANCELLED') quoteStatus = 'CANCELLED';

      // Create commission quote
      const quote = await prisma.commissionQuote.create({
        data: {
          quoteNumber: await generateQuoteNumber(),
          policyId: entry.policyId,
          clientId: entry.policy.clientId,
          insurerId: entry.policy.insurerId,
          productId: entry.policy.productId,
          premiumAmount: entry.premiumAmount,
          expectedCommissionRate: entry.commissionRate,
          expectedGrossCommission: entry.grossCommission,
          expectedWhtRate: entry.withholdingTax.gt(0) 
            ? entry.withholdingTax.div(entry.grossCommission) 
            : new Decimal(0.10),
          expectedWhtAmount: entry.withholdingTax,
          expectedNetCommission: entry.netCommission,
          reconciledGrossCommission: entry.grossCommission,
          reconciledWhtAmount: entry.withholdingTax,
          reconciledNetCommission: entry.netCommission,
          paidAmount: entry.commissionReceivedAmount || new Decimal(0),
          balanceDue: (entry.commissionReceivableAmount || new Decimal(0))
            .minus(entry.commissionReceivedAmount || new Decimal(0)),
          status: quoteStatus,
          notes: `Migrated from CommissionEntry ${entry.id}. ${entry.notes || ''}`,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        },
      });

      // Link the commission entry to the quote
      await prisma.commissionEntry.update({
        where: { id: entry.id },
        data: { commissionQuoteId: quote.id },
      });

      migrated++;
      if (migrated % 10 === 0) {
        console.log(`Migrated ${migrated}/${agencyEntries.length} commission quotes`);
      }
    } catch (error) {
      console.error(`Error migrating entry ${entry.id}:`, error);
      errors++;
    }
  }

  console.log(`CommissionQuote backfill complete: ${migrated} migrated, ${errors} errors`);
}

async function backfillCommissionPayments() {
  console.log('Starting CommissionPayment backfill...');
  
  // Get all insurer commission receipts
  const receipts = await prisma.insurerCommissionReceipt.findMany({
    include: {
      commissionEntry: {
        include: {
          commissionQuote: true,
        },
      },
    },
  });

  console.log(`Found ${receipts.length} insurer commission receipts to migrate`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const receipt of receipts) {
    try {
      // Skip if no commission entry or no linked quote
      if (!receipt.commissionEntry || !receipt.commissionEntry.commissionQuote) {
        console.log(`Skipping receipt ${receipt.id}: no linked commission quote`);
        skipped++;
        continue;
      }

      const quote = receipt.commissionEntry.commissionQuote;

      // Create commission payment
      await prisma.commissionPayment.create({
        data: {
          paymentNumber: await generatePaymentNumber(),
          commissionQuoteId: quote.id,
          insurerId: receipt.insurerId,
          amount: receipt.amount,
          paymentDate: receipt.receivedDate,
          paymentMethod: receipt.method,
          transactionReference: receipt.reference,
          notes: `Migrated from InsurerCommissionReceipt ${receipt.id}. ${receipt.notes || ''}`,
          createdAt: receipt.createdAt,
        },
      });

      migrated++;
      if (migrated % 10 === 0) {
        console.log(`Migrated ${migrated}/${receipts.length - skipped} commission payments`);
      }
    } catch (error) {
      console.error(`Error migrating receipt ${receipt.id}:`, error);
      errors++;
    }
  }

  console.log(`CommissionPayment backfill complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Financial Workflow Refactor - Data Backfill');
  console.log('='.repeat(60));
  console.log();

  try {
    // Run backfills in sequence
    await backfillCommissionQuotes();
    console.log();
    await backfillCommissionPayments();
    
    console.log();
    console.log('='.repeat(60));
    console.log('Backfill completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
