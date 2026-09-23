import { useState } from "react";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, TabValue } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { PauseCircle, SlidersHorizontal } from "lucide-react";
import { useGenerationQueueOptional } from "@/contexts/GenerationQueueContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import ModelTryOn from "@/components/ModelTryOn";
import MyGallery from "@/components/MyGallery";
import ManageModels from "@/components/ManageModels";
import ManagePoses from "@/components/ManagePoses";
import ManageClothing from "@/components/ManageClothing";
import ManageCloseUpPoses from "@/components/ManageCloseUpPoses";
import ManageProductAngles from "@/components/ManageProductAngles";
import ManageProductSideAngles from "@/components/ManageProductSideAngles";
import ManageModelPoses from "@/components/ManageModelPoses";
import ManageBackgrounds from "@/components/ManageBackgrounds";
import ManualPhotoEditor, { ManualEditTool } from "@/components/ManualPhotoEditor";
import UploadStudioShoot from "@/components/UploadStudioShoot";
import EditImage from "@/components/EditImage";
import BrandKit from "@/components/BrandKit";
import ProductBrandKit from "@/components/ProductBrandKit";
import GenerationUsage from "@/components/GenerationUsage";
import GenerationQueue from "@/components/GenerationQueue";
import ManageCatalogue from "@/components/ManageCatalogue";
import ManageCatalogueFields from "@/components/ManageCatalogueFields";
import ManageCatalogueTheme from "@/components/ManageCatalogueTheme";
import ManageCatalogViewers from "@/components/ManageCatalogViewers";
import VideoShoot from "@/components/VideoShoot";
import type { VideoCampaignSource } from "@/components/VideoCampaignForm";

