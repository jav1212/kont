-- Gives financed-sales journal entries their own `sales` source instead of
-- `manual`. Additive: the allowed set only grows, so every existing row still
-- satisfies the constraint. Integration sources (anything but `manual`) are
-- exempt from the inactive-posting-account guard, like payroll and payables.

ALTER TABLE public.shared_accounting_entries DROP CONSTRAINT IF EXISTS shared_accounting_entries_source_check;
ALTER TABLE public.shared_accounting_entries ADD CONSTRAINT shared_accounting_entries_source_check
    CHECK (source IN ('manual','payroll','inventory','payables','sales'));

-- Drafts published before this migration were stored as `manual`; they are
-- identified by their financed-sales source reference. Posted entries keep
-- their original source because they are immutable.
UPDATE public.shared_accounting_entries
SET source = 'sales', updated_at = now()
WHERE source = 'manual' AND status = 'draft' AND source_ref LIKE 'financed-sales:%';
