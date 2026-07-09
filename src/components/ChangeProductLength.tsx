import { useState } from "react";
import { Loader2, Download, ArrowLeft, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiChangeProductLength, downloadImage, getPresignedUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AddToCataloguePanel from "./AddToCataloguePanel";

interface ChangeProductLengthProps {
  s3Key: string;
  imageUrl: string;
  onBack: () => void;
}

export default function ChangeProductLength({ s3Key, imageUrl, onBack }: ChangeProductLengthProps) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<"chain" | "size">("chain");
  const [length, setLength] = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; s3Key: string } | null>(null);

  const handleSubmit = async () => {
    if (!token || !length.trim()) {
      toast({
        title: "Missing value",
        description: "Please enter a length value.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await apiChangeProductLength(token, s3Key, mode, length.trim());
      const displayUrl = await getPresignedUrl(token, res.s3_key);
      setResult({ url: displayUrl, s3Key: res.s3_key });
      toast({ title: "Success", description: "Length changed successfully." });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not change length",
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
      a.download = "tryon-length-changed.png";
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
          <h2 className="text-xl font-semibold">Changing product length...</h2>
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
            <CardTitle className="text-base">Length changed</CardTitle>
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
          <CardTitle className="text-base flex items-center gap-2">
            <Scissors className="h-4 w-4" /> Change product length
          </CardTitle>
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
              <Label>What do you want to change?</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === "chain" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("chain")}
                  className="flex-1"
                >
                  Chain length
                </Button>
                <Button
                  type="button"
                  variant={mode === "size" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("size")}
                  className="flex-1"
                >
                  Overall size
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="length">
                {mode === "chain" ? "Desired chain length" : "Desired size"}
              </Label>
              <Input
                id="length"
                placeholder={
                  mode === "chain"
                    ? "e.g. choker, princess (18\"), matinee, +5cm, -10cm"
                    : "e.g. larger, smaller, +20%, ring size 7"
                }
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {mode === "chain"
                  ? "Describe the new chain length in your own words (necklaces, bracelets, anklets)."
                  : "Describe how to rescale the overall piece in your own words."}
              </p>
            </div>
          </div>

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!length.trim() || !token}
            className="min-w-[200px]"
          >
            Change length
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

