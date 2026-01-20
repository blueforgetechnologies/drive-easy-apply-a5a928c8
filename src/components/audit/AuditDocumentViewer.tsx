import React, { memo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2 } from "lucide-react";
import { PDFImageViewer } from "@/components/PDFImageViewer";

type LoadDocumentLike = {
  file_url?: string | null;
  file_name?: string | null;
};

export const AuditDocumentViewer = memo(function AuditDocumentViewer({
  doc,
}: {
  doc: LoadDocumentLike | null | undefined;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const getSignedUrl = async () => {
      if (!doc?.file_url) {
        if (!cancelled) {
          setSignedUrl(null);
          setLoading(false);
          setError(null);
        }
        return;
      }

      try {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }

        // If it's already a full URL, use it directly
        if (doc.file_url.startsWith("http://") || doc.file_url.startsWith("https://")) {
          if (!cancelled) setSignedUrl(doc.file_url);
          return;
        }

        // Get signed URL from storage (1 hour expiry)
        const { data, error: urlError } = await supabase.storage
          .from("load-documents")
          .createSignedUrl(doc.file_url, 3600);

        if (urlError) throw urlError;
        if (!cancelled) setSignedUrl(data.signedUrl);
      } catch (err: any) {
        console.error("Error getting signed URL:", err);
        if (!cancelled) setError(err?.message || "Failed to load document");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    getSignedUrl();

    return () => {
      cancelled = true;
    };
  }, [doc?.file_url]);

  if (!doc?.file_url) return null;

  const fileName = doc.file_name?.toLowerCase() || "";
  const isImage =
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".gif") ||
    fileName.endsWith(".webp");
  const isPdf = fileName.endsWith(".pdf");

  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-[600px]">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading document...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className="flex flex-col h-full min-h-[600px]">
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <FileText className="h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-xs text-destructive">{error || "Failed to load document"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <div className="flex-1 border rounded bg-muted overflow-hidden">
        {isPdf ? (
          <PDFImageViewer url={signedUrl} fileName={doc.file_name || "Document.pdf"} />
        ) : isImage ? (
          <div className="h-full overflow-auto p-2 flex items-start justify-center">
            <img
              src={signedUrl}
              alt={doc.file_name || "Document"}
              className="max-w-full h-auto shadow-lg"
              loading="lazy"
            />
          </div>
        ) : (
          <iframe
            src={signedUrl}
            title={doc.file_name || "Document"}
            className="w-full h-full"
            style={{ border: "none" }}
          />
        )}
      </div>
    </div>
  );
});
