import { Download, ExternalLink, FileText, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface PDFImageViewerProps {
  url: string;
  fileName: string;
}

export function PDFImageViewer({ url, fileName }: PDFImageViewerProps) {
  const [scale, setScale] = useState(100);
  const [rotation, setRotation] = useState(0);

  const zoomIn = () => setScale((prev) => Math.min(prev + 25, 200));
  const zoomOut = () => setScale((prev) => Math.max(prev - 25, 50));
  const rotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-muted/50 border-b flex-shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= 50}
            className="h-8 w-8 p-0"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-[3rem] text-center">{scale}%</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= 200}
            className="h-8 w-8 p-0"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={rotate}
            className="h-8 w-8 p-0"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="flex-1 overflow-auto bg-muted/30">
        <div
          className="w-full h-full flex items-start justify-center p-4"
          style={{
            minHeight: "100%",
          }}
        >
          <iframe
            src={`${url}#toolbar=0&view=FitH`}
            title={fileName}
            className="bg-white shadow-lg rounded"
            style={{
              width: `${scale}%`,
              height: "100%",
              minHeight: "800px",
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "center center",
              border: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
