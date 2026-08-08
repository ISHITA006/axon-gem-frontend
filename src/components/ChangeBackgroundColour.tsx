import { useState, useEffect, useCallback } from "react";
import { Loader2, Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  apiGetColourName,
  apiChangeBackgroundColour,
  downloadImage,
  getPresignedUrl,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AddToCataloguePanel from "./AddToCataloguePanel";

const PRESET_COLOURS: { hex: string; label: string }[] = [
  { hex: "#FFFFFF", label: "Pure white" },
  { hex: "#F8F8F8", label: "Off white" },
  { hex: "#F5F5F5", label: "Studio grey" },
  { hex: "#F8F4EC", label: "Ivory" },
  { hex: "#F3E9DC", label: "Champagne" },
  { hex: "#EAF0F2", label: "Cool mist" },
  { hex: "#1A1A1A", label: "Charcoal" },
];

function normalizeHex(value: string): string {
  const m = value.trim().replace(/^#/, "").match(/^([0-9A-Fa-f]{0,6})/);
  if (!m) return "";
  return m[1].length === 6 ? `#${m[1]}` : value.trim().startsWith("#") ? `#${m[1]}` : m[1];
}

interface ChangeBackgroundColourProps {
  s3Key: string;
  imageUrl: string;
  onBack: () => void;
}

export default function ChangeBackgroundColour({ s3Key, imageUrl, onBack }: ChangeBackgroundColourProps) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [hex, setHex] = useState("#F8F8F8");
  const [colourName, setColourName] = useState<string>("whitesmoke");
  const [nameLoading, setNameLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; s3Key: string } | null>(null);

  const cleanHex = hex.replace(/^#/, "");
  const isValidHex = cleanHex.length === 6;

  const fetchName = useCallback(
    async (value: string) => {
      const clean = value.replace(/^#/, "");
      if (clean.length !== 6 || !token) return;
      setNameLoading(true);
      try {
        const { name } = await apiGetColourName(token, clean);
        setColourName(name);
      } catch {
        setColourName("Unknown");
      } finally {
        setNameLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (isValidHex) fetchName(hex);
  }, [hex, isValidHex, fetchName]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const next = normalizeHex(raw);
    setHex(next.length === 6 ? (next.startsWith("#") ? next : `#${next}`) : raw || "#");
  };

  const handleSubmit = async () => {
    if (!token || !isValidHex) {
      toast({
        title: "Invalid input",
        description: "Please choose a valid background colour (6-digit hex).",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await apiChangeBackgroundColour(token, s3Key, `#${cleanHex.toUpperCase()}`);
      const displayUrl = await getPresignedUrl(token, res.s3_key);
      setResult({ url: displayUrl, s3Key: res.s3_key });
      toast({ title: "Success", description: "Background colour changed successfully." });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not change background colour",
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
      a.download = "background-changed.png";
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
          <h2 className="text-xl font-semibold">Changing background colour...</h2>
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
              <CardTitle className="text-base">Background changed</CardTitle>
              <AddToCataloguePanel
                token={token}
                analysis={null}
                images={[{ url: result.url, s3Key: result.s3Key }]}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Original</Label>
                <img
                  src={imageUrl}
                  alt="Original"
                  className="mt-2 w-full rounded-lg border shadow-sm object-contain max-h-[60vh]"
                />
              </div>
              <div>
                <Label className="text-muted-foreground">New background</Label>
                <img
                  src={result.url}
                  alt="Result"
                  className="mt-2 w-full rounded-lg border shadow-sm object-contain max-h-[60vh]"
                />
              </div>
            </div>
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
          <CardTitle className="text-base">Change background colour</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-muted-foreground">Selected image</Label>
            <img
              src={imageUrl}
              alt="Selected"
              className="mt-2 w-full max-w-md rounded-lg border shadow-sm object-contain max-h-[70vh]"
            />
          </div>

          <div className="space-y-3">
            <Label>Background colour</Label>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="color"
                value={hex.startsWith("#") ? hex : `#${hex}`}
                onChange={(e) => setHex(e.target.value)}
                className="h-10 w-14 rounded border border-input cursor-pointer bg-transparent"
              />
              <Input
                placeholder="#F8F8F8"
                value={hex}
                onChange={handleHexChange}
                className="font-mono max-w-[120px]"
              />
              {nameLoading ? (
                <p className="text-sm text-muted-foreground">Resolving name…</p>
              ) : (
                isValidHex && (
                  <p className="text-sm font-medium">
                    {colourName} (#{cleanHex.toUpperCase()})
                  </p>
                )
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {PRESET_COLOURS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setHex(preset.hex)}
                  title={`${preset.label} (${preset.hex})`}
                  className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-110 ${
                    hex.toUpperCase() === preset.hex ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                  style={{ backgroundColor: preset.hex }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              The objects and their shadows are lifted from the image exactly as they are and placed
              on the new colour — the product itself is never altered.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!isValidHex || !token}
            className="min-w-[200px]"
          >
            Change background
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
