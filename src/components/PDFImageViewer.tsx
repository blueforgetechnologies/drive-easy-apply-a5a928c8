import { Download, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface PDFImageViewerProps {
  url: string;
  fileName: string;
}

export function PDFImageViewer({ url, fileName }: PDFImageViewerProps) {
  const [loadError, setLoadError] = useState(false);
  const [key, setKey] = useState(0);

  const handleRetry = () => {
    setLoadError(false);
    setKey(prev => prev + 1);
  };

  // Use Google Docs viewer as a reliable way to display PDFs inline
  const googleDocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-muted/50 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate max-w-[200px]">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          {loadError && (
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Open
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-1" />
              Download
            </a>
          </Button>
        </div>
      </div>

      {/* PDF Container */}
      <div className="flex-1 overflow-hidden bg-muted/30">
        {loadError ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
            <FileText className="h-16 w-16 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Unable to display PDF inline. Use the buttons above to open or download.
            </p>
            <div className="flex gap-2">
              <Button variant="default" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in New Tab
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            key={key}
            src={googleDocsUrl}
            title={fileName}
            className="w-full h-full"
            style={{ border: "none", minHeight: "600px" }}
            onError={() => setLoadError(true)}
          />
        )}
      </div>
    </div>
  );
}
