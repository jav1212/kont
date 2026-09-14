import * as adapter from './barcode-access-service';
import { BarcodeOperation } from './application/barcode-operation';

/**
 * Assembles barcode access actions from the owning Supabase adapter.
 * Route handlers depend on this factory rather than adapter internals.
 *
 * @returns The bounded barcode application action set.
 */
export function getBarcodeAccessActions() {
    return {
        enrollTerminal: new BarcodeOperation(adapter.enrollBarcodeTerminal),
        listTerminals: new BarcodeOperation(adapter.listBarcodeTerminals),
        revokeTerminal: new BarcodeOperation(adapter.revokeBarcodeTerminal),
        issueBadge: new BarcodeOperation(adapter.issueBarcodeBadge),
        listBadges: new BarcodeOperation(adapter.listBarcodeBadges),
        revokeBadge: new BarcodeOperation(adapter.revokeBarcodeBadge),
        findLoginBadge: new BarcodeOperation((input: { terminal: Parameters<typeof adapter.findLoginBadge>[0]; barcode: string }) => adapter.findLoginBadge(input.terminal, input.barcode)),
        registerSession: new BarcodeOperation(adapter.registerBarcodeSession),
        reprintBadge: new BarcodeOperation(adapter.reprintBarcodeBadge),
        reprintAllBadges: new BarcodeOperation(adapter.reprintAllBarcodeBadges),
    };
}
