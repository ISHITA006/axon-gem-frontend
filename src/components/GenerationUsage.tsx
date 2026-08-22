import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChevronLeft, ChevronRight, Download, Gem, IndianRupee, Mail, Plus, SquareUser, Wand2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  apiDownloadGenerationInvoice,
  apiGetGenerationUsage,
  apiGetInvoiceSettings,
  apiSendGenerationInvoice,
  apiUpdateInvoiceSettings,
  type GenerationBillingRateRow,
  type GenerationModelBreakdown,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const MODEL_LABELS: { key: keyof GenerationModelBreakdown; label: string; barClass: string }[] = [
  { key: "nanobanana_pro", label: "Nano Banana Pro", barClass: "bg-amber-500" },
  { key: "nanobanana_2", label: "Nano Banana 2", barClass: "bg-sky-500" },
  { key: "nanobanana_1", label: "Nano Banana 1", barClass: "bg-slate-400" },
];

const SIZE_KEYS = ["1K", "2K", "4K"] as const;
const SIZE_BAR: Record<(typeof SIZE_KEYS)[number], string> = {
  "1K": "bg-emerald-500",
  "2K": "bg-indigo-500",
  "4K": "bg-rose-500",
};
const MAX_INVOICE_CC_EMAILS = 10;
const INVOICE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BILLING_TIERS: {
  model: "nanobanana_2" | "nanobanana_pro";
  label: string;
  subtitle: string;
}[] = [
  { model: "nanobanana_2", label: "Standard", subtitle: "Nano Banana 2" },
  { model: "nanobanana_pro", label: "Premium", subtitle: "Nano Banana Pro" },
];

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function rateRowFor(
  rows: GenerationBillingRateRow[] | undefined,
  model: string,
  size: string,
): GenerationBillingRateRow {
  return (
    rows?.find((row) => row.model === model && row.image_size === size) ?? {
      model,
      image_size: size,
      unit_price_inr: 0,
      count: 0,
      amount_inr: 0,
    }
  );
}

function amountForModel(rows: GenerationBillingRateRow[] | undefined, model: string): number {
  return (rows ?? []).filter((row) => row.model === model).reduce((sum, row) => sum + row.amount_inr, 0);
}

