import { Download, ArrowLeft, Loader2, Scissors, Palette, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AddToCataloguePanel from "@/components/AddToCataloguePanel";
import { downloadImage, type TryOnAnalysis } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface TryOnResultsProps {
  loading: boolean;
  results: {
    front: string;
    closeUp?: string;
    frontKey: string;
    closeUpKey?: string;
    analysis?: TryOnAnalysis | null;
  } | null;
  onBack: () => void;
  token: string | null;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
}

export default function TryOnResults({
  loading,
  results,
  onBack,
  token,
  onEditImage,
  onChangeColour,
  onChangeLength,
}: TryOnResultsProps) {
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
          <h2 className="text-xl font-semibold">Generating your try-on images...</h2>
          <p className="text-sm text-muted-foreground">This may take some time. Please don't close this page.</p>
        </div>
      </div>
    );
  }

  if (!results) return null;

  const imageItems: Array<{ label: string; url: string; s3Key: string; file: string }> = [
    {
      label: "Front View",
      url: results.front,
      s3Key: results.frontKey,
      file: "tryon-front.png",
    },
    ...(results.closeUp && results.closeUpKey
      ? [
          {
            label: "Close-Up View",
            url: results.closeUp,
            s3Key: results.closeUpKey,
            file: "tryon-close-up.png",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Try On
        </Button>
        <AddToCataloguePanel
          token={token}
          analysis={results.analysis}
          images={imageItems.map((i) => ({ url: i.url, s3Key: i.s3Key }))}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated Try-On Images</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-6 ${results.closeUp && results.closeUpKey ? "md:grid-cols-2" : "md:max-w-lg"}`}>
            {imageItems.map((item) => (
              <div key={item.label} className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <div className="group relative overflow-hidden rounded-lg border shadow-sm">
                  <img src={item.url} alt={item.label} className="w-full transition group-hover:scale-[1.01]" />
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {onEditImage && (
                      <button
                        onClick={() => onEditImage(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Edit image"
                      >
                        <Pencil className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                    {onChangeColour && (
                      <button
                        onClick={() => onChangeColour(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change colour"
                      >
                        <Palette className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                    {onChangeLength && (
                      <button
                        onClick={() => onChangeLength(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change length"
                      >
                        <Scissors className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => handleDownload(item.s3Key, item.file)}
                    disabled={!token}
                  >
                    <Download className="h-4 w-4" /> Download {item.label}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
