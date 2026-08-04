import { useState, useEffect, useCallback } from "react";
import { Loader2, Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  apiGetColourName,
  apiChangeProductColour,
  downloadImage,
  getPresignedUrl,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AddToCataloguePanel from "./AddToCataloguePanel";

function normalizeHex(value: string): string {
  const m = value.trim().replace(/^#/, "").match(/^([0-9A-Fa-f]{0,6})/);
  if (!m) return "";
  return m[1].length === 6 ? `#${m[1]}` : value.trim().startsWith("#") ? `#${m[1]}` : m[1];
}

function formatColourDisplay(name: string, hex: string): string {
  const h = hex.startsWith("#") ? hex : `#${hex}`;
  return `${name} (${h})`;
}

interface ChangeProductColourProps {
  s3Key: string;
  imageUrl: string;
  onBack: () => void;
}

export default function ChangeProductColour({ s3Key, imageUrl, onBack }: ChangeProductColourProps) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [primaryHex, setPrimaryHex] = useState("#3b82f6");
  const [primaryName, setPrimaryName] = useState<string>("blue");
  const [primaryLoading, setPrimaryLoading] = useState(false);

  const [secondaryHex, setSecondaryHex] = useState("");
  const [secondaryName, setSecondaryName] = useState<string>("");
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [useSecondary, setUseSecondary] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; s3Key: string } | null>(null);

  const fetchName = useCallback(
    async (hex: string, setName: (s: string) => void, setLoading: (b: boolean) => void) => {
      const clean = hex.replace(/^#/, "");
      if (clean.length !== 6) return;
      if (!token) return;
      setLoading(true);
      try {
        const { name } = await apiGetColourName(token, clean);
        setName(name);
      } catch {
        setName("Unknown");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    const h = primaryHex.replace(/^#/, "");
    if (h.length === 6) fetchName(primaryHex, setPrimaryName, setPrimaryLoading);
  }, [primaryHex, fetchName]);

  useEffect(() => {
    if (!useSecondary || !secondaryHex) return;
    const h = secondaryHex.replace(/^#/, "");
    if (h.length === 6) fetchName(secondaryHex, setSecondaryName, setSecondaryLoading);
  }, [useSecondary, secondaryHex, fetchName]);

  const primaryFormatted = primaryHex.replace(/^#/, "").length === 6
    ? formatColourDisplay(primaryName, primaryHex)
    : "";
  const secondaryFormatted =
    useSecondary && secondaryHex.replace(/^#/, "").length === 6
      ? formatColourDisplay(secondaryName, secondaryHex)
      : undefined;

  const handlePrimaryHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const next = normalizeHex(raw);
    setPrimaryHex(next.length === 6 ? (next.startsWith("#") ? next : `#${next}`) : raw || "#");
  };

  const handleSecondaryHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const next = normalizeHex(raw);
    setSecondaryHex(next.length === 6 ? (next.startsWith("#") ? next : `#${next}`) : raw || "");
  };

  const handleSubmit = async () => {
    if (!token || primaryFormatted === "") {
      toast({
        title: "Invalid input",
        description: "Please choose a primary colour.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await apiChangeProductColour(
        token,
        s3Key,
        primaryFormatted,
        useSecondary ? secondaryFormatted ?? undefined : undefined
      );
      const displayUrl = await getPresignedUrl(token, res.s3_key);
      setResult({ url: displayUrl, s3Key: res.s3_key });
      toast({ title: "Success", description: "Colour changed successfully." });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not change colour",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!result || !token) return;
    try {
      const blob = await downloadImage(token, result.s3Key);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "tryon-colour-changed.png";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download image",
        variant: "destructive",
      });
    }
  };

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Changing product colour...</h2>
          <p className="text-sm text-muted-foreground">This may take a moment. Please don&apos;t close this page.</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
            <CardTitle className="text-base">Colour changed</CardTitle>
            <AddToCataloguePanel
              token={token}
              analysis={null}
              images={[{ url: result.url, s3Key: result.s3Key }]}
            />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <img
              src={result.url}
              alt="Result"
              className="w-full max-w-md mx-auto rounded-lg border shadow-sm block"
            />
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleDownload}
              disabled={!token}
            >
              <Download className="h-4 w-4" /> Download image
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change product colour</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-muted-foreground">Selected try-on image</Label>
            <img
              src={imageUrl}
              alt="Try-on"
              className="mt-2 w-full max-w-md rounded-lg border shadow-sm object-contain max-h-[70vh]"
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <Label>Primary colour</Label>
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  type="color"
                  value={primaryHex.startsWith("#") ? primaryHex : `#${primaryHex}`}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  className="h-10 w-14 rounded border border-input cursor-pointer bg-transparent"
                />
                <Input
                  placeholder="#000000"
                  value={primaryHex}
                  onChange={handlePrimaryHexChange}
                  className="font-mono max-w-[120px]"
                />
              </div>
              {primaryLoading ? (
                <p className="text-sm text-muted-foreground">Resolving name…</p>
              ) : (
                primaryFormatted && (
                  <p className="text-sm font-medium">
                    {formatColourDisplay(primaryName, primaryHex)}
                  </p>
                )
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use-secondary"
                  checked={useSecondary}
                  onChange={(e) => {
                    setUseSecondary(e.target.checked);
                    if (!e.target.checked) setSecondaryHex("");
                  }}
                  className="rounded border-input"
                />
                <Label htmlFor="use-secondary">Use secondary colour</Label>
              </div>
              {useSecondary && (
                <>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input
                      type="color"
                      value={secondaryHex.startsWith("#") ? secondaryHex : secondaryHex ? `#${secondaryHex}` : "#808080"}
                      onChange={(e) => setSecondaryHex(e.target.value)}
                      className="h-10 w-14 rounded border border-input cursor-pointer bg-transparent"
                    />
                    <Input
                      placeholder="#000000"
                      value={secondaryHex}
                      onChange={handleSecondaryHexChange}
                      className="font-mono max-w-[120px]"
                    />
                  </div>
                  {secondaryLoading ? (
                    <p className="text-sm text-muted-foreground">Resolving name…</p>
                  ) : (
                    secondaryFormatted && (
                      <p className="text-sm font-medium">
                        {formatColourDisplay(secondaryName, secondaryHex)}
                      </p>
                    )
                  )}
                </>
              )}
            </div>
          </div>

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!primaryFormatted || !token}
            className="min-w-[200px]"
          >
            Change colour
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
