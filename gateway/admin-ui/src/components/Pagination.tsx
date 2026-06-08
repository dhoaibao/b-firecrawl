import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  if (totalPages <= 1 && totalItems <= pageSize) return null;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const pageSizeOptions = [10, 25, 50];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-white/[0.06] bg-surface-2">
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{startItem}</span>
        {" "}-{` `}
        <span className="font-medium text-foreground">{endItem}</span>
        {" "}of{" "}
        <span className="font-medium text-foreground">{totalItems}</span>
      </div>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-lg border border-white/[0.08] bg-surface-3 px-2 text-sm text-foreground outline-none"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-3 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="First page"
          >
            <ChevronsLeft className="size-4" />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-3 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>

          <span className="mx-1 min-w-[4rem] text-center text-sm text-muted-foreground">
            Page <span className="font-medium text-foreground">{currentPage}</span>
            {" "}of{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </span>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-3 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-3 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Last page"
          >
            <ChevronsRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
