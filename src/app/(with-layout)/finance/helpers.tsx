import { Badge } from "@/components/ui/badge";
import type { TFunc } from "@/lib/i18n/translate";
import type { ExpenseRow, IncomeRow, RecurringRow } from "./types";

export function formatMoney(
  amount: string | number,
  currency: string,
  fmtNum: (n: number, opts?: Intl.NumberFormatOptions) => string
): string {
  const n = Number(amount);
  const s = isFinite(n)
    ? fmtNum(n, { minimumFractionDigits: 2, maximumFractionDigits: 8 })
    : String(amount);
  return `${s} ${currency}`;
}

export function moneyCell(
  row: Pick<ExpenseRow | IncomeRow, "amount" | "currency" | "amountBase">,
  displayCurrency: string,
  fmtNum: (n: number, opts?: Intl.NumberFormatOptions) => string
) {
  const base = Number(row.amountBase);
  const showBase =
    isFinite(base) &&
    displayCurrency &&
    row.currency.toUpperCase() !== displayCurrency.toUpperCase();
  return (
    <div>
      <div className="font-medium">
        {formatMoney(row.amount, row.currency, fmtNum)}
      </div>
      {showBase && (
        <div className="text-xs text-muted-foreground">
          ({formatMoney(base, displayCurrency, fmtNum)})
        </div>
      )}
    </div>
  );
}

export function statusBadge(
  status: ExpenseRow["status"],
  t: TFunc
): React.ReactNode {
  const variant =
    status === "PENDING"
      ? "warning"
      : status === "REJECTED"
        ? "destructive"
        : "secondary";
  return (
    <Badge variant={variant as any}>{t(`finance.status.${status}`)}</Badge>
  );
}

export function kindBadge(kind: ExpenseRow["kind"], t: TFunc): React.ReactNode {
  const variant = kind === "PAYOUT" ? "warning" : "destructive";
  return <Badge variant={variant as any}>{t(`finance.kind.${kind}`)}</Badge>;
}

export function scopeBadge(
  scope: ExpenseRow["scope"],
  t: TFunc
): React.ReactNode {
  return <Badge variant="outline">{t(`finance.scope.${scope}`)}</Badge>;
}

export function recurringScheduleText(
  row: Pick<RecurringRow, "frequency" | "interval" | "dayOfMonth">,
  t: TFunc
): string {
  const { frequency, interval, dayOfMonth } = row;
  const unit = t(`finance.recurring.unit.${frequency}`, { count: interval });
  const schedule =
    interval === 1
      ? t(`finance.recurring.frequency.${frequency}`).toLowerCase()
      : t("finance.recurring.everyN", { n: interval, unit });
  if (dayOfMonth) {
    return `${schedule} · ${t("finance.recurring.dayOfMonthShort", { day: dayOfMonth })}`;
  }
  return schedule;
}

export function incomeStatus(
  row: IncomeRow,
  distributionsTotal: number,
  t: TFunc
): React.ReactNode {
  const base = Number(row.amountBase);
  if (!isFinite(base) || base <= 0) {
    return <Badge variant="secondary">{t("finance.income.status.none")}</Badge>;
  }
  const rest = Math.round((base - distributionsTotal) * 100) / 100;
  if (rest <= 0.001) {
    return <Badge variant="default">{t("finance.income.status.full")}</Badge>;
  }
  if (distributionsTotal > 0.001) {
    return (
      <Badge variant="warning">{t("finance.income.status.partial")}</Badge>
    );
  }
  return <Badge variant="secondary">{t("finance.income.status.none")}</Badge>;
}
