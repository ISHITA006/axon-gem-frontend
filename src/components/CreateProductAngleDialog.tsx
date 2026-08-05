import { useRef, useState } from "react";
import { apiCreateProductAngle } from "@/lib/api";
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

type CreateProductAngleDialogProps = {
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
};

export default function CreateProductAngleDialog({
  token,
  open,
  onOpenChange,
  onCreated,
}: CreateProductAngleDialogProps) {
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
        description: "Please provide a name and product angle image.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiCreateProductAngle(token, { name: trimmedName, file });
      toast({ title: "Success", description: "Product angle created." });
      onOpenChange(false);
      resetForm();
      await onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create product angle";
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
          <DialogTitle>Add Product Angle</DialogTitle>
          <DialogDescription>
            Upload an angle/pose reference for front-view studio product shoots. These can be
            selected optionally when generating a product shoot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-angle-name">Name</Label>
            <Input
              id="product-angle-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Slight top-down hero"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Angle / pose image</Label>
            <p className="text-sm text-muted-foreground">
              A product shot showing the camera angle and orientation you want for front-view
              generation.
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
