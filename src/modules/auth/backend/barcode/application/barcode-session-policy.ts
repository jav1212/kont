/** Inputs already obtained from trusted persistence adapters for session authorization. */
export type BarcodeSessionPolicyInput = { status: string; expiresAt: string; lastActivityAt: string; terminalStatus: string | null; terminalReady: boolean; badgeStatus: string | null; membershipActive: boolean; tenantStatus: string | null; cookieTerminalId: string | null; registeredTerminalId: string; now: number };

/**
 * Applies the fail-closed session rules independently of Supabase transport.
 *
 * @param input - Registry, membership, terminal and tenant facts supplied by adapters.
 * @returns Whether the barcode session may access the Web request.
 */
export function isBarcodeSessionActive(input: BarcodeSessionPolicyInput): boolean {
    return input.status === 'active'
        && Date.parse(input.expiresAt) > input.now
        && Date.parse(input.lastActivityAt) + 5 * 60 * 1000 > input.now
        && input.terminalStatus === 'active'
        && input.terminalReady
        && input.badgeStatus === 'active'
        && input.membershipActive
        && (input.tenantStatus === 'active' || input.tenantStatus === 'trial')
        && input.cookieTerminalId === input.registeredTerminalId;
}
