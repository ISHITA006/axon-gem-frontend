import { useState } from "react";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, TabValue } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Palette, Scissors } from "lucide-react";
import ModelTryOn from "@/components/ModelTryOn";
import ModelShoot from "@/components/ModelShoot";
import MyGallery from "@/components/MyGallery";
import ManageModels from "@/components/ManageModels";
import ManagePoses from "@/components/ManagePoses";
import ManageCloseUpPoses from "@/components/ManageCloseUpPoses";
import ManageModelPoses from "@/components/ManageModelPoses";
import ManageBackgrounds from "@/components/ManageBackgrounds";
import ManageCatalogViewers from "@/components/ManageCatalogViewers";
import ChangeProductColour from "@/components/ChangeProductColour";
import ChangeProductLength from "@/components/ChangeProductLength";
import ChangeEmbroideryPrint from "@/components/ChangeEmbroideryPrint";
import UploadStudioShoot from "@/components/UploadStudioShoot";
import ManageCatalogue from "@/components/ManageCatalogue";
import EditImage from "@/components/EditImage";
import ModelTryOnVideo from "@/components/ModelTryOnVideo";
import GenerateNewDesigns from "@/components/GenerateNewDesigns";
import BrandKit from "@/components/BrandKit";

const MODEL_TRY_ON_VIDEO_FRONT_IMAGE_S3KEY_STORAGE_KEY = "auro:modelTryOnVideo:frontImageS3Key";

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabValue>("tryon");
  const [changeColourImage, setChangeColourImage] = useState<{ s3Key: string; imageUrl: string } | null>(null);
  const [changeLengthImage, setChangeLengthImage] = useState<{ s3Key: string; imageUrl: string } | null>(null);
  const [editImage, setEditImage] = useState<{ s3Key: string; imageUrl: string } | null>(null);
  const [tryOnJewellery, setTryOnJewellery] = useState<{ s3Key: string; imageUrl?: string } | null>(null);
  
  const handleChangeColour = (s3Key: string, imageUrl: string) => {
    setChangeColourImage({ s3Key, imageUrl });
    setActiveTab("colour");
  };

  const handleEditImage = (s3Key: string, imageUrl: string) => {
    setEditImage({ s3Key, imageUrl });
    setActiveTab("editImage");
  };

  const handleEditVideo = (s3Key: string, _imageUrl: string) => {
    try {
      window.localStorage.setItem(MODEL_TRY_ON_VIDEO_FRONT_IMAGE_S3KEY_STORAGE_KEY, s3Key);
    } catch {
      // no-op: if storage is unavailable, we can still navigate to the tab
    }
    setActiveTab("video");
  };

  const handleChangeLength = (s3Key: string, imageUrl: string) => {
    setChangeLengthImage({ s3Key, imageUrl });
    setActiveTab("length");
  };

  const handleOpenTryOnWithJewellery = (s3Key: string, imageUrl: string) => {
    setTryOnJewellery({ s3Key, imageUrl });
    setActiveTab("tryon");
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
            {activeTab === "tryon" && (
              <ModelTryOn
                s3Key={tryOnJewellery?.s3Key}
                imageUrl={tryOnJewellery?.imageUrl}
                onEditImage={handleEditImage}
                onChangeColour={handleChangeColour}
                onChangeLength={handleChangeLength}
              />
            )}
            {activeTab === "shoot" && (
              <ModelShoot
                onEditImage={handleEditImage}
                onChangeColour={handleChangeColour}
                onChangeLength={handleChangeLength}
              />
            )}

            {activeTab === "colour" && (
              changeColourImage ? (
                <ChangeProductColour
                  s3Key={changeColourImage.s3Key}
                  imageUrl={changeColourImage.imageUrl}
                  onBack={() => setChangeColourImage(null)}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-20">
                    <Palette className="mb-4 h-16 w-16 text-muted-foreground/40" />
                    <h2 className="text-xl font-semibold">Change Product Colour</h2>
                    <p className="mt-2 text-muted-foreground text-center max-w-sm">
                      Go to My Gallery and click the edit (palette) button on a try-on image to change its colour.
                    </p>
                  </CardContent>
                </Card>
              )
            )}

            {activeTab === "length" && (
              changeLengthImage ? (
                <ChangeProductLength
                  s3Key={changeLengthImage.s3Key}
                  imageUrl={changeLengthImage.imageUrl}
                  onBack={() => setChangeLengthImage(null)}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-20">
                    <Scissors className="mb-4 h-16 w-16 text-muted-foreground/40" />
                    <h2 className="text-xl font-semibold">Change Product Length</h2>
                    <p className="mt-2 text-muted-foreground text-center max-w-sm">
                      Go to My Gallery and click the scissors button on a try-on image to adjust its chain length or overall size.
                    </p>
                  </CardContent>
                </Card>
              )
            )}

            {activeTab === "generateNewDesigns" && (
              <GenerateNewDesigns
                onEditImage={handleEditImage}
                onChangeColour={handleChangeColour}
                onChangeLength={handleChangeLength}
                onOpenTryOnWithJewellery={handleOpenTryOnWithJewellery}
              />
            )}

            {activeTab === "embroideryPrint" && (
              <ChangeEmbroideryPrint
                onEditImage={handleEditImage}
                onChangeColour={handleChangeColour}
                onChangeLength={handleChangeLength}
                onOpenTryOnWithJewellery={handleOpenTryOnWithJewellery}
              />
            )}

            {activeTab === "video" && <ModelTryOnVideo />}

            {activeTab === "gallery" && (
              <MyGallery
                onEditImage={handleEditImage}
                onChangeColour={handleChangeColour}
                onChangeLength={handleChangeLength}
                onEditVideo={handleEditVideo}
                onOpenTryOnWithJewellery={handleOpenTryOnWithJewellery}
              />
            )}
            {activeTab === "catalogue" && (
              <ManageCatalogue
                onEditImage={handleEditImage}
                onChangeColour={handleChangeColour}
                onChangeLength={handleChangeLength}
                onEditVideo={handleEditVideo}
              />
            )}
            {activeTab === "uploadStudioShoot" && <UploadStudioShoot />}
            {activeTab === "brandKit" && <BrandKit />}
            {activeTab === "editImage" && (
              <EditImage
                imageUrl={editImage?.imageUrl ?? null}
                sourceImageS3Key={editImage?.s3Key ?? null}
                onEditImage={handleEditImage}
                onChangeColour={handleChangeColour}
                onChangeLength={handleChangeLength}
              />
            )}
            {activeTab === "models" && <ManageModels />}
            {activeTab === "poses" && <ManagePoses />}
            {activeTab === "closeUpPoses" && <ManageCloseUpPoses />}
            {activeTab === "modelPoses" && <ManageModelPoses />}
            {activeTab === "backgrounds" && <ManageBackgrounds />}
            {activeTab === "catalogViewerManagement" && <ManageCatalogViewers />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
