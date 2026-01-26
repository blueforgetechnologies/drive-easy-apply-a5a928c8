import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, ZoomIn, ZoomOut, X, FileText, Image as ImageIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface DocumentInfo {
  driversLicense?: string | File | null;
  socialSecurity?: string | File | null;
  medicalCard?: string | File | null;
  mvr?: string | File | null;
  other?: (string | File)[];
}

interface PDFPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfBase64: string | null;
  filename: string;
  isLoading: boolean;
  documents?: DocumentInfo | null;
}

export function PDFPreviewDialog({
  open,
  onOpenChange,
  pdfBase64,
  filename,
  isLoading,
  documents,
}: PDFPreviewDialogProps) {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentRenderPage, setCurrentRenderPage] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.5); // Higher default for sharper rendering
  const [selectedDocUrl, setSelectedDocUrl] = useState<string | null>(null);
  const [selectedDocName, setSelectedDocName] = useState<string>("");
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  
  const cancelledRef = useRef(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const prevBase64Ref = useRef<string | null>(null);

  // Check if we have any documents to show
  const hasDocuments = documents && (
    documents.driversLicense ||
    documents.socialSecurity ||
    documents.medicalCard ||
    documents.mvr ||
    (documents.other && documents.other.length > 0)
  );

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
      setZoom(1.5); // Reset zoom on close
      prevBase64Ref.current = null;
      setSelectedDocUrl(null);
      setSelectedDocName("");
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
    setZoom(1.5);
  };

  // Fetch signed URL for private storage paths
  const getSignedUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    try {
      const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
      const { data, error } = await supabase.storage
        .from("load-documents")
        .createSignedUrl(cleanPath, 3600); // 1 hour expiry
      
      if (error) {
        console.error("Error creating signed URL:", error);
        return null;
      }
      return data?.signedUrl || null;
    } catch (err) {
      console.error("Failed to get signed URL:", err);
      return null;
    }
  }, []);

  // Load signed URLs for all documents when dialog opens
  useEffect(() => {
    if (!open || !documents) return;
    
    const loadSignedUrls = async () => {
      const urls: Record<string, string> = {};
      
      const docsToLoad: { key: string; path: string }[] = [];
      
      if (documents.driversLicense && typeof documents.driversLicense === 'string' && !documents.driversLicense.startsWith('http') && !documents.driversLicense.startsWith('blob:') && !documents.driversLicense.startsWith('data:')) {
        docsToLoad.push({ key: 'driversLicense', path: documents.driversLicense });
      }
      if (documents.medicalCard && typeof documents.medicalCard === 'string' && !documents.medicalCard.startsWith('http') && !documents.medicalCard.startsWith('blob:') && !documents.medicalCard.startsWith('data:')) {
        docsToLoad.push({ key: 'medicalCard', path: documents.medicalCard });
      }
      if (documents.socialSecurity && typeof documents.socialSecurity === 'string' && !documents.socialSecurity.startsWith('http') && !documents.socialSecurity.startsWith('blob:') && !documents.socialSecurity.startsWith('data:')) {
        docsToLoad.push({ key: 'socialSecurity', path: documents.socialSecurity });
      }
      if (documents.mvr && typeof documents.mvr === 'string' && !documents.mvr.startsWith('http') && !documents.mvr.startsWith('blob:') && !documents.mvr.startsWith('data:')) {
        docsToLoad.push({ key: 'mvr', path: documents.mvr });
      }
      if (documents.other) {
        documents.other.forEach((doc, idx) => {
          if (typeof doc === 'string' && !doc.startsWith('http') && !doc.startsWith('blob:') && !doc.startsWith('data:')) {
            docsToLoad.push({ key: `other_${idx}`, path: doc });
          }
        });
      }
      
      // Fetch all signed URLs in parallel
      await Promise.all(
        docsToLoad.map(async ({ key, path }) => {
          const signedUrl = await getSignedUrl(path);
          if (signedUrl) {
            urls[key] = signedUrl;
          }
        })
      );
      
      setSignedUrls(urls);
    };
    
    loadSignedUrls();
  }, [open, documents, getSignedUrl]);

  // Get document URL from various formats (using signed URLs for storage paths)
  const getDocumentUrl = useCallback((doc: string | File | null | undefined, key?: string): string | null => {
    if (!doc) return null;
    
    // If it's a File object, create object URL
    if (doc instanceof File) {
      return URL.createObjectURL(doc);
    }
    
    // It's a string - check what kind
    if (typeof doc === "string") {
      // Already a full URL
      if (doc.startsWith("http://") || doc.startsWith("https://") || doc.startsWith("blob:") || doc.startsWith("data:")) {
        return doc;
      }
      
      // It's a storage path - use the pre-fetched signed URL
      if (key && signedUrls[key]) {
        return signedUrls[key];
      }
      
      // Fallback: return null (will show placeholder, signed URL loading)
      return null;
    }
    
    return null;
  }, [signedUrls]);

  // Document click handler
  const handleDocumentClick = useCallback(async (doc: string | File | null | undefined, label: string, key?: string) => {
    // Handle File objects (local)
    if (doc instanceof File) {
      setSelectedDocUrl(URL.createObjectURL(doc));
      setSelectedDocName(label);
      return;
    }

    // Handle string paths
    if (typeof doc === 'string' && doc.trim()) {
      // Check if already a full URL
      if (doc.startsWith("http://") || doc.startsWith("https://") || doc.startsWith("blob:") || doc.startsWith("data:")) {
        setSelectedDocUrl(doc);
        setSelectedDocName(label);
        return;
      }

      // Check if we have a pre-fetched signed URL
      if (key && signedUrls[key]) {
        setSelectedDocUrl(signedUrls[key]);
        setSelectedDocName(label);
        return;
      }

      // Fetch signed URL on demand
      setIsLoadingDoc(true);
      const signedUrl = await getSignedUrl(doc);
      setIsLoadingDoc(false);

      if (signedUrl) {
        setSelectedDocUrl(signedUrl);
        setSelectedDocName(label);
      } else {
        toast.error("Could not load document");
      }
      return;
    }

    toast.error("Document not available");
  }, [signedUrls, getSignedUrl]);

  // Check if a document URL is an image
  const isImageUrl = (url: string): boolean => {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.jpg') || 
           lowerUrl.includes('.jpeg') || 
           lowerUrl.includes('.png') || 
           lowerUrl.includes('.gif') ||
           lowerUrl.includes('.webp') ||
           lowerUrl.startsWith('blob:') || // Blob URLs from File objects
           lowerUrl.startsWith('data:image'); // Data URLs
  };

  // Check if a path (not URL) is an image based on extension
  const isImagePath = (doc: string | File | null | undefined): boolean => {
    if (!doc) return false;
    if (doc instanceof File) return doc.type.startsWith('image/');
    if (typeof doc === 'string') {
      const lowerPath = doc.toLowerCase();
      return lowerPath.endsWith('.jpg') || 
             lowerPath.endsWith('.jpeg') || 
             lowerPath.endsWith('.png') || 
             lowerPath.endsWith('.gif') ||
             lowerPath.endsWith('.webp');
    }
    return false;
  };

  const showLoading = isLoading || (isRendering && pageImages.length === 0);

  // Build document list
  const documentList: { key: string; label: string; doc: string | File | null | undefined }[] = [];
  if (documents) {
    if (documents.driversLicense) documentList.push({ key: 'driversLicense', label: "Driver's License", doc: documents.driversLicense });
    if (documents.socialSecurity) documentList.push({ key: 'socialSecurity', label: 'Social Security Card', doc: documents.socialSecurity });
    if (documents.medicalCard) documentList.push({ key: 'medicalCard', label: 'Medical Card', doc: documents.medicalCard });
    if (documents.mvr) documentList.push({ key: 'mvr', label: 'MVR', doc: documents.mvr });
    if (documents.other && documents.other.length > 0) {
      documents.other.forEach((doc, idx) => {
        const name = typeof doc === 'string' ? doc.split('/').pop() || `Document ${idx + 1}` : (doc as File).name || `Document ${idx + 1}`;
        documentList.push({ key: `other_${idx}`, label: name, doc });
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold truncate pr-4">
              {selectedDocUrl ? `Document: ${selectedDocName}` : `PDF Preview: ${filename || "Application"}`}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {/* Back to PDF button when viewing document */}
              {selectedDocUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedDocUrl(null);
                    setSelectedDocName("");
                  }}
                  className="gap-1"
                >
                  ← Back to PDF
                </Button>
              )}
              
              {/* Zoom controls - only show when viewing PDF */}
              {!selectedDocUrl && (
                <>
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
                </>
              )}
              
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
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Documents List */}
          {hasDocuments && !selectedDocUrl && (
            <div className="w-64 border-r bg-muted/30 flex-shrink-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Uploaded Documents
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Click to view full size
                </p>
              </div>
              <ScrollArea className="h-[calc(90vh-180px)]">
                <div className="p-3 space-y-2">
                  {documentList.map((item) => {
                    const url = getDocumentUrl(item.doc, item.key);
                    const isImage = url ? isImageUrl(url) : isImagePath(item.doc);
                    const hasSignedUrl = !!url;
                    
                    return (
                      <Card
                        key={item.key}
                        className="cursor-pointer hover:bg-accent/50 transition-colors overflow-hidden"
                        onClick={() => handleDocumentClick(item.doc, item.label, item.key)}
                      >
                        {isImage ? (
                          <div className="aspect-[4/3] relative bg-muted overflow-hidden flex items-center justify-center">
                            {hasSignedUrl ? (
                              <img
                                src={url}
                                alt={item.label}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  // Hide broken image, show fallback
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            )}
                            {/* Fallback icon shown behind image */}
                            <div className="absolute inset-0 flex items-center justify-center -z-10">
                              <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-[4/3] flex items-center justify-center bg-muted">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <div className="p-2 border-t">
                          <p className="text-xs font-medium truncate">{item.label}</p>
                          <Badge variant="secondary" className="text-[10px] mt-1">
                            {isImage ? 'Image' : 'PDF'}
                          </Badge>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden">
            {/* Show selected document full-size */}
            {selectedDocUrl ? (
              <ScrollArea className="h-[calc(90vh-100px)]">
                <div className="p-6 flex justify-center">
                  {isImageUrl(selectedDocUrl) ? (
                    <img
                      src={selectedDocUrl}
                      alt={selectedDocName}
                      className="max-w-full h-auto shadow-lg rounded-lg"
                      style={{ imageRendering: 'crisp-edges' }}
                    />
                  ) : (
                    <iframe
                      src={selectedDocUrl}
                      className="w-full h-[80vh] border rounded-lg"
                      title={selectedDocName}
                    />
                  )}
                </div>
              </ScrollArea>
            ) : showLoading ? (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}