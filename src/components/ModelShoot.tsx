import { useEffect, useState, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListFemaleAdultModels,
  apiListFemaleChildModels,
  apiListMaleAdultModels,
  apiListMaleChildModels,
  apiListPoses,
  apiListModelPosesForModel,
  apiGetBackgroundImages,
  apiGenerateTryOnPoseBg,
  getPresignedUrl,
  type ModelRecord,
  type PoseRecord,
  type ModelPoseRecord,
  TryOnAnalysis,
} from "@/lib/api";
import ModelShootResults from "@/components/ModelShootResults";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Upload, ImageIcon, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";
import { cn } from "@/lib/utils";

