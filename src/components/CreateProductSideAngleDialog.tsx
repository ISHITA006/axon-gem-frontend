import { useRef, useState } from "react";
import { apiCreateProductSideAngle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CreateProductSideAngleDialogProps = {
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
};

export default function CreateProductSideAngleDialog({
  token,
  open,
  onOpenChange,
  onCreated,
}: CreateProductSideAngleDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const resetForm = () => {
    setName("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreate = async () => {
    if (!token) return;

    const trimmedName = name.trim();
    if (!trimmedName || !file) {
      toast({
        title: "Missing fields",
        description: "Please provide a name and product side angle image.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiCreateProductSideAngle(token, { name: trimmedName, file });
      toast({ title: "Success", description: "Product side angle created." });
      onOpenChange(false);
      resetForm();
      await onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create product side angle";
      toast({ title: "Create Failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen && !submitting) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Product Side Angle</DialogTitle>
          <DialogDescription>
            Upload an angle/pose reference for side-view studio product shoots. These can be
            selected optionally when generating a side view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-side-angle-name">Name</Label>
            <Input
              id="product-side-angle-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Three-quarter profile"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Angle / pose image</Label>
            <p className="text-sm text-muted-foreground">
              A product shot showing the side / profile camera angle and orientation you want for
              side-view generation.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
              >
                Choose image
              </Button>
              <p className="text-sm text-muted-foreground">{file ? file.name : "No file selected"}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
