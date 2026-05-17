/**
 * Kenya Insurance Regulatory Authority (IRA) levy rates:
 * - Training Levy: 0.25% of gross premium
 * - PCIF (Policyholders Compensation Fund): 0.25% of gross premium
 * - Stamp Duty: KES 40 flat per policy
 *
 * These rates are sourced from IRA guidelines and may be updated via settings.
 */

export interface PremiumInput {
  basePremium: number;
  policyFee?: number;
  trainingLevy?: number;
  pcifLevy?: number;
  stampDuty?: number;
  includeTrainingLevy?: boolean;
  includePcifLevy?: boolean;
  includeStampDuty?: boolean;
  customTrainingLevyRate?: number;
  customPcifRate?: number;
}

export interface PremiumBreakdown {
  basePremium: number;
  trainingLevy: number;
  pcifLevy: number;
  stampDuty: number;
  policyFee: number;
  totalPremium: number;
  outstandingAmount: number;
}

const TRAINING_LEVY_RATE = 0.0025; // 0.25%
const PCIF_LEVY_RATE = 0.0025;     // 0.25%
const STAMP_DUTY_FLAT = 40;        // KES 40

/**
 * Calculates the full premium breakdown for a policy.
 */
export function calculatePremium(input: PremiumInput): PremiumBreakdown {
  const {
    basePremium,
    policyFee = 0,
    trainingLevy,
    pcifLevy,
    stampDuty,
    includeTrainingLevy = trainingLevy !== undefined,
    includePcifLevy = pcifLevy !== undefined,
    includeStampDuty = stampDuty !== undefined,
    customTrainingLevyRate,
    customPcifRate,
  } = input;

  const resolvedTrainingLevy = includeTrainingLevy
    ? round2(trainingLevy ?? basePremium * (customTrainingLevyRate ?? TRAINING_LEVY_RATE))
    : 0;
  const resolvedPcifLevy = includePcifLevy
    ? round2(pcifLevy ?? basePremium * (customPcifRate ?? PCIF_LEVY_RATE))
    : 0;
  const resolvedStampDuty = includeStampDuty ? round2(stampDuty ?? STAMP_DUTY_FLAT) : 0;
  const totalPremium = round2(basePremium + resolvedTrainingLevy + resolvedPcifLevy + resolvedStampDuty + policyFee);

  return {
    basePremium: round2(basePremium),
    trainingLevy: resolvedTrainingLevy,
    pcifLevy: resolvedPcifLevy,
    stampDuty: resolvedStampDuty,
    policyFee: round2(policyFee),
    totalPremium,
    outstandingAmount: totalPremium,
  };
}

/**
 * Recalculates a premium after an endorsement changes the base premium.
 */
export function applyPremiumChange(
  current: PremiumBreakdown,
  premiumChange: number
): PremiumBreakdown {
  return calculatePremium({
    basePremium: current.basePremium + premiumChange,
    trainingLevy: current.trainingLevy,
    pcifLevy: current.pcifLevy,
    stampDuty: current.stampDuty,
    policyFee: current.policyFee,
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
