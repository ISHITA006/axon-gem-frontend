import type { CatalogueItem, CatalogueSortBy, CatalogueSortDir } from "@/lib/api";

export type Filters = {
  q: string;
  jewellery_type: string;
  gender: string;
  age: string;
  metal: string;
  metal_purity: string;
  setting_type: string;
  stone_type: string;
  stone_cut: string;
  design: string;
  category: string;
};

export const DEFAULT_FILTERS: Filters = {
  q: "",
  jewellery_type: "",
  gender: "",
  age: "",
  metal: "",
  metal_purity: "",
  setting_type: "",
  stone_type: "",
  stone_cut: "",
  design: "",
  category: "",
};

export type SortParam = { sort_by: CatalogueSortBy | null; sort_dir: CatalogueSortDir | null };

export type CatalogueEditForm = {
  item_code: string;
  name: string;
  description: string;
  jewellery_type: string;
  category: string;
  gender: string;
  age: string;
  metal: string;
  metal_purity: string;
  metal_weight_grams: string;
  stone_type: string;
  stone_cut: string;
  stone_count: string;
  stone_carat: string;
  setting_type: string;
  design: string;
  image_s3_keys: string[];
};

export type { CatalogueItem };
