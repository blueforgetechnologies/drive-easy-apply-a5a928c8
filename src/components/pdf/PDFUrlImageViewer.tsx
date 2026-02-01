import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw, ExternalLink, FileText } from "lucide-react";

// Configure pdf.js worker (safe to set multiple times)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PDFUrlImageViewerProps {
  url: string;
  fileName: string;
  /** Rendering scale; higher = sharper but slower. */
  scale?: number;
}

export function PDFUrlImageViewer({ url, fileName, scale = 1.6 }: PDFUrlImageViewerProps) {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelledRef = useRef(false);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    try {
      loadingTaskRef.current?.destroy();
    } catch {
      // ignore
    }
    loadingTaskRef.current = null;
  }, []);

  const renderFromUrl = useCallback(async () => {
    cleanup();
    cancelledRef.current = false;
    setError(null);
    setPageImages([]);
    setTotalPages(0);
    setCurrentPage(0);
    setIsRendering(true);

    try {
      const task = pdfjsLib.getDocument({ url });
      loadingTaskRef.current = task;
      const pdf = await task.promise;

      if (cancelledRef.current) return;

      setTotalPages(pdf.numPages);
      const images: string[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (cancelledRef.current) break;
        setCurrentPage(pageNum);

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Failed to get canvas context");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;

        images.push(canvas.toDataURL("image/png", 0.92));
        setPageImages([...images]);
      }
    } catch (err: any) {
      if (!cancelledRef.current) {
        console.error("[PDFUrlImageViewer] Render error:", err);
        setError(err?.message || "Failed to render PDF");
      }
    } finally {
      if (!cancelledRef.current) setIsRendering(false);
    }
  }, [cleanup, scale, url]);

  useEffect(() => {
    if (!url) return;
    renderFromUrl();
    return () => cleanup();
  }, [cleanup, renderFromUrl, url]);

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Unable to display PDF as images</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={renderFromUrl} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(url, "_blank")}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Open in New Tab
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium truncate" title={fileName}>
          {fileName}
        </p>
        <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")} className="gap-2">
          <ExternalLink className="h-4 w-4" />
          Open
        </Button>
      </div>

      {pageImages.length === 0 && isRendering ? (
        <Card className="p-10">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Rendering PDF…</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {pageImages.map((src, idx) => (
            <Card key={idx} className="overflow-hidden bg-background">
              <div className="px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground">
                Page {idx + 1}
                {totalPages ? ` of ${totalPages}` : ""}
              </div>
              <div className="p-2">
                <img src={src} alt={`Page ${idx + 1}`} className="w-full h-auto" />
              </div>
            </Card>
          ))}

          {isRendering && pageImages.length > 0 && (
            <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Rendering page {currentPage}
              {totalPages ? ` of ${totalPages}` : ""}…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
