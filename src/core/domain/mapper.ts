// Mapper contract for infrastructure adapters.
// Role: infrastructure boundary — defines the standard interface for converting raw DB rows
//       (from Supabase RPC or PostgREST) into typed domain entities.
// Invariant: TRaw must never leak beyond the infrastructure layer.
//            TDomain must never carry DB-specific fields (e.g., snake_case column names).

export interface Mapper<TRaw, TDomain> {
    toDomain(raw: TRaw): TDomain;
}
