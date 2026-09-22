import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  apiCreateCatalogueField,
  apiDeleteCatalogueField,
  apiListCatalogueFields,
  apiReorderCatalogueFields,
  apiUpdateCatalogueField,
  type CatalogueFieldDefinition,
  type CatalogueFieldType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const FIELD_TYPES: CatalogueFieldType[] = ["text", "number", "dropdown", "multiselect", "boolean"];

type Draft = {
  label: string;
  key: string;
  field_type: CatalogueFieldType;
  required: boolean;
  filterable: boolean;
  show_on_buyer: boolean;
  optionsText: string;
  maxLength: string;
  min: string;
  max: string;
  pattern: string;
};

const emptyDraft = (): Draft => ({
  label: "",
  key: "",
  field_type: "text",
  required: false,
  filterable: true,
  show_on_buyer: true,
  optionsText: "",
  maxLength: "",
  min: "",
  max: "",
  pattern: "",
});

function draftFromField(field: CatalogueFieldDefinition): Draft {
  const v = field.validation ?? {};
  return {
    label: field.label,
    key: field.key,
    field_type: field.field_type,
    required: field.required,
    filterable: field.filterable,
    show_on_buyer: field.show_on_buyer,
    optionsText: (field.options ?? []).join("\n"),
    maxLength: v.max_length != null ? String(v.max_length) : "",
    min: v.min != null ? String(v.min) : "",
    max: v.max != null ? String(v.max) : "",
    pattern: v.pattern != null ? String(v.pattern) : "",
  };
}

function buildValidation(draft: Draft): Record<string, unknown> | null {
  const validation: Record<string, unknown> = {};
  if (draft.field_type === "text") {
    if (draft.maxLength.trim()) validation.max_length = Number(draft.maxLength);
    if (draft.pattern.trim()) validation.pattern = draft.pattern.trim();
  }
  if (draft.field_type === "number") {
    if (draft.min.trim()) validation.min = Number(draft.min);
    if (draft.max.trim()) validation.max = Number(draft.max);
  }
  return Object.keys(validation).length ? validation : null;
}

function buildOptions(draft: Draft): string[] | null {
  if (draft.field_type !== "dropdown" && draft.field_type !== "multiselect") return null;
  return draft.optionsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ManageCatalogueFields() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [fields, setFields] = useState<CatalogueFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogueFieldDefinition | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      setFields(await apiListCatalogueFields(token));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load fields",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  };

  const openEdit = (field: CatalogueFieldDefinition) => {
    setEditing(field);
    setDraft(draftFromField(field));
    setOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    if (!draft.label.trim()) {
      toast({ title: "Label required", variant: "destructive" });
      return;
    }
    const options = buildOptions(draft);
    if ((draft.field_type === "dropdown" || draft.field_type === "multiselect") && !options?.length) {
      toast({ title: "Options required", description: "Enter one option per line.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiUpdateCatalogueField(token, editing.uid, {
          label: draft.label.trim(),
          field_type: draft.field_type,
          required: draft.required,
          filterable: draft.filterable,
          show_on_buyer: draft.show_on_buyer,
          options,
          validation: buildValidation(draft),
        });
        toast({ title: "Field updated" });
      } else {
        await apiCreateCatalogueField(token, {
          label: draft.label.trim(),
          key: draft.key.trim() || undefined,
          field_type: draft.field_type,
          required: draft.required,
          filterable: draft.filterable,
          show_on_buyer: draft.show_on_buyer,
          options,
          validation: buildValidation(draft),
        });
        toast({ title: "Field created" });
      }
      setOpen(false);
      await load();
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save field",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (field: CatalogueFieldDefinition) => {
    if (!token) return;
    if (!window.confirm(`Delete field “${field.label}”? Values on existing items will be removed.`)) return;
    try {
      await apiDeleteCatalogueField(token, field.uid);
      toast({ title: "Field deleted" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete",
        variant: "destructive",
      });
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!token) return;
    const next = [...fields];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setFields(next);
    try {
      setFields(await apiReorderCatalogueFields(token, next.map((f) => f.uid)));
    } catch (err: unknown) {
      toast({
        title: "Reorder failed",
        description: err instanceof Error ? err.message : "Could not reorder",
        variant: "destructive",
      });
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Catalog fields</h2>
          <p className="text-sm text-muted-foreground">
            Create custom attributes with validations. Filterable fields appear as filters in catalogue and buyer view.
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add field
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No custom fields yet. Core fields (SKU, name, description, images) are always present.
                  </TableCell>
                </TableRow>
              ) : (
                fields.map((field, idx) => (
                  <TableRow key={field.uid} className="cursor-pointer" onClick={() => openEdit(field)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void move(idx, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void move(idx, 1)}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{field.label}</TableCell>
                    <TableCell className="font-mono text-xs">{field.key}</TableCell>
                    <TableCell>{field.field_type}</TableCell>
                    <TableCell className="space-x-1">
                      {field.required ? <Badge variant="secondary">Required</Badge> : null}
                      {field.filterable ? <Badge variant="outline">Filter</Badge> : null}
                      {field.show_on_buyer ? <Badge variant="outline">Buyer</Badge> : null}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => void handleDelete(field)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit field" : "Add field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>
            {!editing ? (
              <div className="space-y-1.5">
                <Label>Key (optional)</Label>
                <Input
                  value={draft.key}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  placeholder="auto from label"
                  className="font-mono"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Key</Label>
                <Input value={draft.key} disabled className="font-mono" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={draft.field_type}
                onValueChange={(v) => setDraft({ ...draft, field_type: v as CatalogueFieldType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(draft.field_type === "dropdown" || draft.field_type === "multiselect") && (
              <div className="space-y-1.5">
                <Label>Options (one per line)</Label>
                <textarea
                  className="min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={draft.optionsText}
                  onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
                />
              </div>
            )}
            {draft.field_type === "text" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Max length</Label>
                  <Input
                    type="number"
                    value={draft.maxLength}
                    onChange={(e) => setDraft({ ...draft, maxLength: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pattern (regex)</Label>
                  <Input value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
                </div>
              </div>
            )}
            {draft.field_type === "number" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Min</Label>
                  <Input type="number" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Max</Label>
                  <Input type="number" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Required</Label>
              <Switch checked={draft.required} onCheckedChange={(v) => setDraft({ ...draft, required: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Filterable</Label>
              <Switch checked={draft.filterable} onCheckedChange={(v) => setDraft({ ...draft, filterable: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Show on buyer catalog</Label>
              <Switch
                checked={draft.show_on_buyer}
                onCheckedChange={(v) => setDraft({ ...draft, show_on_buyer: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
