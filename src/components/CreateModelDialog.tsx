import { useRef, useState } from "react";
import { apiCreateModel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type CreateModelDialogProps = {
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
};

export default function CreateModelDialog({
  token,
  open,
  onOpenChange,
  onCreated,
}: CreateModelDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelGender, setNewModelGender] = useState("");
  const [newModelCategory, setNewModelCategory] = useState("");
  const [newModelFile, setNewModelFile] = useState<File | null>(null);

  const resetForm = () => {
    setNewModelName("");
    setNewModelGender("");
    setNewModelCategory("");
    setNewModelFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewModelFile(file);
  };

  const handleCreateModel = async () => {
    if (!token) return;

    const name = newModelName.trim();
    const gender = newModelGender.trim();
    const category = newModelCategory.trim();

    if (!name || !gender || !category || !newModelFile) {
      toast({
        title: "Missing fields",
        description: "Please provide name, gender, category and model image.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiCreateModel(token, { name, gender, category, file: newModelFile });
      toast({ title: "Success", description: "Model created successfully." });
      onOpenChange(false);
      resetForm();
      await onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create model";
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
          <DialogTitle>Add Model</DialogTitle>
          <DialogDescription>
            Enter model details and upload an image to create a new model.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="model-name">Name</Label>
            <Input
              id="model-name"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="Enter model name"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-gender">Gender</Label>
            <Select
              value={newModelGender}
              onValueChange={setNewModelGender}
              disabled={submitting}
            >
              <SelectTrigger id="model-gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-category">Category</Label>
            <Select
              value={newModelCategory}
              onValueChange={setNewModelCategory}
              disabled={submitting}
            >
              <SelectTrigger id="model-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="child">Child</SelectItem>
                <SelectItem value="adult">Adult</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model Image</Label>
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
                Choose Image
              </Button>
              <p className="text-sm text-muted-foreground">
                {newModelFile ? newModelFile.name : "No file selected"}
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
          <Button onClick={handleCreateModel} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
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
