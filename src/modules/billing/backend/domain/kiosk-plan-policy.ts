/**
 * Decides whether a Kiosco offer can be published for payment requests.
 *
 * @param monthlyPrice - Published monthly commercial price in USD.
 * @returns A safe validation error, or `null` when the offer is publishable.
 */
export function kioskPublicationPriceError(
    monthlyPrice: number,
): string | null {
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
        return 'Kiosco requiere un precio mensual positivo antes de publicarse';
    }
    return null;
}

/**
 * Decides whether a configured Kiosco billing cycle may create a payment request.
 *
 * @param isPublished - Whether the offer is available for purchase.
 * @param selectedCyclePrice - Price of the billing cycle selected by the buyer.
 * @returns A safe validation error, or `null` when the payment request may continue.
 */
export function kioskPaymentPriceError(
    isPublished: boolean,
    selectedCyclePrice: number,
): string | null {
    if (!isPublished || !Number.isFinite(selectedCyclePrice) || selectedCyclePrice <= 0) {
        return 'BILLING_PLAN_PRICE_REQUIRED';
    }
    return null;
}
