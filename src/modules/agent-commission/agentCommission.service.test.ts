import assert from 'node:assert/strict';
import { calculateCommissionAmount } from './agentCommission.service';

const fixed = calculateCommissionAmount(
  { calculationType: 'FIXED_AMOUNT', fixedAmount: 5000 as never, percentageRate: null },
  100000,
);
assert.equal(fixed.amount, 5000);
assert.equal(fixed.calculationType, 'FIXED_AMOUNT');

const pct = calculateCommissionAmount(
  { calculationType: 'PERCENTAGE_OF_PREMIUM', fixedAmount: null, percentageRate: 0.1 as never },
  100000,
);
assert.equal(pct.amount, 10000);
assert.equal(pct.rate, 0.1);

const manual = calculateCommissionAmount(null, 100000, 7500);
assert.equal(manual.amount, 7500);
assert.equal(manual.calculationType, 'MANUAL_AMOUNT');

console.log('agentCommission.service tests passed');
