import { useEffect, useRef, useState, memo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { FileText, Loader2 } from "lucide-react";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PDFThumbnailProps {
  url: string;
  className?: string;
}

export const PDFThumbnail = memo(function PDFThumbnail({ url, className = "" }: PDFThumbnailProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!url) {
      setIsLoading(false);
      setError(true);
      return;
    }

    cancelledRef.current = false;
    setIsLoading(true);
    setError(false);
    setThumbnailSrc(null);

    const renderThumbnail = async () => {
      try {
        // Destroy previous task if exists
        if (loadingTaskRef.current) {
          try {
            loadingTaskRef.current.destroy();
          } catch {
            // ignore
          }
        }

        const task = pdfjsLib.getDocument({ url });
        loadingTaskRef.current = task;
        const pdf = await task.promise;

        if (cancelledRef.current) return;

        const page = await pdf.getPage(1);
        
        if (cancelledRef.current) return;

        // Render at a smaller scale for thumbnail
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        
        if (!context) {
          throw new Error("Could not get canvas context");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;

        if (cancelledRef.current) return;

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setThumbnailSrc(dataUrl);
      } catch (err) {
        if (!cancelledRef.current) {
          console.error("[PDFThumbnail] Error rendering:", err);
          setError(true);
        }
      } finally {
        if (!cancelledRef.current) {
          setIsLoading(false);
        }
      }
    };

    renderThumbnail();

    return () => {
      cancelledRef.current = true;
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch {
          // ignore
        }
        loadingTaskRef.current = null;
      }
    };
  }, [url]);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !thumbnailSrc) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={thumbnailSrc}
      alt="PDF preview"
      className={`object-cover ${className}`}
      loading="lazy"
    />
  );
});
