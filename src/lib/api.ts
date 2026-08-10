import { compressImageForUpload } from "./imageCompression";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

// All images sent for generation / S3 upload are capped at 10 MB and 1080p.
async function asUploadableImage(file: File): Promise<File> {
  return compressImageForUpload(file);
}

type ApiErrorDetail = string | { msg?: string }[] | undefined;

async function parseApiErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({ detail: fallback }))) as {
    detail?: ApiErrorDetail;
    message?: string;
    error?: string;
  };
  const { detail } = body;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => d?.msg).filter((m): m is string => Boolean(m));
    if (msgs.length) return msgs.join(", ");
  }
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  return fallback;
}

async function assertOk(res: Response, fallback: string): Promise<void> {
  if (!res.ok) throw new Error(await parseApiErrorMessage(res, fallback));
}

export async function apiLogin(username: string, password: string) {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  const res = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  await assertOk(res, "Login failed");
  return res.json() as Promise<{ access_token: string; token_type: string; expires_in_minutes: number }>;
}

export type CatalogViewerRecord = {
  uid: string;
  username: string;
  password: string;
  active: boolean;
};

export async function apiCreateCatalogViewer(token: string, username: string, password: string) {
  const params = new URLSearchParams({
    username,
    password,
  });
  const res = await fetch(`${API_BASE_URL}/catalog-viewer-manager?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to create catalog viewer user");
  return res.json() as Promise<CatalogViewerRecord>;
}

export async function apiListCatalogViewers(token: string) {
  const res = await fetch(`${API_BASE_URL}/catalog-viewer-manager`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch catalog viewer users");
  return res.json() as Promise<CatalogViewerRecord[]>;
}

export async function apiRevokeCatalogViewer(token: string, uid: string) {
  const res = await fetch(
    `${API_BASE_URL}/catalog-viewer-manager/${encodeURIComponent(uid)}/revoke`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  await assertOk(res, "Failed to revoke access");
  return res.json() as Promise<{ uid: string; active: boolean }>;
}

export async function apiActivateCatalogViewer(token: string, uid: string) {
  const res = await fetch(
    `${API_BASE_URL}/catalog-viewer-manager/${encodeURIComponent(uid)}/activate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  await assertOk(res, "Failed to activate access");
  return res.json() as Promise<{ uid: string; active: boolean }>;
}

export async function apiGetModelImages(token: string) {
  const res = await fetch(`${API_BASE_URL}/get-all-model-images-s3-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch model images");
  return res.json() as Promise<{ Key: string }[]>;
}

export type ModelRecord = {
  uid: string;
  name: string;
  gender: string;
  category: string;
  image_s3_key: string;
};

export async function apiListModels(token: string) {
  const res = await fetch(`${API_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch models");
  return res.json() as Promise<ModelRecord[]>;
}

export async function apiListFemaleAdultModels(token: string) {
  const res = await fetch(`${API_BASE_URL}/models/female-adult`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch female adult models");
  return res.json() as Promise<ModelRecord[]>;
}

export async function apiListFemaleChildModels(token: string) {
  const res = await fetch(`${API_BASE_URL}/models/female-child`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch female child models");
  return res.json() as Promise<ModelRecord[]>;
}

export async function apiListMaleAdultModels(token: string) {
  const res = await fetch(`${API_BASE_URL}/models/male-adult`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch male adult models");
  return res.json() as Promise<ModelRecord[]>;
}

export async function apiListMaleChildModels(token: string) {
  const res = await fetch(`${API_BASE_URL}/models/male-child`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch male child models");
  return res.json() as Promise<ModelRecord[]>;
}

export async function apiDeleteModel(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/models/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Delete failed");
}

export type PoseRecord = {
  uid: string;
  name: string;
  gender: string;
  adult: boolean;
  child: boolean;
  image_s3_key: string;
};

export async function apiListPoses(token: string) {
  const res = await fetch(`${API_BASE_URL}/poses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch poses");
  return res.json() as Promise<PoseRecord[]>;
}

export async function apiListFemalePoses(token: string) {
  const res = await fetch(`${API_BASE_URL}/poses/female`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch female poses");
  return res.json() as Promise<PoseRecord[]>;
}

export async function apiListMalePoses(token: string) {
  const res = await fetch(`${API_BASE_URL}/poses/male`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch male poses");
  return res.json() as Promise<PoseRecord[]>;
}

export type CreatePosePayload = {
  name: string;
  gender: string;
  adult: boolean;
  child: boolean;
  file: File;
};

export async function apiCreatePose(token: string, payload: CreatePosePayload) {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("gender", payload.gender);
  formData.append("adult", String(payload.adult));
  formData.append("child", String(payload.child));
  formData.append("file", await asUploadableImage(payload.file));

  const res = await fetch(`${API_BASE_URL}/poses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create pose");

  return res.json() as Promise<PoseRecord>;
}

export async function apiDeletePose(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/poses/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Delete failed");
}

export type CloseUpPoseRecord = {
  uid: string;
  name: string;
  image_s3_key: string;
};

export async function apiListCloseUpPoses(token: string) {
  const res = await fetch(`${API_BASE_URL}/close-up-poses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch close-up poses");
  return res.json() as Promise<CloseUpPoseRecord[]>;
}

export async function apiCreateCloseUpPose(token: string, payload: { name: string; file: File }) {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("file", await asUploadableImage(payload.file));

  const res = await fetch(`${API_BASE_URL}/close-up-poses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create close-up pose");
  return res.json() as Promise<CloseUpPoseRecord>;
}

export async function apiDeleteCloseUpPose(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/close-up-poses/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Delete failed");
}

export type ProductAngleRecord = {
  uid: string;
  name: string;
  image_s3_key: string;
};

export async function apiListProductAngles(token: string) {
  const res = await fetch(`${API_BASE_URL}/product-angles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch product angles");
  return res.json() as Promise<ProductAngleRecord[]>;
}

export async function apiCreateProductAngle(token: string, payload: { name: string; file: File }) {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("file", await asUploadableImage(payload.file));

  const res = await fetch(`${API_BASE_URL}/product-angles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create product angle");
  return res.json() as Promise<ProductAngleRecord>;
}

export async function apiDeleteProductAngle(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/product-angles/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Delete failed");
}

export type ProductSideAngleRecord = {
  uid: string;
  name: string;
  image_s3_key: string;
};

export async function apiListProductSideAngles(token: string) {
  const res = await fetch(`${API_BASE_URL}/product-side-angles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch product side angles");
  return res.json() as Promise<ProductSideAngleRecord[]>;
}

export async function apiCreateProductSideAngle(token: string, payload: { name: string; file: File }) {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("file", await asUploadableImage(payload.file));

  const res = await fetch(`${API_BASE_URL}/product-side-angles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create product side angle");
  return res.json() as Promise<ProductSideAngleRecord>;
}

export async function apiDeleteProductSideAngle(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/product-side-angles/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Delete failed");
}

export type ModelPoseRecord = {
  uid: string;
  model_uid: string;
  pose_uid: string;
  image_s3_key: string;
};

export type ModelPoseCreatePayload = {
  model_uid: string;
  pose_uid: string;
  image_s3_key: string;
};

export type ModelPoseUpdatePayload = ModelPoseCreatePayload;

export async function apiListModelPoses(token: string) {
  const res = await fetch(`${API_BASE_URL}/model-poses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch model poses");
  return res.json() as Promise<ModelPoseRecord[]>;
}

export async function apiListModelPosesForModel(token: string, modelUid: string) {
  const res = await fetch(
    `${API_BASE_URL}/model-poses/by-model/${encodeURIComponent(modelUid)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(res, "Failed to fetch model poses for model");
  return res.json() as Promise<ModelPoseRecord[]>;
}

export async function apiGetModelPose(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/model-poses/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch model pose");
  return res.json() as Promise<ModelPoseRecord>;
}

export async function apiCreateModelPose(token: string, payload: ModelPoseCreatePayload) {
  const res = await fetch(`${API_BASE_URL}/model-poses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  await assertOk(res, "Create failed");
  return res.json() as Promise<ModelPoseRecord>;
}

export async function apiUpdateModelPose(token: string, uid: string, payload: ModelPoseUpdatePayload) {
  const res = await fetch(`${API_BASE_URL}/model-poses/${encodeURIComponent(uid)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  await assertOk(res, "Update failed");
  return res.json() as Promise<ModelPoseRecord>;
}

export async function apiDeleteModelPose(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/model-poses/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Delete failed");
}

/** Reads S3 key from POST /generate-model-pose-image JSON (field name may vary by backend). */
export function modelPoseImageS3KeyFromGenerateResponse(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid response from image generation");
  }
  const o = data as Record<string, unknown>;
  const key = o.image_s3_key ?? o.s3_key;
  if (typeof key === "string" && key.length > 0) {
    return key;
  }
  throw new Error("Image was generated but the response did not include an S3 key");
}

export async function apiGenerateModelPoseImage(
  token: string,
  modelS3Key: string,
  poseS3Key: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    model_s3_key: modelS3Key,
    pose_s3_key: poseS3Key,
  });
  const res = await fetch(`${API_BASE_URL}/generate-model-pose-image?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Generation failed");
  return res.json() as Promise<Record<string, unknown>>;
}

export async function apiGetModelPoseImages(token: string) {
  const res = await fetch(`${API_BASE_URL}/get-all-model-pose-images-s3-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch model pose images");
  return res.json() as Promise<{ Key: string }[]>;
}

export async function apiGetBackgroundImages(token: string) {
  const res = await fetch(`${API_BASE_URL}/get-all-background-images-s3-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch background images");
  return res.json() as Promise<{ Key: string }[]>;
}

export async function getPresignedUrl(token: string, s3Key: string): Promise<string> {
  const res = await fetch(
    `${API_BASE_URL}/presigned-url?s3_key=${encodeURIComponent(s3Key)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(res, "Failed to get presigned URL");
  const data = await res.json();
  return data.url;
}

/** Analysis metadata returned with generate-jewellery-try-on-images. */
export type TryOnAnalysis = {
  name?: string;
  description?: string;
  item_code?: string;
  jewellery_type?: unknown;
  category?: unknown;
  /** Optional field if analysis explicitly provides catalogue category. */
  catalogue_category?: unknown;
  gender?: unknown;
  age?: unknown;
  metal?: unknown;
  metal_purity?: unknown;
  metal_weight_grams?: unknown;
  stone_type?: unknown;
  stone_cut?: unknown;
  stone_count?: unknown;
  stone_carat?: unknown;
  setting_type?: unknown;
  design?: unknown;
  framing?: unknown;
  style_note?: unknown;
};

export type GenerateTryOnResponse = {
  front_image_s3_key: string;
  close_up_image_s3_key?: string | null;
  analysis?: TryOnAnalysis | null;
};

export async function apiCreateCatalogueItem(
  token: string,
  payload: {
    name: string;
    jewelleryType: string;
    category: string;
    itemCode: string;
    gender: string;
    age: string;
    metal: string;
    settingType: string;
    design: string;
    imageS3Keys: string[];
    description?: string;
    metalPurity?: string;
    metalWeightGrams?: string;
    stoneType?: string;
    stoneCut?: string;
    stoneCount?: string;
    stoneCarat?: string;
  }
) {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("jewellery_type", payload.jewelleryType);
  formData.append("category", payload.category);
  formData.append("item_code", payload.itemCode);
  formData.append("gender", payload.gender);
  formData.append("age", payload.age);
  formData.append("metal", payload.metal);
  formData.append("setting_type", payload.settingType);
  formData.append("design", payload.design);
  payload.imageS3Keys.forEach((key) => {
    formData.append("image_s3_keys", key);
  });
  if (payload.description?.trim()) {
    formData.append("description", payload.description.trim());
  }
  const appendOptional = (field: string, value?: string) => {
    if (value != null && value.trim() !== "") formData.append(field, value.trim());
  };
  appendOptional("metal_purity", payload.metalPurity);
  appendOptional("metal_weight_grams", payload.metalWeightGrams);
  appendOptional("stone_type", payload.stoneType);
  appendOptional("stone_cut", payload.stoneCut);
  appendOptional("stone_count", payload.stoneCount);
  appendOptional("stone_carat", payload.stoneCarat);

  const res = await fetch(`${API_BASE_URL}/catalogue`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create catalogue item");

  return res.json() as Promise<{ uid: string; name: string; image_s3_key: string }>;
}

export async function apiEditCatalogueImage(
  token: string,
  payload: {
    originalImageS3Key: string;
    file: File;
  }
) {
  const formData = new FormData();
  formData.append("original_image_s3_key", payload.originalImageS3Key);
  formData.append("file", await asUploadableImage(payload.file));

  const res = await fetch(`${API_BASE_URL}/edit-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to edit catalogue image");

  const data = (await res.json()) as {
    edited_image_s3_key?: string;
    image_s3_key?: string;
    preview_url?: string;
    image_url?: string;
  };

  return {
    editedImageS3Key: data.edited_image_s3_key ?? data.image_s3_key,
    previewUrl: data.preview_url ?? data.image_url,
  };
}

export type EditImageWithInstructionsResponse = {
  editedImageS3Key?: string;
  previewUrl?: string;
  /** Set when the API returned raw image bytes; revoke with URL.revokeObjectURL when discarding. */
  objectUrl?: string;
};

/**
 * Instruction-based image edit (multipart: edit_instructions, source_image_file, optional reference_image_file).
 */
export async function apiEditImageWithInstructions(
  token: string,
  payload: {
    editInstructions: string;
    sourceImageFile: File;
    referenceImageFile?: File | null;
  }
): Promise<EditImageWithInstructionsResponse> {
  const formData = new FormData();
  formData.append("edit_instructions", payload.editInstructions);
  formData.append("source_image_file", await asUploadableImage(payload.sourceImageFile));
  if (payload.referenceImageFile) {
    formData.append("reference_image_file", await asUploadableImage(payload.referenceImageFile));
  }

  const res = await fetch(`${API_BASE_URL}/edit-image-tool`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to edit image");

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("image/")) {
    const blob = await res.blob();
    return { objectUrl: URL.createObjectURL(blob) };
  }

  const data = (await res.json()) as {
    s3_key?: string;
    url?: string;
  };

  const editedImageS3Key = data.s3_key;
  let previewUrl = data.url;

  if (!previewUrl && editedImageS3Key) {
    previewUrl = await getPresignedUrl(token, editedImageS3Key);
  }

  return { editedImageS3Key, previewUrl };
}

export type CatalogueSortBy = "updated_at" | "created_at" | "name" | "item_code";
export type CatalogueSortDir = "asc" | "desc";

export type CatalogueItem = {
  uid?: string;
  name?: string | null;
  description?: string | null;
  item_code?: string | null;
  jewellery_type?: string | null;
  gender?: string | null;
  age?: string | null;
  metal?: string | null;
  metal_purity?: string | null;
  metal_weight_grams?: string | null;
  stone_type?: string | null;
  stone_cut?: string | null;
  stone_count?: string | null;
  stone_carat?: string | null;
  setting_type?: string | null;
  design?: string | null;
  category?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  images?: Array<{
    uid?: string;
    item_uid?: string | null;
    s3_key?: string | null;
    image_s3_key?: string | null;
    url?: string | null;
    preview_url?: string | null;
  }>;
};

export type CatalogueListResponse = {
  data: CatalogueItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
};

export async function apiGetCatalogueItems(
  token: string,
  params: {
    page: number;
    q?: string | null;
    jewellery_type?: string | null;
    gender?: string | null;
    age?: string | null;
    metal?: string | null;
    setting_type?: string | null;
    design?: string | null;
    category?: string | null;
    metal_purity?: string | null;
    stone_type?: string | null;
    stone_cut?: string | null;
    sort_by?: CatalogueSortBy | null;
    sort_dir?: CatalogueSortDir | null;
  }
) {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page));

  const maybeSet = (k: string, v: string | null | undefined) => {
    if (v == null) return;
    const trimmed = v.trim();
    if (trimmed === "") return;
    sp.set(k, trimmed);
  };

  maybeSet("q", params.q);
  maybeSet("jewellery_type", params.jewellery_type);
  maybeSet("gender", params.gender);
  maybeSet("age", params.age);
  maybeSet("metal", params.metal);
  maybeSet("setting_type", params.setting_type);
  maybeSet("design", params.design);
  maybeSet("category", params.category);
  maybeSet("metal_purity", params.metal_purity);
  maybeSet("stone_type", params.stone_type);
  maybeSet("stone_cut", params.stone_cut);
  maybeSet("sort_by", params.sort_by ?? undefined);
  maybeSet("sort_dir", params.sort_dir ?? undefined);

  const res = await fetch(`${API_BASE_URL}/catalogue/items?${sp.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch catalogue items");
  return res.json() as Promise<CatalogueListResponse>;
}

export async function apiUpdateCatalogueItem(
  token: string,
  uid: string,
  payload: {
    item_code: string;
    name: string;
    jewellery_type: string;
    category: string;
    gender: string;
    age: string;
    metal: string;
    setting_type: string;
    design: string;
    image_s3_keys: string[];
    description?: string | null;
    metal_purity?: string | null;
    metal_weight_grams?: string | null;
    stone_type?: string | null;
    stone_cut?: string | null;
    stone_count?: string | null;
    stone_carat?: string | null;
  }
) {
  const formData = new FormData();
  formData.append("item_code", payload.item_code);
  formData.append("name", payload.name);
  formData.append("jewellery_type", payload.jewellery_type);
  formData.append("category", payload.category);
  formData.append("gender", payload.gender);
  formData.append("age", payload.age);
  formData.append("metal", payload.metal);
  formData.append("setting_type", payload.setting_type);
  formData.append("design", payload.design);
  payload.image_s3_keys.forEach((k) => formData.append("image_s3_keys", k));

  if (payload.description != null) formData.append("description", payload.description);
  if (payload.metal_purity != null) formData.append("metal_purity", payload.metal_purity);
  if (payload.metal_weight_grams != null) formData.append("metal_weight_grams", payload.metal_weight_grams);
  if (payload.stone_type != null) formData.append("stone_type", payload.stone_type);
  if (payload.stone_cut != null) formData.append("stone_cut", payload.stone_cut);
  if (payload.stone_count != null) formData.append("stone_count", payload.stone_count);
  if (payload.stone_carat != null) formData.append("stone_carat", payload.stone_carat);

  const res = await fetch(`${API_BASE_URL}/catalogue/${encodeURIComponent(uid)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to update catalogue item");

  return res.json() as Promise<CatalogueItem>;
}

export async function apiDeleteCatalogueItem(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/catalogue/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  await assertOk(res, "Failed to delete catalogue item");
}

export const TRY_ON_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;
export type TryOnAspectRatio = (typeof TRY_ON_ASPECT_RATIOS)[number];

export const TRY_ON_OUTPUT_QUALITIES = ["1K", "2K", "4K"] as const;
export type TryOnOutputQuality = (typeof TRY_ON_OUTPUT_QUALITIES)[number];

export const DIMENSION_TYPES = [
  "length",
  "height",
  "width",
  "diameter",
  "radius",
  "inner_diameter",
  "drop",
  "thickness",
  "chain_length",
  "circumference",
  "diagonal",
] as const;
export type DimensionType = (typeof DIMENSION_TYPES)[number];

export const DIMENSION_TYPE_LABELS: Record<DimensionType, string> = {
  length: "Length",
  height: "Height",
  width: "Width",
  diameter: "Diameter",
  radius: "Radius",
  inner_diameter: "Inner diameter",
  drop: "Drop length",
  thickness: "Thickness",
  chain_length: "Chain length",
  circumference: "Circumference",
  diagonal: "Diagonal",
};

export const DIMENSION_UNITS = ["mm", "cm", "in"] as const;
export type DimensionUnit = (typeof DIMENSION_UNITS)[number];

export type Measurement = {
  part?: string;
  type: DimensionType;
  value: number;
  unit: DimensionUnit;
};

export type ApiGenerateTryOnOptions = {
  /** Caller-owned flatlay key: skips upload and is not deleted after generation. */
  existingJewelleryS3Key?: string;
  aspectRatio?: TryOnAspectRatio;
  outputQuality?: TryOnOutputQuality;
  /** Apply a specific brand kit's aesthetic. Omit to use the active kit (if any). */
  brandKitUid?: string;
  /** Optional S3 key of a background/scene to place the model in. */
  backgroundS3Key?: string | null;
  /** Optional exact measurements so the piece renders at true real-world size. */
  dimensions?: Measurement[] | null;
  /** When true, `modelPoseS3Key` is sent as `model_s3_key` instead of the base model image. */
  poseSelected?: boolean;
  /** S3 key of the selected model-pose image (required when `poseSelected` is true). */
  modelPoseS3Key?: string | null;
  /** Optional S3 key of a close-up pose reference (only used when generating close-up). */
  closeUpPoseS3Key?: string | null;
};

export async function apiGenerateTryOn(
  token: string,
  jewelleryFile: File | null,
  modelS3Key: string,
  generateCloseUp: boolean,
  options?: ApiGenerateTryOnOptions
) {
  // Keep below common API gateway limits (stricter than the global 10 MB cap).
  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

  const uploadJewelleryImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    const preparedFile = await compressImageForUpload(file, { maxBytes: MAX_UPLOAD_BYTES });
    formData.append("file", preparedFile);

    const uploadRes = await fetch(`${API_BASE_URL}/upload-flatlay-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    await assertOk(uploadRes, "Upload failed");

    const uploadData = (await uploadRes.json()) as { s3_key?: string };
    if (!uploadData.s3_key) {
      throw new Error("Upload failed");
    }
    return uploadData.s3_key;
  };

  let jewelleryS3Key: string | null = null;
  let jewelleryS3KeyIsEphemeral = false;

  try {
    const existingJewellery = options?.existingJewelleryS3Key?.trim();
    if (existingJewellery) {
      jewelleryS3Key = existingJewellery;
    } else {
      if (!jewelleryFile) {
        throw new Error("Jewellery image required");
      }
      jewelleryS3Key = await uploadJewelleryImage(jewelleryFile);
      jewelleryS3KeyIsEphemeral = true;
    }

    const poseSelected = Boolean(options?.poseSelected);
    const modelPoseS3Key = options?.modelPoseS3Key?.trim();
    if (poseSelected && !modelPoseS3Key) {
      throw new Error("Model pose image is required when pose selection is enabled");
    }
    const effectiveModelS3Key = poseSelected && modelPoseS3Key ? modelPoseS3Key : modelS3Key;

    const params = new URLSearchParams({
      model_s3_key: effectiveModelS3Key,
      jewellery_s3_key: jewelleryS3Key,
      generate_close_up: generateCloseUp ? "true" : "false",
      pose_selected: poseSelected ? "true" : "false",
      aspect_ratio: options?.aspectRatio ?? "2:3",
      output_quality: options?.outputQuality ?? "1K",
    });
    const brandKitUid = options?.brandKitUid?.trim();
    if (brandKitUid) params.set("brand_kit_uid", brandKitUid);
    const backgroundS3Key = options?.backgroundS3Key?.trim();
    if (backgroundS3Key) params.set("background_s3_key", backgroundS3Key);
    const measurements = (options?.dimensions ?? []).filter(
      (m) => Number.isFinite(m.value) && m.value > 0
    );
    if (measurements.length) {
      params.set("dimensions", JSON.stringify({ measurements }));
    }
    const closeUpPoseS3Key = options?.closeUpPoseS3Key?.trim();
    if (generateCloseUp && closeUpPoseS3Key) {
      params.set("close_up_pose_s3_key", closeUpPoseS3Key);
    }

    const res = await fetch(`${API_BASE_URL}/generate-jewellery-try-on-images?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    await assertOk(res, "Generation failed");

    return res.json() as Promise<GenerateTryOnResponse>;
  } finally {
    // Cleanup temporary flatlay uploads only (not caller-supplied catalogue keys).
    if (jewelleryS3Key && jewelleryS3KeyIsEphemeral) {
      await apiDeleteS3Object(token, jewelleryS3Key).catch(() => null);
    }
  }
}

export async function apiGetTryOnImages(token: string) {
  const res = await fetch(`${API_BASE_URL}/get-all-tryon-images-s3-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch try-on images");
  return res.json() as Promise<{ Key: string }[]>;
}

export type GalleryCategory = "model-shoot" | "product-shoot" | "modified-product" | "edited-image" | "deleted-catalogue";

export type GalleryItem = {
  uid: string;
  category: GalleryCategory | string;
  image_s3_keys: string[];
  analysis?: Record<string, unknown> | null;
  created_at: string;
  edited_at: string;
};

export type GalleryListResponse = {
  items: GalleryItem[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export async function apiGetGalleryItems(
  token: string,
  params: {
    category: GalleryCategory;
    page: number;
    limit?: number;
  }
) {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page));
  if (params.limit != null) {
    sp.set("limit", String(params.limit));
  }

  let path = "/gallery";
  if (params.category === "model-shoot") {
    path = "/gallery/model-shoot";
  } else if (params.category === "product-shoot") {
    path = "/gallery/product-shoot";
  } else if (params.category === "modified-product") {
    path = "/gallery/modified-product";
  } else if (params.category === "edited-image") {
    sp.set("category", "edited-image");
  } else if (params.category === "deleted-catalogue") {
    path = "/gallery/deleted-catalogue";
  }

  const res = await fetch(`${API_BASE_URL}${path}?${sp.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch gallery items");
  return res.json() as Promise<GalleryListResponse>;
}

export async function apiDeleteGalleryItem(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/gallery/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to delete gallery item");
  return res.json() as Promise<GalleryItem>;
}

export async function downloadMedia(token: string, s3Key: string): Promise<Blob> {
  const res = await fetch(
    `${API_BASE_URL}/download-media?s3_key=${encodeURIComponent(s3Key)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(res, "Failed to download media");
  return res.blob();
}

// Backward-compatible alias used across existing components.
export const downloadImage = downloadMedia;

export async function apiUploadModelImage(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", await asUploadableImage(file));

  const res = await fetch(`${API_BASE_URL}/upload-model-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Upload failed");
  return res.json() as Promise<{ s3_key: string }>;
}

export async function apiUploadFlatlayImage(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", await asUploadableImage(file));

  const res = await fetch(`${API_BASE_URL}/upload-flatlay-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Upload failed");
  return res.json() as Promise<{ s3_key: string }>;
}

export async function apiUploadTryOnImage(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", await asUploadableImage(file));

  const res = await fetch(`${API_BASE_URL}/upload-tryon-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Upload failed");

  return res.json() as Promise<{ s3_key: string }>;
}

export async function apiUploadRawJewelleryImage(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", await asUploadableImage(file));

  const res = await fetch(`${API_BASE_URL}/upload-raw-jewellery-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Upload failed");

  return res.json() as Promise<{ s3_key: string }>;
}

const STUDIO_SHOOT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function compressImageForStudioShoot(file: File, strict: boolean): Promise<File> {
  return compressImageForUpload(file, {
    maxBytes: STUDIO_SHOOT_MAX_UPLOAD_BYTES,
    maxDimension: strict ? 1600 : undefined,
    qualitySteps: strict
      ? [
          ["image/jpeg", 0.75],
          ["image/jpeg", 0.6],
          ["image/webp", 0.65],
          ["image/webp", 0.5],
        ]
      : [
          ["image/jpeg", 0.9],
          ["image/jpeg", 0.8],
          ["image/webp", 0.8],
        ],
    acceptSmallestOnFailure: strict,
    forceReencode: strict,
  });
}

export type StudioShootResult = {
  status: "success" | "partial";
  frontImageS3Key: string;
  frontImageUrl: string;
  frontError?: string | null;
  sideImageS3Key?: string | null;
  sideImageUrl?: string | null;
  sideError?: string | null;
};

export type ApiCreateStudioShootOptions = {
  generateSideView?: boolean;
  sideViewFile?: File | null;
  aspectRatio?: TryOnAspectRatio;
  outputQuality?: TryOnOutputQuality;
  brandKitUid?: string | null;
  backgroundText?: string;
  backgroundFile?: File | null;
  productAngleS3Key?: string | null;
  productSideAngleS3Key?: string | null;
};

export async function apiCreateStudioShoot(
  token: string,
  jewelleryFile: File,
  options?: ApiCreateStudioShootOptions,
): Promise<StudioShootResult> {
  const generateSideView = options?.generateSideView ?? false;

  const postStudioShootRequest = async (
    frontFile: File,
    sideFile?: File | null,
    backgroundFile?: File | null,
  ) => {
    const formData = new FormData();
    formData.append("jewellery_file", frontFile);
    formData.append("generate_side_view", generateSideView ? "true" : "false");
    formData.append("aspect_ratio", options?.aspectRatio ?? "2:3");
    formData.append("output_quality", options?.outputQuality ?? "1K");
    const brandKitUid = options?.brandKitUid;
    if (brandKitUid === null) {
      formData.append("brand_kit_uid", "none");
    } else if (brandKitUid?.trim()) {
      formData.append("brand_kit_uid", brandKitUid.trim());
    }
    if (generateSideView && sideFile) {
      formData.append("side_view_file", sideFile);
    }
    const backgroundText = options?.backgroundText?.trim();
    if (backgroundText) {
      formData.append("background_text", backgroundText);
    }
    if (options?.backgroundFile) {
      formData.append("background_file", backgroundFile ?? options.backgroundFile);
    }
    const productAngleS3Key = options?.productAngleS3Key?.trim();
    if (productAngleS3Key) {
      formData.append("product_angle_s3_key", productAngleS3Key);
    }
    const productSideAngleS3Key = options?.productSideAngleS3Key?.trim();
    if (generateSideView && productSideAngleS3Key) {
      formData.append("product_side_angle_s3_key", productSideAngleS3Key);
    }
    return fetch(`${API_BASE_URL}/create-studio-shoot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  };

  const preparedFile = await compressImageForStudioShoot(jewelleryFile, false);
  const preparedSideFile =
    generateSideView && options?.sideViewFile
      ? await compressImageForStudioShoot(options.sideViewFile, false)
      : null;
  const preparedBackgroundFile = options?.backgroundFile
    ? await compressImageForStudioShoot(options.backgroundFile, false)
    : null;
  let res = await postStudioShootRequest(preparedFile, preparedSideFile, preparedBackgroundFile);

  if (!res.ok) {
    const errMessage = await parseApiErrorMessage(res, "Failed to create studio shoot");
    const isPayloadTooLarge =
      res.status === 413 || errMessage.toUpperCase().includes("FUNCTION_PAYLOAD_TOO_LARGE");

    if (isPayloadTooLarge) {
      const strictFile = await compressImageForStudioShoot(preparedFile, true);
      const strictSideFile =
        preparedSideFile != null
          ? await compressImageForStudioShoot(preparedSideFile, true)
          : null;
      const strictBackgroundFile =
        preparedBackgroundFile != null
          ? await compressImageForStudioShoot(preparedBackgroundFile, true)
          : null;
      res = await postStudioShootRequest(strictFile, strictSideFile, strictBackgroundFile);
      if (!res.ok) {
        const strictErr = await parseApiErrorMessage(res, "Failed to create studio shoot");
        throw new Error(
          strictErr.toUpperCase().includes("FUNCTION_PAYLOAD_TOO_LARGE")
            ? "Image is too large to process. Please upload a smaller image."
            : strictErr
        );
      }
    } else {
      throw new Error(errMessage);
    }
  }

  const data = (await res.json()) as {
    status?: "success" | "partial";
    front_image_s3_key?: string;
    front_image_url?: string;
    front_error?: string | null;
    side_image_s3_key?: string | null;
    side_image_url?: string | null;
    side_error?: string | null;
    cleaned_image_s3_key?: string;
    image_s3_key?: string;
    s3_key?: string;
    preview_url?: string;
    image_url?: string;
    url?: string;
  };

  const frontImageS3Key =
    data.front_image_s3_key ?? data.cleaned_image_s3_key ?? data.image_s3_key ?? data.s3_key ?? "";
  const frontImageUrl =
    data.front_image_url ?? data.preview_url ?? data.image_url ?? data.url ?? "";

  return {
    status: data.status ?? "success",
    frontImageS3Key,
    frontImageUrl,
    frontError: data.front_error ?? null,
    sideImageS3Key: data.side_image_s3_key ?? null,
    sideImageUrl: data.side_image_url ?? null,
    sideError: data.side_error ?? null,
  };
}

export async function apiGetNextStudioShootCode(token: string) {
  const res = await fetch(`${API_BASE_URL}/catalogue/next-studio-shoot-code`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await assertOk(res, "Failed to fetch next studio shoot code");

  return res.json() as Promise<{ code: string; number: number }>;
}

export type CreateModelPayload = {
  name: string;
  gender: string;
  category: string;
  file: File;
};

export async function apiCreateModel(token: string, payload: CreateModelPayload) {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("gender", payload.gender);
  formData.append("category", payload.category);
  formData.append("file", await asUploadableImage(payload.file));

  const res = await fetch(`${API_BASE_URL}/models`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create model");

  return res.json();
}

export async function apiUploadModelPoseImage(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", await asUploadableImage(file));

  const res = await fetch(`${API_BASE_URL}/upload-model-pose-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Upload failed");
  return res.json() as Promise<{ s3_key: string }>;
}

export async function apiUploadBackgroundImage(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", await asUploadableImage(file));

  const res = await fetch(`${API_BASE_URL}/upload-background-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Upload failed");
  return res.json() as Promise<{ s3_key: string }>;
}

export async function apiDeleteS3Object(token: string, s3Key: string) {
  const res = await fetch(
    `${API_BASE_URL}/delete-s3-object?s3_key=${encodeURIComponent(s3Key)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  await assertOk(res, "Delete failed");
  return res.json();
}

export async function apiGetColourName(token: string, hex: string): Promise<{ name: string }> {
  const hexClean = hex.replace(/^#/, "");
  const res = await fetch(
    `${API_BASE_URL}/colour-name?hex=${encodeURIComponent(hexClean)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(res, "Failed to get colour name");
  return res.json();
}

export async function apiChangeProductColour(
  token: string,
  tryOnImageS3Key: string,
  primaryColour: string,
  secondaryColour?: string | null
): Promise<{ detail: string; s3_key: string; url: string }> {
  const params = new URLSearchParams({
    try_on_image_s3_key: tryOnImageS3Key,
    primary_colour: primaryColour,
  });
  if (secondaryColour != null && secondaryColour !== "") {
    params.append("secondary_colour", secondaryColour);
  }
  const res = await fetch(`${API_BASE_URL}/change-product-colour?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to change colour");
  return res.json();
}

export async function apiChangeBackgroundColour(
  token: string,
  imageS3Key: string,
  backgroundColourHex: string
): Promise<{ detail: string; s3_key: string; url: string }> {
  // Backend expects a bare 6-digit hex (e.g. "#F5F5F5"), not a "name (#hex)" string.
  const params = new URLSearchParams({
    image_s3_key: imageS3Key,
    background_colour: backgroundColourHex,
  });
  const res = await fetch(`${API_BASE_URL}/change-background-colour?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to change background colour");
  return res.json();
}

export async function apiChangeMetalColour(
  token: string,
  imageS3Key: string,
  targetColourHex: string,
  sourceColourHex?: string,
  hueTolerance?: number
): Promise<{ detail: string; s3_key: string; url: string }> {
  // Backend accepts a preset name or a bare 6-digit hex (e.g. "#B76E79").
  const params = new URLSearchParams({
    image_s3_key: imageS3Key,
    target_colour: targetColourHex,
  });
  if (sourceColourHex) params.set("source_colour", sourceColourHex);
  // Degrees (3-60); how far a hue may drift from the metal and still be
  // recoloured. Smaller protects stones whose colour is close to the metal's.
  if (hueTolerance !== undefined) params.set("hue_tolerance", String(hueTolerance));
  const res = await fetch(`${API_BASE_URL}/change-metal-colour?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to change metal colour");
  return res.json();
}

export async function apiSmoothReflection(
  token: string,
  imageS3Key: string,
  userMaskBlob: Blob,
  options?: {
    strength?: number;
    darkRatio?: number;
    featherSigma?: number;
  }
): Promise<{ detail: string; s3_key: string; url: string }> {
  const form = new FormData();
  form.append("image_s3_key", imageS3Key);
  form.append("user_mask", userMaskBlob, "user_mask.png");
  if (options?.strength !== undefined) form.append("strength", String(options.strength));
  if (options?.darkRatio !== undefined) {
    form.append("dark_ratio", String(options.darkRatio));
  }
  if (options?.featherSigma !== undefined) {
    form.append("feather_sigma", String(options.featherSigma));
  }
  const res = await fetch(`${API_BASE_URL}/smooth-reflection`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  await assertOk(res, "Failed to smooth reflection");
  return res.json();
}

export async function apiChangeProductLength(
  token: string,
  tryOnImageS3Key: string,
  mode: "chain" | "size",
  length: string
): Promise<{ detail: string; s3_key: string; url: string }> {
  const params = new URLSearchParams({
    try_on_image_s3_key: tryOnImageS3Key,
    mode,
    length,
  });
  const res = await fetch(`${API_BASE_URL}/change-product-length?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to change length");
  return res.json();
}

// ── Brand Kit ────────────────────────────────────────────────────────────────

export type BrandKitAnalysis = {
  overall_vibe?: string;
  model_poses?: string;
  shoot_style?: string;
  camera_settings?: string;
  camera_positioning?: string;
  shoot_angles?: string;
  model_styling?: string;
  colour_palette?: string;
  lighting?: string;
  theme_context?: string;
};

export type BrandKitRecord = {
  uid: string;
  name: string;
  description: string | null;
  image_s3_keys: string[];
  analysis: BrandKitAnalysis | null;
  theme_context: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function apiCreateBrandKit(
  token: string,
  payload: { name: string; description?: string; setActive?: boolean; files: File[] }
) {
  const formData = new FormData();
  formData.append("name", payload.name);
  if (payload.description?.trim()) formData.append("description", payload.description.trim());
  formData.append("set_active", payload.setActive === false ? "false" : "true");
  const prepared = await Promise.all(payload.files.map((file) => asUploadableImage(file)));
  prepared.forEach((file) => formData.append("files", file));

  const res = await fetch(`${API_BASE_URL}/brand-kit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create brand kit");
  return res.json() as Promise<BrandKitRecord>;
}

export async function apiListBrandKits(token: string) {
  const res = await fetch(`${API_BASE_URL}/brand-kit`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch brand kits");
  return res.json() as Promise<BrandKitRecord[]>;
}

export async function apiActivateBrandKit(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/brand-kit/${encodeURIComponent(uid)}/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to activate brand kit");
  return res.json() as Promise<BrandKitRecord>;
}

export async function apiDeactivateBrandKit(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/brand-kit/${encodeURIComponent(uid)}/deactivate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to deactivate brand kit");
  return res.json() as Promise<BrandKitRecord>;
}

export async function apiDeleteBrandKit(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/brand-kit/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to delete brand kit");
}

// ── Product Brand Kit ────────────────────────────────────────────────────────

export type ProductBrandKitAnalysis = {
  overall_vibe?: string;
  shoot_style?: string;
  camera_style?: string;
  background_settings?: string;
  jewellery_placement?: string;
  colour_palette?: string;
  lighting?: string;
  theme_context?: string;
};

export type ProductBrandKitRecord = {
  uid: string;
  name: string;
  description: string | null;
  image_s3_keys: string[];
  analysis: ProductBrandKitAnalysis | null;
  theme_context: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function apiCreateProductBrandKit(
  token: string,
  payload: { name: string; description?: string; setActive?: boolean; files: File[] }
) {
  const formData = new FormData();
  formData.append("name", payload.name);
  if (payload.description?.trim()) formData.append("description", payload.description.trim());
  formData.append("set_active", payload.setActive === false ? "false" : "true");
  const prepared = await Promise.all(payload.files.map((file) => asUploadableImage(file)));
  prepared.forEach((file) => formData.append("files", file));

  const res = await fetch(`${API_BASE_URL}/product-brand-kit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await assertOk(res, "Failed to create product brand kit");
  return res.json() as Promise<ProductBrandKitRecord>;
}

export async function apiListProductBrandKits(token: string) {
  const res = await fetch(`${API_BASE_URL}/product-brand-kit`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to fetch product brand kits");
  return res.json() as Promise<ProductBrandKitRecord[]>;
}

export async function apiActivateProductBrandKit(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/product-brand-kit/${encodeURIComponent(uid)}/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to activate product brand kit");
  return res.json() as Promise<ProductBrandKitRecord>;
}

export async function apiDeactivateProductBrandKit(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/product-brand-kit/${encodeURIComponent(uid)}/deactivate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to deactivate product brand kit");
  return res.json() as Promise<ProductBrandKitRecord>;
}

export async function apiDeleteProductBrandKit(token: string, uid: string) {
  const res = await fetch(`${API_BASE_URL}/product-brand-kit/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, "Failed to delete product brand kit");
}
