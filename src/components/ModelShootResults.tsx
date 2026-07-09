import { ArrowLeft, Download, Loader2, Palette, Pencil, Scissors } from "lucide-react";
import AddToCataloguePanel from "@/components/AddToCataloguePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { downloadImage, TryOnAnalysis } from "@/lib/api";

interface ModelShootResultsProps {
  loading: boolean;
  results: { imageUrl: string; imageKey: string; analysis?: TryOnAnalysis | null } | null;
  onBack: () => void;
  token: string | null;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
}

export default function ModelShootResults({
  loading,
  results,
  onBack,
  token,
  onEditImage,
  onChangeColour,
  onChangeLength,
}: ModelShootResultsProps) {
  const { toast } = useToast();

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


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Generating your model shoot image...</h2>
          <p className="text-sm text-muted-foreground">This may take some time. Please don't close this page.</p>
        </div>
      </div>
    );
  }

  if (!results) return null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Model Shoot
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
          <CardTitle className="text-base">Generated Model Shoot</CardTitle>
          <AddToCataloguePanel
            token={token}
            analysis={results.analysis}
            images={[{ url: results.imageUrl, s3Key: results.imageKey }]}
          />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-full max-w-xl">
                <div className="group relative overflow-hidden rounded-lg border shadow-sm">
                  <img
                    src={results.imageUrl}
                    alt="Model Shoot"
                    className="h-auto max-h-[60vh] w-full object-contain transition group-hover:scale-[1.01]"
                  />
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {onEditImage && (
                      <button
                        onClick={() => onEditImage(results.imageKey, results.imageUrl)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Edit image"
                      >
                        <Pencil className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                    {onChangeColour && (
                      <button
                        onClick={() => onChangeColour(results.imageKey, results.imageUrl)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change colour"
                      >
                        <Palette className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                    {onChangeLength && (
                      <button
                        onClick={() => onChangeLength(results.imageKey, results.imageUrl)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change length"
                      >
                        <Scissors className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={() => handleDownload(results.imageKey, "model-shoot.png")} disabled={!token}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

