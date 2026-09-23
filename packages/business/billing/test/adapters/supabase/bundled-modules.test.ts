import assert from 'node:assert/strict';
import test from 'node:test';
import { bundledModulesForProduct } from '../../../src/adapters/supabase';

test('the inventory commercial product grants its fixed purchases and sales bundle', () => {
  assert.deepEqual(bundledModulesForProduct('inventory'), ['inventory', 'purchases', 'sales']);
  assert.deepEqual(bundledModulesForProduct('payroll'), ['payroll']);
});
