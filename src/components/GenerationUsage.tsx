import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronLeft, ChevronRight, Gem, SquareUser, Wand2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiGetGenerationUsage, type GenerationModelBreakdown } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function BreakdownBars({
  items,
  total,
}: {
  items: { key: string; label: string; count: number; barClass: string }[];
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
                title={`${item.label}: ${item.count}`}
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
          </div>
        ))}
      </div>
    </>
  );
}

export default function GenerationUsage() {
  const { token } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["generation-usage", selectedMonth ?? "current"],
    queryFn: () => apiGetGenerationUsage(token as string, selectedMonth),
    enabled: Boolean(token),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Generation usage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Successful image generations for this account, broken down by category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={monthIndex < 0 || monthIndex >= months.length - 1}
            onClick={() => goToRelativeMonth(1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select
            value={data?.month}
            onValueChange={(value) => setSelectedMonth(value)}
            disabled={!data}
          >
            <SelectTrigger className="w-[200px]">
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
          <Button
            variant="outline"
            size="icon"
            disabled={monthIndex <= 0}
            onClick={() => goToRelativeMonth(-1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
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
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
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
                        title={`${category.title}: ${category.count}`}
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
                  }))}
                />
              </CardContent>
            </Card>
          </div>

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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
