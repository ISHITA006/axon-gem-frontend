import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CatalogueFieldDefinition } from "@/lib/api";

type Props = {
  fields: CatalogueFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  idPrefix?: string;
};

export function DynamicCatalogueFields({ fields, values, onChange, idPrefix = "cf" }: Props) {
  if (!fields.length) return null;

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const value = values[field.key];
        const label = (
          <Label htmlFor={id}>
            {field.label}
            {field.required ? " *" : ""}
          </Label>
        );

        if (field.field_type === "boolean") {
          return (
            <div key={field.uid} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              {label}
              <Switch
                id={id}
                checked={Boolean(value)}
                onCheckedChange={(checked) => onChange(field.key, checked)}
              />
            </div>
          );
        }

        if (field.field_type === "dropdown") {
          return (
            <div key={field.uid} className="space-y-1.5">
              {label}
              <Select
                value={value != null && value !== "" ? String(value) : undefined}
                onValueChange={(v) => onChange(field.key, v)}
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.field_type === "multiselect") {
          const selected = Array.isArray(value) ? (value as string[]) : [];
          return (
            <div key={field.uid} className="space-y-1.5">
              {label}
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {(field.options ?? []).map((opt) => {
                  const active = selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                      onClick={() => {
                        const next = active ? selected.filter((s) => s !== opt) : [...selected, opt];
                        onChange(field.key, next);
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        return (
          <div key={field.uid} className="space-y-1.5">
            {label}
            <Input
              id={id}
              type={field.field_type === "number" ? "number" : "text"}
              value={value == null ? "" : String(value)}
              onChange={(e) =>
                onChange(
                  field.key,
                  field.field_type === "number"
                    ? e.target.value === ""
                      ? ""
                      : Number(e.target.value)
                    : e.target.value,
                )
              }
              required={field.required}
            />
          </div>
        );
      })}
    </div>
  );
}
