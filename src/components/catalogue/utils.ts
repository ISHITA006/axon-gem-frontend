import type { SortingState } from "@tanstack/react-table";
import type { CatalogueItem, CatalogueSortBy, CatalogueSortDir } from "@/lib/api";
import type { SortParam, CatalogueEditForm } from "./types";

export function sortFromTable(sorting: SortingState): SortParam {
  const s = sorting[0];
  if (!s) return { sort_by: null, sort_dir: null };
  const id = s.id as CatalogueSortBy;
  const allowed: CatalogueSortBy[] = ["updated_at", "created_at", "name", "item_code"];
  if (!allowed.includes(id)) return { sort_by: null, sort_dir: null };
  return { sort_by: id, sort_dir: s.desc ? "desc" : "asc" };
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

export function valueOrDash(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.trim() === "" ? "—" : s;
}

export function formatTableDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function catalogueImageS3Keys(item: CatalogueItem): string[] {
  const imgs = Array.isArray(item.images) ? item.images : [];
  return imgs
    .map((i) => i.image_s3_key ?? i.s3_key)
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

export function buildEditForm(item: CatalogueItem): CatalogueEditForm {
  return {
    item_code: item.item_code ?? "",
    name: item.name ?? "",
    description: item.description ?? "",
    jewellery_type: item.jewellery_type ?? "",
    category: item.category ?? "",
    gender: item.gender ?? "",
    age: item.age ?? "",
    metal: item.metal ?? "",
    metal_purity: item.metal_purity ?? "",
    metal_weight_grams: item.metal_weight_grams ?? "",
    stone_type: item.stone_type ?? "",
    stone_cut: item.stone_cut ?? "",
    stone_count: item.stone_count ?? "",
    stone_carat: item.stone_carat ?? "",
    setting_type: item.setting_type ?? "",
    design: item.design ?? "",
    image_s3_keys: catalogueImageS3Keys(item),
  };
}