function PremiumModelPauseBanner({ onViewQueue }: { onViewQueue: () => void }) {
  const queue = useGenerationQueueOptional();
  const pausedJobs = (queue?.jobs ?? []).filter(
    (job) => job.status === "processing" && Boolean(job.status_message?.trim())
  );
  if (pausedJobs.length === 0) return null;
  return (
    <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-950 [&>svg]:text-amber-700">
      <PauseCircle className="h-4 w-4" />
      <AlertTitle>Generation paused</AlertTitle>
      <AlertDescription className="space-y-3">
        {pausedJobs.map((job) => (
          <p key={job.uid}>
            <span className="font-medium">{job.title}</span>
            {": "}
            {job.status_message}
          </p>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={onViewQueue}>
          View queue
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabValue>("uploadStudioShoot");
  const [manualEditImage, setManualEditImage] = useState<{
    s3Key: string;
    imageUrl: string;
    initialTool?: ManualEditTool;
  } | null>(null);
  const [editImage, setEditImage] = useState<{ s3Key: string; imageUrl: string } | null>(null);
  const [tryOnJewellery, setTryOnJewellery] = useState<{ s3Key: string; imageUrl?: string } | null>(null);
  const [videoShootSource, setVideoShootSource] = useState<VideoCampaignSource | null>(null);

  const handleManualPhotoEdit = (
    s3Key: string,
    imageUrl: string,
    initialTool: ManualEditTool = "background"
  ) => {
    setManualEditImage({ s3Key, imageUrl, initialTool });
    setActiveTab("manualPhotoEdit");
  };

  const handleEditImage = (s3Key: string, imageUrl: string) => {
    setEditImage({ s3Key, imageUrl });
    setActiveTab("editImage");
  };

  const handleOpenTryOnWithJewellery = (s3Key: string, imageUrl: string) => {
    setTryOnJewellery({ s3Key, imageUrl });
    setActiveTab("tryon");
  };

  const handleOpenVideoShoot = (source: VideoCampaignSource) => {
    setVideoShootSource(source);
    setActiveTab("videoShoot");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-background/95 backdrop-blur px-4">
            <SidebarTrigger className="mr-4" />
            <h1 className="text-lg font-bold tracking-tight">axonGem Admin</h1>
          </header>

          <main
            className={cn(
              "flex-1 p-6",
              activeTab === "modelPoses" ? "w-full max-w-[min(100%,90rem)]" : "max-w-6xl"
            )}
          >
            {activeTab !== "generationQueue" ? (
              <PremiumModelPauseBanner onViewQueue={() => setActiveTab("generationQueue")} />
            ) : null}
            {activeTab === "tryon" && (
              <ModelTryOn
                s3Key={tryOnJewellery?.s3Key}
                imageUrl={tryOnJewellery?.imageUrl}
                onEditImage={handleEditImage}
                onManualPhotoEdit={handleManualPhotoEdit}
                onOpenVideoShoot={handleOpenVideoShoot}
                onQueued={() => setTryOnJewellery(null)}
                onViewQueue={() => setActiveTab("generationQueue")}
              />
            )}

            {activeTab === "videoShoot" && (
              <VideoShoot
                initialSource={videoShootSource}
                onQueued={() => setVideoShootSource(null)}
                onViewQueue={() => setActiveTab("generationQueue")}
              />
            )}

            {activeTab === "manualPhotoEdit" && (
              manualEditImage ? (
                <ManualPhotoEditor
                  s3Key={manualEditImage.s3Key}
                  imageUrl={manualEditImage.imageUrl}
                  initialTool={manualEditImage.initialTool}
                  onBack={() => setManualEditImage(null)}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-20">
                    <SlidersHorizontal className="mb-4 h-16 w-16 text-muted-foreground/40" />
                    <h2 className="text-xl font-semibold">Manual photo editing</h2>
                    <p className="mt-2 text-muted-foreground text-center max-w-sm">
                      Go to My Gallery and click the sliders button on a generated image to change
                      background, metal colour, or merge metal patches — then Save when done.
                    </p>
                  </CardContent>
                </Card>
              )
            )}

            {activeTab === "generationUsage" && <GenerationUsage />}
            {activeTab === "generationQueue" && (
              <GenerationQueue
                onEditImage={handleEditImage}
                onManualPhotoEdit={handleManualPhotoEdit}
                onOpenModelPoses={() => setActiveTab("modelPoses")}
                onOpenGallery={() => setActiveTab("gallery")}
              />
            )}
            {activeTab === "gallery" && (
              <MyGallery
                onEditImage={handleEditImage}
                onManualPhotoEdit={handleManualPhotoEdit}
                onOpenTryOnWithJewellery={handleOpenTryOnWithJewellery}
                onOpenVideoShoot={handleOpenVideoShoot}
              />
            )}
            {activeTab === "uploadStudioShoot" && (
              <UploadStudioShoot
                onEditImage={handleEditImage}
                onManualPhotoEdit={handleManualPhotoEdit}
                onViewQueue={() => setActiveTab("generationQueue")}
              />
            )}
            {activeTab === "brandKit" && <BrandKit />}
            {activeTab === "productBrandKit" && <ProductBrandKit />}
            {activeTab === "editImage" && (
              <EditImage
                imageUrl={editImage?.imageUrl ?? null}
                sourceImageS3Key={editImage?.s3Key ?? null}
                onEditImage={handleEditImage}
                onManualPhotoEdit={handleManualPhotoEdit}
                onQueued={() => setEditImage(null)}
                onViewQueue={() => setActiveTab("generationQueue")}
              />
            )}
            {activeTab === "models" && <ManageModels />}
            {activeTab === "poses" && <ManagePoses />}
            {activeTab === "clothing" && <ManageClothing />}
            {activeTab === "closeUpPoses" && <ManageCloseUpPoses />}
            {activeTab === "productAngles" && <ManageProductAngles />}
            {activeTab === "productSideAngles" && <ManageProductSideAngles />}
            {activeTab === "modelPoses" && (
              <ManageModelPoses onViewQueue={() => setActiveTab("generationQueue")} />
            )}
            {activeTab === "backgrounds" && <ManageBackgrounds />}
            {activeTab === "catalogue" && (
              <ManageCatalogue onOpenVideoShoot={handleOpenVideoShoot} />
            )}
            {activeTab === "catalogueFields" && <ManageCatalogueFields />}
            {activeTab === "catalogueTheme" && <ManageCatalogueTheme />}
            {activeTab === "catalogViewerManagement" && <ManageCatalogViewers />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
