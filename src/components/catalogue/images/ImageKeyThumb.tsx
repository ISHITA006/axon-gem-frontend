import { Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPresignedUrl } from "@/lib/api";

export function ImageKeyThumb({
  token,
  s3Key,
  onRemove,
  disabled,
  clickable,
  removeLoading,
}: {
  token: string | null;
  s3Key: string;
  onRemove?: () => void;
  disabled?: boolean;
  clickable?: boolean;
  removeLoading?: boolean;
}) {
  const urlQuery = useQuery({
    queryKey: ["presigned-url", token, s3Key],
    enabled: Boolean(token && s3Key),
    queryFn: () => getPresignedUrl(token!, s3Key),
    staleTime: 3 * 60 * 1000,
  });

  return (
    <div
      className={cn(
        "group relative h-24 w-24 overflow-hidden rounded-md border bg-muted/30",
        clickable ? "cursor-zoom-in" : undefined,
      )}
    >
      {urlQuery.isPending ? (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : urlQuery.isError || !urlQuery.data ? (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-destructive">
          Failed
        </div>
      ) : (
        <img
          src={urlQuery.data}
          alt=""
          className={cn(
            "h-full w-full object-cover transition-transform duration-200",
            clickable ? "group-hover:scale-[1.06] group-hover:-translate-y-0.5" : undefined,
          )}
        />
      )}

      {onRemove ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute right-1 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={disabled}
          title="Remove image"
        >
          {removeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </Button>
      ) : null}
    </div>
  );
}

