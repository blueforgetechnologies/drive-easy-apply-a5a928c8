import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface LoadHunterPaginationProps {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
  totalItems: number;
}

export function LoadHunterPagination({
  currentPage,
  setCurrentPage,
  itemsPerPage,
  totalItems,
}: LoadHunterPaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-muted/50 to-muted/80 border-t border-border/50">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Items per page: {itemsPerPage}</span>
        <span className="font-medium">
          {totalItems === 0 
            ? '0 - 0 of 0' 
            : `${Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} - ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems}`
          }
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setCurrentPage(1)}
          disabled={currentPage === 1}
        >
          <ChevronsLeft className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setCurrentPage(totalPages)}
          disabled={currentPage >= totalPages}
        >
          <ChevronsRight className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
