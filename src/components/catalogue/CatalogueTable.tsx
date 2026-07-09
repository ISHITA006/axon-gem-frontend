import { flexRender, getCoreRowModel, type ColumnDef, type PaginationState, type SortingState, useReactTable } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CatalogueItem } from "@/lib/api";
import { cn } from "@/lib/utils";

export function CatalogueTable({
  data,
  columns,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  pageCount,
  isFetching,
  isError,
  errorMessage,
  page,
  total,
  onRowClick,
}: {
  data: CatalogueItem[];
  columns: ColumnDef<CatalogueItem>[];
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((prev: SortingState) => SortingState)) => void;
  pagination: PaginationState;
  onPaginationChange: (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => void;
  pageCount: number;
  isFetching: boolean;
  isError: boolean;
  errorMessage?: string;
  page?: number;
  total?: number;
  onRowClick: (item: CatalogueItem) => void;
}) {
  const table = useReactTable({
    data,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount,
    onPaginationChange,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    state: { pagination, sorting },
  });

  const canPrev = (page ?? 1) > 1;
  const canNext = pageCount > 0 ? (page ?? 1) < pageCount : false;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3 pb-4">
          <div className="text-sm text-muted-foreground">
            {isFetching ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </span>
            ) : page != null && total != null && pageCount > 0 ? (
              <span>
                Showing page <span className="font-medium text-foreground">{page}</span> of{" "}
                <span className="font-medium text-foreground">{pageCount}</span> (total{" "}
                <span className="font-medium text-foreground">{total}</span>)
              </span>
            ) : (
              <span>—</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={!canPrev || isFetching} onClick={() => table.previousPage()}>
              Previous
            </Button>
            <Button type="button" variant="outline" disabled={!canNext || isFetching} onClick={() => table.nextPage()}>
              Next
            </Button>
          </div>
        </div>

        <div className={cn("rounded-md border", isError ? "border-destructive" : undefined)}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id} className="h-10 px-2 py-1">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isError ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="px-2 py-3 text-sm text-destructive">
                    {errorMessage ?? "Failed to load catalogue items"}
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => onRowClick(row.original)}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-2 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="px-2 py-3 text-sm text-muted-foreground">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

