import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Video } from "lucide-react";
import VideoCampaignForm, { type VideoCampaignSource } from "@/components/VideoCampaignForm";

export type { VideoCampaignSource };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  source: VideoCampaignSource | null;
};

export default function VideoCampaignDialog({ open, onOpenChange, token, source }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Generate video
          </DialogTitle>
          <DialogDescription>
            Premium Veo 3.1 studio clip with locked jewellery fidelity. Result is saved to the same
            product in Gallery.
          </DialogDescription>
        </DialogHeader>
        <VideoCampaignForm
          token={token}
          source={source}
          active={open}
          onCancel={() => onOpenChange(false)}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