function amountForSize(rows: GenerationBillingRateRow[] | undefined, size: string): number {
  return (rows ?? []).filter((row) => row.image_size === size).reduce((sum, row) => sum + row.amount_inr, 0);
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return yearMonth;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function share(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function formatModelSummary(byModel?: GenerationModelBreakdown): string {
  if (!byModel) return "";
  const parts = MODEL_LABELS
    .map(({ key, label }) => (byModel[key] > 0 ? `${byModel[key]} ${label}` : null))
    .filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

function formatSizeSummary(bySize?: Record<string, number>): string {
  if (!bySize) return "";
  return SIZE_KEYS
    .filter((size) => (bySize[size] ?? 0) > 0)
    .map((size) => `${bySize[size]} ${size}`)
    .join(" · ");
}

function parseEmailList(raw: string): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

function BreakdownBars({
  items,
  total,
}: {
  items: { key: string; label: string; count: number; barClass: string; amount?: number }[];
  total: number;
}) {
  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {total === 0 ? (
          <div className="h-full w-full" />
        ) : (
          items.map((item) =>
            item.count > 0 ? (
              <div
                key={item.key}
                className={item.barClass}
                style={{ width: `${(item.count / total) * 100}%` }}
                title={`${item.label}: ${item.count}${item.amount != null ? ` · ${formatInr(item.amount)}` : ""}`}
              />
            ) : null,
          )
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="rounded-md border bg-background/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${item.barClass}`} />
                {item.label}
              </span>
              <span>{total === 0 ? "0%" : `${share(item.count, total)}%`}</span>
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums">{item.count}</p>
            {item.amount != null ? (
              <p className="text-xs text-muted-foreground tabular-nums">{formatInr(item.amount)}</p>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

export default function GenerationUsage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceEmailDraft, setInvoiceEmailDraft] = useState<string | null>(null);
  const [invoiceCcDraft, setInvoiceCcDraft] = useState<string[] | null>(null);
  const [invoiceCcInput, setInvoiceCcInput] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["generation-usage", selectedMonth ?? "current"],
    queryFn: () => apiGetGenerationUsage(token as string, selectedMonth),
    enabled: Boolean(token),
  });

  const { data: invoiceSettings } = useQuery({
    queryKey: ["invoice-settings"],
    queryFn: () => apiGetInvoiceSettings(token as string),
    enabled: Boolean(token),
  });

  const invoiceEmailValue =
    invoiceEmailDraft ?? invoiceSettings?.recipient_email ?? "";
  const invoiceCcEmails = invoiceCcDraft ?? invoiceSettings?.cc_emails ?? [];

  const saveInvoiceEmail = useMutation({
    mutationFn: ({ email, ccEmails }: { email: string | null; ccEmails: string[] }) =>
      apiUpdateInvoiceSettings(token as string, email, ccEmails),
    onSuccess: (saved) => {
      queryClient.setQueryData(["invoice-settings"], saved);
      setInvoiceEmailDraft(null);
      setInvoiceCcDraft(null);
      setInvoiceCcInput("");
      const ccNote = saved.cc_emails.length
        ? ` CC ${saved.cc_emails.join(", ")}.`
        : "";
      toast({
        title: "Invoice email saved",
        description: saved.recipient_email
          ? `Monthly invoices will go to ${saved.to_email}, with a copy to ${saved.bcc_email}.${ccNote}`
          : `Monthly invoices will go to ${saved.to_email}.${ccNote}`,
      });
    },
    onError: (err) => {
      toast({
        title: "Could not save invoice email",
        description: err instanceof Error ? err.message : "Failed to save",
        variant: "destructive",
      });
    },
  });

  const months = data?.available_months ?? [];
  const monthIndex = useMemo(() => {
    if (!data) return -1;
    return months.indexOf(data.month);
  }, [data, months]);

  const goToRelativeMonth = (delta: number) => {
    if (monthIndex < 0) return;
    const next = months[monthIndex + delta];
    if (next) setSelectedMonth(next);
  };

  const categories = data
    ? [
        {
          key: "product",
          title: "Product shoot",
          count: data.product_shoot,
          amount: data.billing.by_category.product_shoot,
          description: "Front and side views",
          icon: Gem,
          barClass: "bg-amber-500",
          iconClass: "text-amber-600",
          cardClass: "border-amber-200/80",
          modelSummary: formatModelSummary(data.category_breakdown?.product_shoot?.by_model),
          sizeSummary: formatSizeSummary(data.category_breakdown?.product_shoot?.by_image_size),
        },
        {
          key: "model",
          title: "Model shoot",
          count: data.model_shoot,
          amount: data.billing.by_category.model_shoot,
          description: "Main and close-up views",
          icon: SquareUser,
          barClass: "bg-violet-500",
          iconClass: "text-violet-600",
          cardClass: "border-violet-200/80",
          modelSummary: formatModelSummary(data.category_breakdown?.model_shoot?.by_model),
          sizeSummary: formatSizeSummary(data.category_breakdown?.model_shoot?.by_image_size),
        },
        {
          key: "edited",
          title: "Edited images",
          count: data.edited_image,
          amount: data.billing.by_category.edited_image,
          description: "AI image edits",
          icon: Wand2,
          barClass: "bg-teal-500",
          iconClass: "text-teal-600",
          cardClass: "border-teal-200/80",
          modelSummary: formatModelSummary(data.category_breakdown?.edited_image?.by_model),
          sizeSummary: formatSizeSummary(data.category_breakdown?.edited_image?.by_image_size),
        },
      ]
    : [];

  const total = data?.total ?? 0;

  const downloadInvoice = async () => {
    if (!token || !data?.month) return;
    setDownloadingInvoice(true);
    try {
      await apiDownloadGenerationInvoice(token, data.month);
    } catch (err) {
      toast({
        title: "Could not download invoice",
        description: err instanceof Error ? err.message : "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const emailInvoice = async () => {
    if (!token || !data?.month) return;
    const monthName = formatMonthLabel(data.month);
    const toEmail = invoiceSettings?.to_email ?? "axoniqtech@gmail.com";
    const ccNote =
      invoiceSettings?.cc_emails?.length
        ? ` CC: ${invoiceSettings.cc_emails.join(", ")}.`
        : "";
    const bccNote =
      invoiceSettings?.bcc_emails?.length
        ? ` A copy will be BCC'd to ${invoiceSettings.bcc_emails.join(", ")}.`
        : "";
    const confirmed = window.confirm(
      `Email the ${monthName} invoice to ${toEmail}?${ccNote}${bccNote} This includes generation charges plus monthly software usage.`,
    );
    if (!confirmed) return;
    setSendingInvoice(true);
    try {
      const result = await apiSendGenerationInvoice(token, data.month, true);
      const bcc = result.bcc_emails?.length ? ` (BCC ${result.bcc_emails.join(", ")})` : "";
      const cc = result.cc_emails?.length ? ` (CC ${result.cc_emails.join(", ")})` : "";
      toast({
        title: result.status === "already_sent" ? "Invoice already sent" : "Invoice emailed",
        description: `${result.invoice_number} · ${formatInr(result.total_inr)} sent to ${result.recipient_email}${cc}${bcc}.`,
      });
    } catch (err) {
      toast({
        title: "Could not send invoice",
        description: err instanceof Error ? err.message : "Failed to email invoice",
        variant: "destructive",
      });
    } finally {
      setSendingInvoice(false);
    }
  };

  const addCcEmails = (raw: string) => {
    const incoming = parseEmailList(raw);
    if (!incoming.length) return;
    const invalid = incoming.find((email) => !INVOICE_EMAIL_RE.test(email));
    if (invalid) {
      toast({
        title: "Enter a valid email address",
        description: `"${invalid}" is not a valid email.`,
        variant: "destructive",
      });
      return;
    }
    const toKey = invoiceEmailValue.trim().toLowerCase();
    const existingKeys = new Set(invoiceCcEmails.map((email) => email.toLowerCase()));
    const next = [...invoiceCcEmails];
    for (const email of incoming) {
      const key = email.toLowerCase();
      if (key === toKey || existingKeys.has(key)) continue;
      if (next.length >= MAX_INVOICE_CC_EMAILS) {
        toast({
          title: "CC limit reached",
          description: `You can CC at most ${MAX_INVOICE_CC_EMAILS} additional emails.`,
          variant: "destructive",
        });
        break;
      }
      existingKeys.add(key);
      next.push(email);
    }
    setInvoiceCcDraft(next);
    setInvoiceCcInput("");
  };

  const removeCcEmail = (email: string) => {
    setInvoiceCcDraft(invoiceCcEmails.filter((item) => item.toLowerCase() !== email.toLowerCase()));
  };

  const saveInvoiceDelivery = () => {
    const next = invoiceEmailValue.trim();
    const pending = parseEmailList(invoiceCcInput);
    const ccEmails = [...invoiceCcEmails];
    const seen = new Set(ccEmails.map((email) => email.toLowerCase()));
    for (const email of pending) {
      if (!INVOICE_EMAIL_RE.test(email)) {
        toast({
          title: "Enter a valid email address",
          description: `"${email}" is not a valid email.`,
          variant: "destructive",
        });
        return;
      }
      if (seen.has(email.toLowerCase()) || email.toLowerCase() === next.toLowerCase()) continue;
      if (ccEmails.length >= MAX_INVOICE_CC_EMAILS) {
        toast({
          title: "CC limit reached",
          description: `You can CC at most ${MAX_INVOICE_CC_EMAILS} additional emails.`,
          variant: "destructive",
        });
        return;
      }
      seen.add(email.toLowerCase());
      ccEmails.push(email);
    }
    saveInvoiceEmail.mutate({ email: next ? next : null, ccEmails });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Generation usage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Successful image generations and live billing for this account, by category, model, and
            output quality. A PDF invoice is emailed on the 1st of each month for the previous month.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:max-w-sm">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              disabled={monthIndex < 0 || monthIndex >= months.length - 1}
              onClick={() => goToRelativeMonth(1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <Select
                value={data?.month}
                onValueChange={(value) => setSelectedMonth(value)}
                disabled={!data}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonthLabel(month)}
                      {month === months[0] ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              disabled={monthIndex <= 0}
              onClick={() => goToRelativeMonth(-1)}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-10 w-full min-w-0"
              onClick={downloadInvoice}
              disabled={!data || downloadingInvoice}
            >
              <Download className="h-4 w-4" />
              {downloadingInvoice ? "Preparing…" : "PDF"}
            </Button>
            <Button
              className="h-10 w-full min-w-0"
              onClick={emailInvoice}
              disabled={!data || sendingInvoice}
            >
              <Mail className="h-4 w-4" />
              {sendingInvoice ? "Sending…" : "Email invoice"}
            </Button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load generation usage."}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice delivery</CardTitle>
              <CardDescription>
                Enter the email address of your finance or accounting team to receive the invoice.
                You can also CC additional addresses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoice-email">Send invoice to</Label>
                <Input
                  id="invoice-email"
                  type="email"
                  placeholder={invoiceSettings?.default_recipient_email ?? "billing@example.com"}
                  value={invoiceEmailValue}
                  onChange={(event) => setInvoiceEmailDraft(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-cc-email">CC additional emails</Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    id="invoice-cc-email"
                    type="email"
                    placeholder="name@company.com"
                    value={invoiceCcInput}
                    onChange={(event) => setInvoiceCcInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCcEmails(invoiceCcInput);
                      }
                    }}
                    disabled={invoiceCcEmails.length >= MAX_INVOICE_CC_EMAILS}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addCcEmails(invoiceCcInput)}
                    disabled={!invoiceCcInput.trim() || invoiceCcEmails.length >= MAX_INVOICE_CC_EMAILS}
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
                {invoiceCcEmails.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {invoiceCcEmails.map((email) => (
                      <Badge key={email} variant="secondary" className="gap-1 pr-1 font-normal">
                        {email}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                          onClick={() => removeCcEmail(email)}
                          aria-label={`Remove ${email}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Optional. Paste one or more emails, then add. These recipients appear on the invoice as CC.
                  </p>
                )}
              </div>
              <Button
                onClick={saveInvoiceDelivery}
                disabled={saveInvoiceEmail.isPending || !token}
              >
                {saveInvoiceEmail.isPending ? "Saving…" : "Save email"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="grid min-w-0 flex-1 gap-6 sm:grid-cols-2 sm:gap-12">
                <div>
                  <CardDescription>
                    {data.is_current_month ? "This month" : formatMonthLabel(data.month)}
                  </CardDescription>
                  <CardTitle className="mt-1 text-4xl tabular-nums">{data.total}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.total === 1 ? "generation" : "generations"}
                    {data.is_current_month ? " so far" : ""}
                  </p>
                </div>
                <div>
                  <CardDescription>Billed</CardDescription>
                  <CardTitle className="mt-1 text-4xl tabular-nums">
                    {formatInr(data.billing.total_inr)}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.billing.billed_count === 1
                      ? "1 priced generation"
                      : `${data.billing.billed_count} priced generations`}
                    {data.billing.unpriced_count > 0
                      ? ` · ${data.billing.unpriced_count} unpriced`
                      : ""}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                {formatMonthLabel(data.month)}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                {total === 0 ? (
                  <div className="h-full w-full" />
                ) : (
                  categories.map((category) =>
                    category.count > 0 ? (
                      <div
                        key={category.key}
                        className={category.barClass}
                        style={{ width: `${(category.count / total) * 100}%` }}
                        title={`${category.title}: ${category.count} · ${formatInr(category.amount)}`}
                      />
                    ) : null,
                  )
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                {categories.map((category) => (
                  <span key={category.key} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${category.barClass}`} />
                    {category.title}
                    <span className="tabular-nums">{formatInr(category.amount)}</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {categories.map((category) => {
              const Icon = category.icon;
              const percent = share(category.count, total);
              return (
                <Card key={category.key} className={category.cardClass}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardDescription>{category.title}</CardDescription>
                      <Icon className={`h-4 w-4 ${category.iconClass}`} />
                    </div>
                    <CardTitle className="text-3xl tabular-nums">{category.count}</CardTitle>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {formatInr(category.amount)}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                    {category.modelSummary ? (
                      <p className="mt-2 text-xs text-muted-foreground">{category.modelSummary}</p>
                    ) : null}
                    {category.sizeSummary ? (
                      <p className="text-xs text-muted-foreground">{category.sizeSummary}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {total === 0 ? "No generations yet this month" : `${percent}% of this month`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By model</CardTitle>
                <CardDescription>
                  If Nano Banana Pro returned an image even once, the generation is counted as Pro.
                  Otherwise it is Nano Banana 2.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BreakdownBars
                  total={total}
                  items={MODEL_LABELS.map((model) => ({
                    key: model.key,
                    label: model.label,
                    count: data.by_model[model.key] ?? 0,
                    barClass: model.barClass,
                    amount:
                      model.key === "nanobanana_1"
                        ? undefined
                        : amountForModel(data.billing.by_rate, model.key),
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By image size</CardTitle>
                <CardDescription>Requested output quality for each successful generation.</CardDescription>
              </CardHeader>
              <CardContent>
                <BreakdownBars
                  total={total}
                  items={SIZE_KEYS.map((size) => ({
                    key: size,
                    label: size,
                    count: data.by_image_size[size] ?? 0,
                    barClass: SIZE_BAR[size],
                    amount: amountForSize(data.billing.by_rate, size),
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Live billing</CardTitle>
                  <CardDescription>
                    Each successful generation is billed by the model that returned the image and the
                    requested output quality.
                  </CardDescription>
                </div>
                <IndianRupee className="mt-0.5 h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {BILLING_TIERS.map((tier) => {
                  const rows = SIZE_KEYS.map((size) => rateRowFor(data.billing.by_rate, tier.model, size));
                  const subtotal = rows.reduce((sum, row) => sum + row.amount_inr, 0);
                  const count = rows.reduce((sum, row) => sum + row.count, 0);
                  return (
                    <div key={tier.model} className="rounded-lg border">
                      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{tier.label}</p>
                          <p className="text-xs text-muted-foreground">{tier.subtitle}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{formatInr(subtotal)}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {count} {count === 1 ? "image" : "images"}
                          </p>
                        </div>
                      </div>
                      <div className="divide-y">
                        {rows.map((row) => (
                          <div
                            key={`${row.model}-${row.image_size}`}
                            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm"
                          >
                            <span className="flex items-center gap-1.5 font-medium">
                              <span className={`h-2 w-2 rounded-full ${SIZE_BAR[row.image_size as (typeof SIZE_KEYS)[number]]}`} />
                              {row.image_size}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {formatInr(row.unit_price_inr)} × {row.count}
                            </span>
                            <span className="tabular-nums font-medium">{formatInr(row.amount_inr)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.billing.unpriced_count > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {data.billing.unpriced_count}{" "}
                  {data.billing.unpriced_count === 1 ? "generation has" : "generations have"} no
                  matching rate yet — Nano Banana 1, or a missing model/size.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How generations are counted</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Each returned product-shoot view counts as 1 generation. Front/side only is 1; front and
                side together are 2.
              </p>
              <p>
                Each returned model-shoot view counts as 1 generation. A main view/close-up view is 1; main plus
                close-up is 2.
              </p>
              <p>
                Each AI image edit — including the Edit Image tool, change colour, and change
                length — counts as 1 generation. Manual photo editing is not counted.
              </p>
              <p>
                Model attribution: Nano Banana Pro if it returned an image even once for that
                generation. If Pro returned 500/503 or no image, the generation is attributed to
                Nano Banana 2.
              </p>
              <p>
                Billing is calculated live from the current rate chart: Standard (Nano Banana 2) is
                ₹50 for 1K, ₹70 for 2K, and ₹100 for 4K. Premium (Nano Banana Pro) is ₹100 for 1K
                and 2K, and ₹130 for 4K.
              </p>
              <p>
                On the 1st of every month at 9:00 AM IST, a PDF invoice for the previous month is
                emailed to the address saved under Invoice delivery. CC addresses receive a copy.
                If a custom address is saved, axoniqtech@gmail.com is BCC'd. If none is saved, the
                invoice goes only to axoniqtech@gmail.com.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
