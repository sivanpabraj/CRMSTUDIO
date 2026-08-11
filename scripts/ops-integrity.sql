\set ON_ERROR_STOP on

do $$
begin
  if exists (
    select transaction_id
    from public.finance_journal_lines
    group by transaction_id
    having sum(debit_irr) <> sum(credit_irr)
  ) then
    raise exception 'unbalanced finance journal detected';
  end if;

  if exists (
    select 1
    from public.finance_transaction_heads h
    left join public.finance_transactions t on t.id = h.current_transaction_id
    where t.id is null or t.studio_id <> h.studio_id
  ) then
    raise exception 'orphan finance transaction head detected';
  end if;
end
$$;
