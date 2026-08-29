-- Authoritative ERP reporting. Actuals come only from posted journal lines;
-- forecasts come only from contract payment schedules and never affect balances.

create or replace view public.erp_finance_actual_monthly
with (security_invoker = true)
as
select
  l.studio_id,
  date_trunc('month', t.created_at)::date as month_start,
  sum(case when l.account_ref like 'income:%' then l.credit_irr - l.debit_irr else 0 end)::bigint
    as income_irr,
  sum(case when l.account_ref like 'expense:%' then l.debit_irr - l.credit_irr else 0 end)::bigint
    as expense_irr,
  sum(case when l.account_ref like 'asset:bank:%' then l.debit_irr - l.credit_irr else 0 end)::bigint
    as net_cashflow_irr
from public.finance_journal_lines as l
join public.finance_transactions as t on t.id = l.transaction_id
where t.state in ('posted', 'reversal')
group by l.studio_id, date_trunc('month', t.created_at)::date;

create or replace view public.erp_finance_forecast_monthly
with (security_invoker = true)
as
select
  s.studio_id,
  date_trunc('month', s.due_date)::date as month_start,
  sum(case when s.status not in ('paid', 'cancelled') then s.amount_irr else 0 end)::bigint
    as gross_forecast_irr,
  sum(
    case when s.status not in ('paid', 'cancelled')
      then round(s.amount_irr::numeric * s.probability_percent::numeric / 100)
      else 0
    end
  )::bigint as weighted_forecast_irr,
  sum(case when s.status = 'paid' then s.amount_irr else 0 end)::bigint as scheduled_paid_irr
from public.erp_payment_schedules as s
group by s.studio_id, date_trunc('month', s.due_date)::date;

create or replace view public.erp_finance_actual_vs_forecast
with (security_invoker = true)
as
select
  coalesce(a.studio_id, f.studio_id) as studio_id,
  coalesce(a.month_start, f.month_start) as month_start,
  coalesce(a.income_irr, 0)::bigint as actual_income_irr,
  coalesce(a.expense_irr, 0)::bigint as actual_expense_irr,
  coalesce(a.net_cashflow_irr, 0)::bigint as actual_net_cashflow_irr,
  coalesce(f.gross_forecast_irr, 0)::bigint as gross_forecast_irr,
  coalesce(f.weighted_forecast_irr, 0)::bigint as weighted_forecast_irr,
  (coalesce(a.income_irr, 0) - coalesce(a.expense_irr, 0))::bigint as actual_profit_irr,
  (coalesce(a.income_irr, 0) - coalesce(f.weighted_forecast_irr, 0))::bigint
    as income_vs_forecast_variance_irr
from public.erp_finance_actual_monthly as a
full join public.erp_finance_forecast_monthly as f
  on f.studio_id = a.studio_id and f.month_start = a.month_start;

revoke all on public.erp_finance_actual_monthly from anon, authenticated;
revoke all on public.erp_finance_forecast_monthly from anon, authenticated;
revoke all on public.erp_finance_actual_vs_forecast from anon, authenticated;
grant select on public.erp_finance_actual_monthly to authenticated;
grant select on public.erp_finance_forecast_monthly to authenticated;
grant select on public.erp_finance_actual_vs_forecast to authenticated;
