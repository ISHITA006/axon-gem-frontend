import { CheckCircle2, ListOrdered } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type QueuedNotice = {
  jobTitle: string;
  dialogOpen: boolean;
  formCleared: boolean;
};

type Props = {
  notice: QueuedNotice | null;
  onNoticeChange: (notice: QueuedNotice | null) => void;
  onViewQueue?: () => void;
};

export function queuedNoticeFromJob(jobTitle: string, formCleared = true): QueuedNotice {
  return { jobTitle, dialogOpen: true, formCleared };
}

export default function QueuedConfirmation({ notice, onNoticeChange, onViewQueue }: Props) {
  if (!notice) return null;

  const closeDialog = () => onNoticeChange({ ...notice, dialogOpen: false });
  const dismiss = () => onNoticeChange(null);
  const viewQueue = () => {
    onNoticeChange(null);
    onViewQueue?.();
  };

  return (
    <>
      <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950 [&>svg]:text-emerald-700">
        <CheckCircle2 className="h-5 w-5" />
        <AlertTitle>Added to the generation queue</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            <span className="font-medium text-emerald-950">{notice.jobTitle}</span> is waiting
            {notice.formCleared
              ? ". The form was cleared so you can submit a different product."
              : ". You can keep working while it waits."}
          </p>
          <div className="flex flex-wrap gap-2">
            {onViewQueue ? (
              <Button type="button" size="sm" onClick={viewQueue}>
                <ListOrdered className="h-3.5 w-3.5" />
                View queue
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
              Dismiss
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <Dialog open={notice.dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="sm:text-center">
            <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl">Added to the generation queue</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              <span className="font-medium">{notice.jobTitle}</span> is waiting.
              {notice.formCleared
                ? " The form has been cleared so you can submit a different product."
                : " You can keep working while it waits."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            {onViewQueue ? (
              <Button type="button" onClick={viewQueue}>
                <ListOrdered className="h-4 w-4" />
                View queue
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closeDialog}>
              {notice.formCleared ? "Submit another" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
