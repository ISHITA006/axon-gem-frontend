import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getPresignedUrl, isVideoS3Key } from "@/lib/api";

export function ImageKeyThumb({
  token,
  s3Key,
  clickable,
}: {
  token: string | null;
  s3Key: string;
  clickable?: boolean;
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
      ) : isVideoS3Key(s3Key) ? (
        <video
          src={urlQuery.data}
          muted
          playsInline
          preload="metadata"
          className={cn(
            "h-full w-full object-cover transition-transform duration-200",
            clickable ? "group-hover:scale-[1.06] group-hover:-translate-y-0.5" : undefined,
          )}
        />
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
    </div>
  );
}
