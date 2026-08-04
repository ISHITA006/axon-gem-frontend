import { useRef, useState } from "react";
import { apiCreateCloseUpPose } from "@/lib/api";
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

type CreateCloseUpPoseDialogProps = {
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
};

export default function CreateCloseUpPoseDialog({
  token,
  open,
  onOpenChange,
  onCreated,
}: CreateCloseUpPoseDialogProps) {
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
        description: "Please provide a name and close-up pose image.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiCreateCloseUpPose(token, { name: trimmedName, file });
      toast({ title: "Success", description: "Close-up pose created." });
      onOpenChange(false);
      resetForm();
      await onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create close-up pose";
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
          <DialogTitle>Add Close-Up Pose</DialogTitle>
          <DialogDescription>
            Upload a model-agnostic close-up pose reference. These are used optionally when generating
            close-up try-on shots.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="close-up-pose-name">Name</Label>
            <Input
              id="close-up-pose-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Earring profile close-up"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Close-up pose image</Label>
            <p className="text-sm text-muted-foreground">
              A tight crop showing head, hand, or neckline positioning that spotlights jewellery in a
              close-up frame.
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
