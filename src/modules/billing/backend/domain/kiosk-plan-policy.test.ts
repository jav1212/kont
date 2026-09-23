import assert from 'node:assert/strict';
import test from 'node:test';
import { kioskPaymentPriceError, kioskPublicationPriceError } from './kiosk-plan-policy';

test('Kiosco cannot be published without a positive monthly price', () => {
    assert.equal(kioskPublicationPriceError(6), null);
    assert.equal(kioskPublicationPriceError(0), 'Kiosco requiere un precio mensual positivo antes de publicarse');
    assert.equal(kioskPublicationPriceError(Number.NaN), 'Kiosco requiere un precio mensual positivo antes de publicarse');
});

test('Kiosco payment requests reject unpublished and disabled billing cycles', () => {
    assert.equal(kioskPaymentPriceError(true, 6), null);
    assert.equal(kioskPaymentPriceError(false, 6), 'BILLING_PLAN_PRICE_REQUIRED');
    assert.equal(kioskPaymentPriceError(true, 0), 'BILLING_PLAN_PRICE_REQUIRED');
});
