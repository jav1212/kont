import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );
}

/**
 * GET /api/billing/payment-requests
 * Lista las solicitudes de pago del tenant autenticado.
 */
export async function GET() {
    const cookieStore = await cookies();
    const supabase = getSupabase(cookieStore);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: 'No autenticado' }, { status: 401 });

    const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('tenant_id', user.id)
        .order('submitted_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ data: data ?? [] });
}

/**
 * POST /api/billing/payment-requests
 * Crea una nueva solicitud de pago (comprobante).
 * Body: { planId, billingCycle, amountUsd, paymentMethod, receiptUrl? }
 */
export async function POST(req: Request) {
    const cookieStore = await cookies();
    const supabase = getSupabase(cookieStore);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: 'No autenticado' }, { status: 401 });

    try {
        const { planId, billingCycle, amountUsd, paymentMethod, receiptUrl } = await req.json();

        if (!planId || !billingCycle || !amountUsd || !paymentMethod) {
            return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('payment_requests')
            .insert({
                tenant_id:      user.id,
                plan_id:        planId,
                billing_cycle:  billingCycle,
                amount_usd:     amountUsd,
                payment_method: paymentMethod,
                receipt_url:    receiptUrl ?? null,
                status:         'pending',
            })
            .select()
            .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ data }, { status: 201 });
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
}
