import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, ZoomIn, ZoomOut, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PDFPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfBase64: string | null;
  filename: string;
  isLoading: boolean;
}

export function PDFPreviewDialog({
  open,
  onOpenChange,
  pdfBase64,
  filename,
  isLoading,
}: PDFPreviewDialogProps) {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentRenderPage, setCurrentRenderPage] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  
  const cancelledRef = useRef(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const prevBase64Ref = useRef<string | null>(null);

  const renderPDF = useCallback(async (base64: string, scale: number) => {
    cancelledRef.current = false;
    setIsRendering(true);
    setError(null);
    setPageImages([]);
    setCurrentRenderPage(0);

    try {
      // Convert base64 to Uint8Array
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Load PDF
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      // Render pages sequentially to avoid freezing UI
      const images: string[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (cancelledRef.current) {
          break;
        }

        setCurrentRenderPage(pageNum);
        
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Create canvas for rendering
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Failed to get canvas context");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page to canvas
        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        // Convert to data URL and add to images
        const dataUrl = canvas.toDataURL("image/png", 0.92);
        images.push(dataUrl);
        setPageImages([...images]);
      }
    } catch (err: any) {
      if (!cancelledRef.current) {
        console.error("PDF render error:", err);
        setError(err.message || "Failed to render PDF");
      }
    } finally {
      setIsRendering(false);
    }
  }, []);

  // Re-render when zoom changes (only if we have a PDF and it's the same PDF)
  useEffect(() => {
    if (open && pdfBase64 && !isLoading) {
      // Only re-render if zoom changed on the same PDF
      if (prevBase64Ref.current === pdfBase64) {
        renderPDF(pdfBase64, zoom);
      } else {
        prevBase64Ref.current = pdfBase64;
        renderPDF(pdfBase64, zoom);
      }
    }
  }, [open, pdfBase64, isLoading, zoom, renderPDF]);

  // Cleanup on close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      cancelledRef.current = true;
      setPageImages([]);
      setTotalPages(0);
      setCurrentRenderPage(0);
      setError(null);
      setZoom(1.2); // Reset zoom on close
      prevBase64Ref.current = null;
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    }
    onOpenChange(newOpen);
  };

  const handleDownload = () => {
    if (!pdfBase64) return;

    // Convert base64 to blob and download
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "application.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.5));
  };

  const handleResetZoom = () => {
    setZoom(1.2);
  };

  const showLoading = isLoading || (isRendering && pageImages.length === 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold truncate pr-4">
              PDF Preview: {filename || "Application"}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5 || isRendering}
                title="Zoom out (0.5x min)"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetZoom}
                disabled={isRendering}
                className="w-14 text-xs font-mono"
                title="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 3 || isRendering}
                title="Zoom in (3x max)"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              
              {/* Separator */}
              <div className="w-px h-6 bg-border mx-1" />
              
              {/* Download button */}
              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                disabled={!pdfBase64}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              
              {/* Close button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {showLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">
                {isLoading
                  ? "Generating PDF..."
                  : `Rendering page ${currentRenderPage} of ${totalPages}...`}
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <p className="text-destructive mb-2">Error rendering PDF</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(90vh-100px)]">
              <div className="space-y-4 p-6">
                {pageImages.map((src, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg bg-white shadow-sm overflow-hidden"
                  >
                    <div className="px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground">
                      Page {idx + 1} of {totalPages}
                    </div>
                    <div className="p-2">
                      <img
                        src={src}
                        alt={`Page ${idx + 1}`}
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                ))}
                
                {/* Show progress if still rendering additional pages */}
                {isRendering && pageImages.length > 0 && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                    <span className="text-sm text-muted-foreground">
                      Rendering page {currentRenderPage} of {totalPages}...
                    </span>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
