import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PDFImageViewerProps {
  url: string;
  fileName: string;
}

// Simplified PDF viewer - just shows download option
// PDF.js was removed to reduce bundle size and fix install timeouts
export function PDFImageViewer({ url, fileName }: PDFImageViewerProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <FileText className="h-16 w-16 text-muted-foreground" />
      <p className="text-sm text-muted-foreground text-center">
        PDF Preview is temporarily unavailable.
      </p>
      <Button asChild variant="outline">
        <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </a>
      </Button>
    </div>
  );
}
