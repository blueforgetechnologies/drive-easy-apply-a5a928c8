import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFImageViewerProps {
  url: string;
  fileName: string;
}

export function PDFImageViewer({ url, fileName }: PDFImageViewerProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        setTotalPages(pdf.numPages);
        
        const pageImages: string[] = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          // Use scale 1.5 for balance between quality and fit
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          
          if (!context) continue;
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;
          
          pageImages.push(canvas.toDataURL("image/png"));
        }
        
        setPages(pageImages);
        setLoading(false);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("Failed to load PDF. Please try downloading the file.");
        setLoading(false);
      }
    };

    if (url) {
      loadPDF();
    }
  }, [url]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{error}</p>
        <a
          href={url}
          download={fileName}
          className="inline-flex items-center justify-center gap-1 h-8 px-3 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
            disabled={currentPage === pages.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <a
          href={url}
          download={fileName}
          className="inline-flex items-center justify-center gap-1 h-8 px-3 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>
      <div className="flex-1 overflow-auto border rounded bg-muted p-4">
        {pages[currentPage] && (
          <img
            src={pages[currentPage]}
            alt={`Page ${currentPage + 1}`}
            className="w-full h-auto object-contain shadow-lg mx-auto"
          />
        )}
      </div>
    </div>
  );
}
