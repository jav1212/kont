import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { SharedCompanyRepository } from './shared-company.repository';

test('an unrelated company edit preserves the stored kiosk operating profile', async () => {
    const row = {
        id: 'company-1', tenant_id: 'tenant-1', owner_id: 'owner-1', name: 'Kiosco Uno', rif: null,
        phone: null, address: null, contact_email: null, logo_url: 'https://example.test/logo.webp',
        show_logo_in_pdf: false, sector: null, taxpayer_type: 'ordinario', inventory_config: null,
        operating_profile: 'kiosk', created_at: null, updated_at: null,
    };
    let updatePayload: Record<string, unknown> | null = null;
    const source = {
        connect: () => client,
        disconnect: async () => undefined,
        instance: undefined as unknown as SupabaseClient,
    } satisfies ISource<SupabaseClient>;
    const client = {
        from: () => ({
            select: () => ({
                eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
            }),
            update: (payload: Record<string, unknown>) => {
                updatePayload = payload;
                return { eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { ...row, ...payload }, error: null }) }) }) }) };
            },
        }),
    } as unknown as SupabaseClient;
    source.instance = client;

    const repository = new SharedCompanyRepository(source, 'tenant-1');
    const result = await repository.update('company-1', { logoUrl: 'https://example.test/new.webp' });

    assert.equal(result.isSuccess, true);
    assert.equal((updatePayload as Record<string, unknown> | null)?.operating_profile, 'kiosk');
});

test('an upsert without a profile cannot reset an existing kiosk', async () => {
    const row = {
        id: 'company-1', tenant_id: 'tenant-1', owner_id: 'owner-1', name: 'Kiosco Uno', rif: null,
        phone: null, address: null, contact_email: null, logo_url: null, show_logo_in_pdf: false,
        sector: null, taxpayer_type: 'ordinario', inventory_config: null, operating_profile: 'kiosk',
        created_at: null, updated_at: null,
    };
    let saved: Record<string, unknown> | null = null;
    const client = {
        from: () => ({
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
            upsert: (payload: Record<string, unknown>) => { saved = payload; return Promise.resolve({ error: null }); },
        }),
    } as unknown as SupabaseClient;
    const source = { connect: () => client, disconnect: async () => undefined, instance: client } satisfies ISource<SupabaseClient>;
    const repository = new SharedCompanyRepository(source, 'tenant-1');

    const result = await repository.save({ id: 'company-1', ownerId: 'owner-1', name: 'Kiosco Uno' });

    assert.equal(result.isSuccess, true);
    assert.equal((saved as Record<string, unknown> | null)?.operating_profile, 'kiosk');
});
