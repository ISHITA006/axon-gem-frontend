import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getPresignedUrl, type CatalogueItem } from "@/lib/api";
import { catalogueImageS3Keys } from "../utils";

export function CatalogueImageCell({
  token,
  item,
  rowKey,
  imageIndexByRow,
  setImageIndexByRow,
}: {
  token: string | null;
  item: CatalogueItem;
  rowKey: string;
  imageIndexByRow: Record<string, number>;
  setImageIndexByRow: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  const s3Keys = catalogueImageS3Keys(item);
  const idx = Math.min(Math.max(imageIndexByRow[rowKey] ?? 0, 0), Math.max(0, s3Keys.length - 1));
  const currentKey = s3Keys[idx] ?? null;

  const urlQuery = useQuery({
    queryKey: ["presigned-url", token, currentKey],
    enabled: Boolean(token && currentKey),
    queryFn: () => getPresignedUrl(token!, currentKey!),
    staleTime: 3 * 60 * 1000,
  });

  const hasMany = s3Keys.length > 1;
  const prevDisabled = !token || !hasMany || idx <= 0;
  const nextDisabled = !token || !hasMany || idx >= s3Keys.length - 1;

  const bump = (dir: -1 | 1) => {
    setImageIndexByRow((m) => {
      const cur = m[rowKey] ?? 0;
      const next = Math.min(Math.max(cur + dir, 0), Math.max(0, s3Keys.length - 1));
      return { ...m, [rowKey]: next };
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-4 w-4 shrink-0"
        disabled={prevDisabled}
        onClick={(e) => {
          e.stopPropagation();
          bump(-1);
        }}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>

      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted/30">
        {!currentKey ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>
        ) : urlQuery.isPending ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : urlQuery.isError || !urlQuery.data ? (
          <div className="flex h-full w-full items-center justify-center px-0.5 text-center text-[10px] leading-tight text-destructive">
            Error
          </div>
        ) : (
          <img src={urlQuery.data} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-4 w-4 shrink-0"
        disabled={nextDisabled}
        onClick={(e) => {
          e.stopPropagation();
          bump(1);
        }}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>

      <div className="min-w-[3.5rem] text-xs text-muted-foreground">
        {s3Keys.length ? `${idx + 1}/${s3Keys.length}` : "0/0"}
      </div>
    </div>
  );
}

