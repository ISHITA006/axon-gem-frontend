import { useRef, useState } from "react";
import { apiCreatePose } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

type CreatePoseDialogProps = {
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
};

export default function CreatePoseDialog({
  token,
  open,
  onOpenChange,
  onCreated,
}: CreatePoseDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [adult, setAdult] = useState(false);
  const [child, setChild] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const resetForm = () => {
    setName("");
    setGender("");
    setAdult(false);
    setChild(false);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    if (!next) return;
    setFile(next);
  };

  const handleCreate = async () => {
    if (!token) return;

    const trimmedName = name.trim();
    const trimmedGender = gender.trim();

    if (!trimmedName || !trimmedGender || !file) {
      toast({
        title: "Missing fields",
        description: "Please provide name, gender, and pose image.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiCreatePose(token, {
        name: trimmedName,
        gender: trimmedGender,
        adult,
        child,
        file,
      });
      toast({ title: "Success", description: "Pose created successfully." });
      onOpenChange(false);
      resetForm();
      await onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create pose";
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
        if (!nextOpen && !submitting) {
          resetForm();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Pose</DialogTitle>
          <DialogDescription>
            Enter pose details and upload an image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pose-name">Name</Label>
            <Input
              id="pose-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pose name"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pose-gender">Gender</Label>
            <Select value={gender} onValueChange={setGender} disabled={submitting}>
              <SelectTrigger id="pose-gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Audience</Label>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pose-adult"
                  checked={adult}
                  onCheckedChange={(v) => setAdult(v === true)}
                  disabled={submitting}
                />
                <Label htmlFor="pose-adult" className="font-normal">
                  Adult
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pose-child"
                  checked={child}
                  onCheckedChange={(v) => setChild(v === true)}
                  disabled={submitting}
                />
                <Label htmlFor="pose-child" className="font-normal">
                  Child
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pose image</Label>
            <p>
              The pose image should be a single frame of a person in a specific pose.
              Ensure that the person is wearing accessories like a purse, hat, glasses, or other items.
              If so, please clean up the photo through Gemini using the following prompt.
              <br /><br />
              "Remove any accessories if visible in the attached image: bag, purse, gloves, scarf, hat, cap, sunglasses, muffler, mask, head gear.
              <br />
              Realistically fill the gaps in the image and ensure that physical interaction with surrounding objects look real."
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={handleFileSelect}
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
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "No file selected"}
              </p>
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
          <Button
            onClick={handleCreate}
            disabled={submitting}
            className={cn(
              submitting &&
                "h-auto min-h-10 min-w-0 flex-1 items-start justify-start gap-2 whitespace-normal py-2.5 text-left font-normal leading-snug"
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                <span className="min-w-0 break-words text-sm text-primary-foreground/95">
                  Submitting... This may take a while as we are generating this pose for all models.
                  Please don't close this page.
                </span>
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
