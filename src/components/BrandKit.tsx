import { useEffect, useState } from "react";
import { Check, ImagePlus, Loader2, Palette, Sparkles, Star, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiActivateBrandKit,
  apiCreateBrandKit,
  apiDeactivateBrandKit,
  apiDeleteBrandKit,
  apiListBrandKits,
  getPresignedUrl,
  type BrandKitRecord,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl, toBrowserDecodedImageFile } from "@/lib/heicImage";

type Preview = { id: string; url: string; file: File };

const THEME_FIELDS: { key: keyof NonNullable<BrandKitRecord["analysis"]>; label: string }[] = [
  { key: "overall_vibe", label: "Overall vibe" },
  { key: "model_poses", label: "Model poses" },
  { key: "shoot_style", label: "Shoot style" },
  { key: "camera_settings", label: "Camera settings" },
  { key: "camera_positioning", label: "Camera positioning" },
  { key: "shoot_angles", label: "Shoot angles" },
  { key: "model_styling", label: "Model styling" },
  { key: "colour_palette", label: "Colour palette" },
  { key: "lighting", label: "Lighting" },
];

export default function BrandKit() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [setActive, setSetActive] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [creating, setCreating] = useState(false);

  const [kits, setKits] = useState<BrandKitRecord[]>([]);
  const [kitsLoading, setKitsLoading] = useState(true);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [busyKitUid, setBusyKitUid] = useState<string | null>(null);

  // Build displayable previews (handles HEIC) whenever the selected files change.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Preview[] = [];
      for (const file of files) {
        try {
          const url = await createDisplayableImageObjectUrl(file);
          created.push(url);
          next.push({ id: `${file.name}-${file.size}-${file.lastModified}`, url, file });
        } catch {
          // skip un-decodable files
        }
      }
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setPreviews(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  const loadKits = async () => {
    if (!token) return;
    setKitsLoading(true);
    try {
      const data = await apiListBrandKits(token);
      setKits(data);
      const entries = await Promise.all(
        data.map(async (kit) => {
          const key = kit.image_s3_keys?.[0];
          if (!key) return [kit.uid, ""] as [string, string];
          try {
            return [kit.uid, await getPresignedUrl(token, key)] as [string, string];
          } catch {
            return [kit.uid, ""] as [string, string];
          }
        })
      );
      setThumbUrls(Object.fromEntries(entries));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load brand kits",
        variant: "destructive",
      });
    } finally {
      setKitsLoading(false);
    }
  };

  useEffect(() => {
    void loadKits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAddFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const decoded: File[] = [];
    for (const raw of Array.from(list)) {
      try {
        decoded.push(await toBrowserDecodedImageFile(raw));
      } catch {
        decoded.push(raw);
      }
    }
    setFiles((prev) => [...prev, ...decoded]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setSetActive(true);
    setFiles([]);
  };

  const handleCreate = async () => {
    if (!token) return;
    if (!name.trim()) {
      toast({ title: "Name required", description: "Give your brand kit a name.", variant: "destructive" });
      return;
    }
    if (files.length === 0) {
      toast({
        title: "Images required",
        description: "Upload at least one inspiration image.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const kit = await apiCreateBrandKit(token, {
        name: name.trim(),
        description: description.trim() || undefined,
        setActive,
        files,
      });
      toast({
        title: "Brand kit created",
        description: `"${kit.name}" analysed and ready${kit.is_active ? " — now active" : ""}.`,
      });
      resetForm();
      await loadKits();
    } catch (err: unknown) {
      toast({
        title: "Could not create brand kit",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (kit: BrandKitRecord) => {
    if (!token) return;
    setBusyKitUid(kit.uid);
    try {
      if (kit.is_active) {
        await apiDeactivateBrandKit(token, kit.uid);
      } else {
        await apiActivateBrandKit(token, kit.uid);
      }
      await loadKits();
    } catch (err: unknown) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKitUid(null);
    }
  };

  const handleDelete = async (kit: BrandKitRecord) => {
    if (!token) return;
    if (!window.confirm(`Delete brand kit "${kit.name}"? This cannot be undone.`)) return;
    setBusyKitUid(kit.uid);
    try {
      await apiDeleteBrandKit(token, kit.uid);
      toast({ title: "Deleted", description: `"${kit.name}" was removed.` });
      await loadKits();
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKitUid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Palette className="h-5 w-5" /> Brand Kit
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload inspiration images that capture how you want your model shoots to look. We analyse
          the poses, shoot style, camera work and styling, then apply that direction to your try-on
          results.
        </p>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Create a new brand kit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bk-name">Brand kit name *</Label>
              <Input
                id="bk-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer Editorial 2026"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bk-desc">Description</Label>
              <Input
                id="bk-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — a short note about this brand's vibe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Inspiration images *</Label>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {previews.map((preview, index) => (
                <div
                  key={preview.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/20"
                >
                  <img src={preview.url} alt="Inspiration" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-2 text-center transition hover:border-primary/50 hover:bg-muted/40">
                <ImagePlus className="mb-1 h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Add images</span>
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleAddFiles(e.target.files)}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {previews.length > 0
                ? `${previews.length} image${previews.length > 1 ? "s" : ""} selected`
                : "Upload multiple reference images for the best result."}
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={setActive}
              onChange={(e) => setSetActive(e.target.checked)}
              className="h-4 w-4 rounded border-muted-foreground/40"
            />
            Set as active — apply this kit to every new try-on automatically
          </label>

          <Button onClick={handleCreate} disabled={creating || !token} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {creating ? "Analysing inspiration…" : "Create brand kit"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing kits */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Your brand kits</h3>
        {kitsLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : kits.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Palette className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No brand kits yet. Create one above to guide your shoot results.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {kits.map((kit) => (
              <Card key={kit.uid} className={kit.is_active ? "border-primary ring-1 ring-primary/30" : ""}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted/20">
                      {thumbUrls[kit.uid] ? (
                        <img src={thumbUrls[kit.uid]} alt={kit.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImagePlus className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{kit.name}</p>
                        {kit.is_active && (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3" /> Active
                          </Badge>
                        )}
                      </div>
                      {kit.description && (
                        <p className="truncate text-xs text-muted-foreground">{kit.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {kit.image_s3_keys.length} inspiration image
                        {kit.image_s3_keys.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  {kit.theme_context && (
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Applied direction</p>
                      <p className="mt-1 text-sm leading-relaxed">{kit.theme_context}</p>
                    </div>
                  )}

                  {kit.analysis && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-medium text-primary">
                        View full theme breakdown
                      </summary>
                      <dl className="mt-2 space-y-2">
                        {THEME_FIELDS.map(({ key, label }) => {
                          const value = kit.analysis?.[key];
                          if (!value) return null;
                          return (
                            <div key={key}>
                              <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
                              <dd className="text-sm">{String(value)}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </details>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant={kit.is_active ? "secondary" : "default"}
                      size="sm"
                      className="gap-1.5"
                      disabled={busyKitUid === kit.uid}
                      onClick={() => void handleToggleActive(kit)}
                    >
                      {busyKitUid === kit.uid ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : kit.is_active ? (
                        <X className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {kit.is_active ? "Deactivate" : "Set active"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={busyKitUid === kit.uid}
                      onClick={() => void handleDelete(kit)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
