import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileDown, FileText, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  apiDeleteCatalogueItem,
  apiExportCatalogue,
  apiGetCatalogueItem,
  apiListCatalogueFields,
  apiListCatalogueItems,
  apiUpdateCatalogueItem,
  getPresignedUrl,
  type CatalogueFieldDefinition,
  type CatalogueItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DynamicCatalogueFields } from "@/components/catalogue/DynamicCatalogueFields";
import { formatTableDate } from "@/lib/utils";

export default function ManageCatalogue() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [fields, setFields] = useState<CatalogueFieldDefinition[]>([]);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [q, setQ] = useState("");
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogueItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  const filterableFields = useMemo(() => fields.filter((f) => f.filterable), [fields]);

  const filters = useMemo(
    () => ({ page, q, fieldFilters, sort_by: "updated_at" as const, sort_dir: "desc" as const }),
    [page, q, fieldFilters],
  );

  const loadList = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [fieldList, list] = await Promise.all([
        apiListCatalogueFields(token),
        apiListCatalogueItems(token, filters),
      ]);
      setFields(fieldList);
      setItems(list.data);
      setTotal(list.total);
      setPageCount(list.page_count);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load catalogue",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, q, fieldFilters]);

  useEffect(() => {
    if (!token || !items.length) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        items.map(async (item) => {
          const key = item.images?.[0]?.image_s3_key;
          if (!key) return;
          try {
            next[item.uid] = await getPresignedUrl(token, key);
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setThumbUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, items]);

  const openDetail = async (uid: string) => {
    if (!token) return;
    setSelectedUid(uid);
    setDetailLoading(true);
    try {
      setDetail(await apiGetCatalogueItem(token, uid));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load item",
        variant: "destructive",
      });
      setSelectedUid(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = async (format: "pdf" | "pptx") => {
    if (!token) return;
    setExporting(format);
    try {
      await apiExportCatalogue(token, format, { q, fieldFilters });
      toast({ title: "Export ready", description: `Downloaded catalogue ${format.toUpperCase()}.` });
    } catch (err: unknown) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  const handleSaveDetail = async () => {
    if (!token || !detail) return;
    setSaving(true);
    try {
      const updated = await apiUpdateCatalogueItem(token, detail.uid, {
        itemCode: detail.item_code,
        name: detail.name,
        description: detail.description ?? "",
        imageS3Keys: detail.images.map((i) => i.image_s3_key),
        customFields: detail.custom_fields ?? {},
      });
      setDetail(updated);
      toast({ title: "Saved", description: "Catalogue item updated." });
      await loadList();
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !detail) return;
    if (!window.confirm(`Delete "${detail.name}" from the catalogue?`)) return;
    try {
      await apiDeleteCatalogueItem(token, detail.uid);
      toast({ title: "Deleted", description: "Item moved to deleted catalogue gallery." });
      setSelectedUid(null);
      setDetail(null);
      await loadList();
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete",
        variant: "destructive",
      });
    }
  };

  if (selectedUid) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => {
              setSelectedUid(null);
              setDetail(null);
            }}
          >
            <ArrowLeft className="h-4 w-4" /> Back to catalogue
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2 text-destructive" onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button onClick={() => void handleSaveDetail()} disabled={saving || detailLoading}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
        {detailLoading || !detail ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-semibold">Images</h3>
              <div className="flex flex-wrap gap-3">
                {detail.images.map((img) => (
                  <CatalogueThumb key={img.uid} token={token} s3Key={img.image_s3_key} />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>SKU / Item code</Label>
                <Input
                  value={detail.item_code}
                  onChange={(e) => setDetail({ ...detail, item_code: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={detail.name} onChange={(e) => setDetail({ ...detail, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={detail.description ?? ""}
                  onChange={(e) => setDetail({ ...detail, description: e.target.value })}
                  rows={3}
                />
              </div>
              <DynamicCatalogueFields
                fields={fields}
                values={detail.custom_fields ?? {}}
                onChange={(key, value) =>
                  setDetail({
                    ...detail,
                    custom_fields: { ...(detail.custom_fields ?? {}), [key]: value },
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Catalogue</h2>
          <p className="text-sm text-muted-foreground">{total} item{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={!!exporting}
            onClick={() => void handleExport("pdf")}
          >
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Export PDF
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!!exporting}
            onClick={() => void handleExport("pptx")}
          >
            {exporting === "pptx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Export PPT
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Search</Label>
          <Input
            placeholder="SKU, name, description…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </div>
        {filterableFields.map((field) => (
          <div key={field.uid} className="space-y-1.5">
            <Label>{field.label}</Label>
            {field.field_type === "dropdown" || field.field_type === "multiselect" || field.field_type === "boolean" ? (
              <Select
                value={fieldFilters[field.key] || "__all__"}
                onValueChange={(v) => {
                  setPage(1);
                  setFieldFilters((prev) => {
                    const next = { ...prev };
                    if (v === "__all__") delete next[field.key];
                    else next[field.key] = v;
                    return next;
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {field.field_type === "boolean" ? (
                    <>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </>
                  ) : (
                    (field.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={fieldFilters[field.key] || ""}
                onChange={(e) => {
                  setPage(1);
                  const v = e.target.value;
                  setFieldFilters((prev) => {
                    const next = { ...prev };
                    if (!v.trim()) delete next[field.key];
                    else next[field.key] = v;
                    return next;
                  });
                }}
              />
            )}
          </div>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Image</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No catalogue items yet. Use “Add to catalogue” from shoot results.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.uid}
                    className="cursor-pointer"
                    onClick={() => void openDetail(item.uid)}
                  >
                    <TableCell>
                      {thumbUrls[item.uid] ? (
                        <img src={thumbUrls[item.uid]} alt="" className="h-12 w-12 rounded object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTableDate(item.updated_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CatalogueThumb({ token, s3Key }: { token: string | null; s3Key: string }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (!token) return;
    void getPresignedUrl(token, s3Key).then(setUrl).catch(() => setUrl(""));
  }, [token, s3Key]);
  if (!url) return <div className="h-28 w-28 rounded bg-muted" />;
  return <img src={url} alt="" className="h-28 w-28 rounded object-cover" />;
}
