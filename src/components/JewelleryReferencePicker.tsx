import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { JewelleryReferenceMode } from "@/lib/api";

export type JewelleryReferencePickerValue = {
  mode: JewelleryReferenceMode;
  file: File | null;
};

const OPTIONS: { value: JewelleryReferenceMode; title: string; description: string }[] = [
  {
    value: "keep",
    title: "Keep original jewellery reference",
    description: "Use the jewellery photo from this shoot.",
  },
  {
    value: "swap",
    title: "Swap original jewellery reference",
    description: "Replace it with a new jewellery photo for this edit and later ones.",
  },
  {
    value: "extra",
    title: "Add an extra reference image",
    description: "Keep the original jewellery photo and attach another image to guide this edit.",
  },
];

export function JewelleryReferencePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: JewelleryReferencePickerValue;
  onChange: (next: JewelleryReferencePickerValue) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value.file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreviewUrl(url);
    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    };
  }, [value.file]);

  const needsFile = value.mode === "swap" || value.mode === "extra";
  const uploadLabel = value.mode === "swap" ? "New jewellery reference" : "Extra reference image";

  return (
    <div className="space-y-3">
      <Label>Jewellery reference</Label>
      <RadioGroup
        value={value.mode}
        onValueChange={(next) => {
          const mode = next as JewelleryReferenceMode;
          onChange({ mode, file: mode === "keep" ? null : value.file });
        }}
        className="grid gap-2"
      >
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 transition hover:border-primary/50",
              value.mode === option.value && "border-primary bg-primary/5 ring-1 ring-primary/30"
            )}
          >
            <RadioGroupItem id={`${id}-${option.value}`} value={option.value} className="mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-sm font-medium leading-snug">{option.title}</span>
              <p className="text-xs text-muted-foreground">{option.description}</p>
            </div>
          </label>
        ))}
      </RadioGroup>
      {needsFile ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-file`}>{uploadLabel}</Label>
          <label
            htmlFor={`${id}-file`}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-4 transition hover:border-primary/50 hover:bg-muted/40"
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Reference preview" className="max-h-40 w-full rounded object-contain" />
            ) : (
              <>
                <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to upload an image</span>
              </>
            )}
            <input
              id={`${id}-file`}
              type="file"
              accept="image/*,.heic,.heif"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                onChange({ mode: value.mode, file });
                e.target.value = "";
              }}
            />
          </label>
          {value.file ? (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground" title={value.file.name}>
                {value.file.name}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => onChange({ mode: value.mode, file: null })}
              >
                Clear
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">An image is required for this option.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
