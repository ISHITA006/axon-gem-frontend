import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Filters } from "./types";
import {
  AGE_OPTIONS,
  CATEGORY_OPTIONS,
  DESIGN_OPTIONS,
  GENDER_OPTIONS,
  JEWELLERY_TYPE_OPTIONS,
  METAL_OPTIONS,
  METAL_PURITY_OPTIONS,
  SETTING_TYPE_OPTIONS,
  STONE_CUT_OPTIONS,
  STONE_TYPE_OPTIONS,
} from "./constants";

export function CatalogueFilters({
  filters,
  onChange,
  onClearAll,
}: {
  filters: Filters;
  onChange: <K extends keyof Filters>(key: K, value: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Catalogue</h2>
        </div>
        <Button type="button" variant="outline" onClick={onClearAll}>
          Clear all filters
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-2 md:col-span-3 lg:col-span-4">
              <Label htmlFor="cat-q">Text search</Label>
              <Input
                id="cat-q"
                value={filters.q}
                onChange={(e) => onChange("q", e.target.value)}
                placeholder="Search name, description, item code, stone type"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filters.category || undefined} onValueChange={(v) => onChange("category", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Jewellery type</Label>
              <Select value={filters.jewellery_type || undefined} onValueChange={(v) => onChange("jewellery_type", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {JEWELLERY_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={filters.gender || undefined} onValueChange={(v) => onChange("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Age</Label>
              <Select value={filters.age || undefined} onValueChange={(v) => onChange("age", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Metal</Label>
              <Select value={filters.metal || undefined} onValueChange={(v) => onChange("metal", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {METAL_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Metal purity</Label>
              <Select value={filters.metal_purity || undefined} onValueChange={(v) => onChange("metal_purity", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {METAL_PURITY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Setting type</Label>
              <Select value={filters.setting_type || undefined} onValueChange={(v) => onChange("setting_type", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {SETTING_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Stone type</Label>
              <Select value={filters.stone_type || undefined} onValueChange={(v) => onChange("stone_type", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {STONE_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Stone cut</Label>
              <Select value={filters.stone_cut || undefined} onValueChange={(v) => onChange("stone_cut", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {STONE_CUT_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Design</Label>
              <Select value={filters.design || undefined} onValueChange={(v) => onChange("design", v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {DESIGN_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

