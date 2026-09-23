import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, Video } from "lucide-react";

import QueuedConfirmation, { queuedNoticeFromJob, type QueuedNotice } from "@/components/QueuedConfirmation";
import VideoCampaignForm, { type VideoCampaignSource } from "@/components/VideoCampaignForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiUploadRawJewelleryImage, getPresignedUrl } from "@/lib/api";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";

type Props = {
  /** Prefill from gallery / catalogue / try-on — skips local upload. */
  initialSource?: VideoCampaignSource | null;
  onQueued?: () => void;
  onViewQueue?: () => void;
};

export default function VideoShoot({ initialSource = null, onQueued, onViewQueue }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [remotePreviewUrl, setRemotePreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [source, setSource] = useState<VideoCampaignSource | null>(initialSource);
  const [queuedNotice, setQueuedNotice] = useState<QueuedNotice | null>(null);

  useEffect(() => {
    setSource(initialSource ?? null);
    if (initialSource) {
      setLocalFile(null);
      setQueuedNotice(null);
    }
  }, [initialSource]);

  useEffect(() => {
    if (!localFile) {
      setLocalPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    createDisplayableImageObjectUrl(localFile)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setLocalPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLocalPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [localFile]);

  useEffect(() => {
    if (localFile || !token || !source?.s3Key) {
      setRemotePreviewUrl(null);
      return;
    }
    if (source.imageUrl) {
      setRemotePreviewUrl(source.imageUrl);
      return;
    }
    let cancelled = false;
    getPresignedUrl(token, source.s3Key)
      .then((url) => {
        if (!cancelled) setRemotePreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setRemotePreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [localFile, token, source?.s3Key, source?.imageUrl]);

  const previewUrl = localPreviewUrl || remotePreviewUrl || source?.imageUrl || null;

  const handleClearSource = () => {
    setLocalFile(null);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemotePreviewUrl(null);
    setSource(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelected = async (file: File | null) => {
    setQueuedNotice(null);
    setLocalFile(file);
    if (!file) {
      if (!initialSource) setSource(null);
      return;
    }
    if (!token) {
      toast({
        title: "Sign in required",
        description: "Log in to upload an image for video shoot.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await apiUploadRawJewelleryImage(token, file);
      setSource({
        s3Key: uploaded.s3_key,
        imageUrl: null,
        defaultMode: "product",
        allowModeChange: true,
      });
    } catch (err) {
      setLocalFile(null);
      setSource(initialSource ?? null);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload image.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Video Shoot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a still or open one from Gallery / Catalogue, then generate a Veo 3.1 campaign clip.
        </p>
      </div>

      <QueuedConfirmation
        notice={queuedNotice}
        onNoticeChange={setQueuedNotice}
        onViewQueue={onViewQueue}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" />
              Source image
            </CardTitle>
            <CardDescription>
              Product or on-model still. Gallery and catalogue “Generate video” open here with the
              image already selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
            />
            {source?.s3Key ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border bg-muted/20">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Video source"
                      className="mx-auto max-h-72 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                      Loading preview…
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleClearSource}>
                    Clear / choose another
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    Replace image
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[220px] w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:bg-muted/30 disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="mb-3 h-10 w-10 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {uploading ? "Uploading…" : "Click to upload a still"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">PNG, JPG, WEBP, or HEIC</span>
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Video className="h-5 w-5" />
              Campaign options
            </CardTitle>
            <CardDescription>
              Same controls as before: video type, duration, aspect, brand kit, and background.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {source?.s3Key && !uploading ? (
              <VideoCampaignForm
                key={source.s3Key}
                token={token}
                source={{
                  ...source,
                  imageUrl: previewUrl,
                }}
                showSourcePreview={false}
                showProductIdField
                onSuccess={(job) => {
                  setQueuedNotice(queuedNoticeFromJob(job.title));
                  handleClearSource();
                  onQueued?.();
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Upload or select a source image to configure the campaign video.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
