import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AddToCataloguePanel from "@/components/AddToCataloguePanel";
import { apiGetNextStudioShootCode, downloadImage, type StudioShootResult } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface StudioShootResultsProps {
  loading: boolean;
  results: StudioShootResult | null;
  onBack: () => void;
  token: string | null;
}

export default function StudioShootResults({
  loading,
  results,
  onBack,
  token,
}: StudioShootResultsProps) {
  const { toast } = useToast();
  const [nextItemCode, setNextItemCode] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void apiGetNextStudioShootCode(token)
      .then((data) => {
        if (!cancelled) setNextItemCode(data.code || "");
      })
      .catch(() => {
        if (!cancelled) setNextItemCode("");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleDownload = async (s3Key: string, filename: string) => {
    if (!token) return;
    try {
      const blob = await downloadImage(token, s3Key);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
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

  const imageItems = useMemo(() => {
    if (!results?.frontImageS3Key || !results.frontImageUrl) return [];
    const items = [
      {
        label: "Front View",
        url: results.frontImageUrl,
        s3Key: results.frontImageS3Key,
        file: "studio-shoot-front.png",
      },
    ];
    if (results.sideImageS3Key && results.sideImageUrl) {
      items.push({
        label: "Side View",
        url: results.sideImageUrl,
        s3Key: results.sideImageS3Key,
        file: "studio-shoot-side.png",
      });
    }
    return items;
  }, [results]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold">Generating your studio shoot images...</h2>
          <p className="text-sm text-muted-foreground">This may take some time. Please don't close this page.</p>
        </div>
      </div>
    );
  }

  if (!results) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Studio Shoot
        </Button>
        <AddToCataloguePanel
          token={token}
          analysis={null}
          images={imageItems.map((item) => ({ url: item.url, s3Key: item.s3Key }))}
          formOverrides={{
            category: "Studio Shoot",
            itemCode: nextItemCode,
          }}
        />
      </div>

      {results.status === "partial" && results.sideError && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="pt-6 text-sm text-amber-900">
            Front view generated successfully, but the side view failed: {results.sideError}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated Studio Shoot Images</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-6 ${imageItems.length > 1 ? "md:grid-cols-2" : "md:max-w-lg"}`}>
            {imageItems.map((item) => (
              <div key={item.label} className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <div className="overflow-hidden rounded-lg border shadow-sm">
                  <img src={item.url} alt={item.label} className="w-full object-contain" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleDownload(item.s3Key, item.file)}
                  disabled={!token}
                >
                  <Download className="h-4 w-4" /> Download {item.label}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
