import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExtractedLoadData {
  load_number?: string;
  rate?: number;
  broker_name?: string;
  broker_email?: string;
  broker_phone?: string;
  broker_contact?: string;
  reference_number?: string;
  shipper_name?: string;
  shipper_address?: string;
  shipper_city?: string;
  shipper_state?: string;
  shipper_zip?: string;
  shipper_contact?: string;
  shipper_phone?: string;
  shipper_email?: string;
  pickup_date?: string;
  pickup_time?: string;
  receiver_name?: string;
  receiver_address?: string;
  receiver_city?: string;
  receiver_state?: string;
  receiver_zip?: string;
  receiver_contact?: string;
  receiver_phone?: string;
  receiver_email?: string;
  delivery_date?: string;
  delivery_time?: string;
  cargo_description?: string;
  cargo_weight?: number;
  cargo_pieces?: number;
  equipment_type?: string;
  estimated_miles?: number;
  special_instructions?: string;
}

interface RateConfirmationUploaderProps {
  onDataExtracted: (data: ExtractedLoadData) => void;
  onFileSelected?: (file: File | null) => void;
}

export function RateConfirmationUploader({ onDataExtracted, onFileSelected }: RateConfirmationUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = async (selectedFile: File) => {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      toast.error('Please upload a PDF or image file (JPG, PNG, WebP)');
      return;
    }

    // Validate file size (10MB max)
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File is too large. Maximum size is 10MB.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setParsed(false);
    onFileSelected?.(selectedFile);

    // Auto-parse the file
    await parseDocument(selectedFile);
  };

  const parseDocument = async (fileToProcess: File) => {
    setParsing(true);
    setError(null);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Extract base64 part after data URL prefix
          const base64Part = result.split(',')[1];
          resolve(base64Part);
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToProcess);
      });

      const { data, error: fnError } = await supabase.functions.invoke('parse-rate-confirmation', {
        body: {
          documentBase64: base64,
          fileName: fileToProcess.name,
          mimeType: fileToProcess.type
        }
      });

      if (fnError) throw fnError;

      if (!data.success) {
        throw new Error(data.error || 'Failed to parse document');
      }

      setParsed(true);
      onDataExtracted(data.data);
      toast.success('Rate confirmation parsed successfully! Review the extracted data below.');
    } catch (err: any) {
      console.error('Parse error:', err);
      const errorMessage = err.message || 'Failed to parse document';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setParsing(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setParsed(false);
    setError(null);
    onFileSelected?.(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {!file ? (
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
            isDragging 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className={cn(
            "h-10 w-10 mx-auto mb-3 transition-colors",
            isDragging ? "text-primary" : "text-muted-foreground"
          )} />
          <p className="text-sm font-medium mb-1">
            Drop rate confirmation here or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            PDF or images (JPG, PNG) up to 10MB • AI will extract load details
          </p>
        </div>
      ) : (
        <div className={cn(
          "border rounded-xl p-4 transition-all",
          parsed ? "border-green-500/50 bg-green-500/5" : 
          error ? "border-destructive/50 bg-destructive/5" :
          "border-border"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
              parsed ? "bg-green-500/10" : error ? "bg-destructive/10" : "bg-primary/10"
            )}>
              {parsing ? (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              ) : parsed ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : error ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <FileText className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {parsing ? 'AI is extracting load details...' :
                 parsed ? 'Extraction complete - review data below' :
                 error ? error :
                 `${(file.size / 1024).toFixed(1)} KB`}
              </p>
            </div>
            {!parsing && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {error && !parsing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => parseDocument(file)}
            >
              Retry Parsing
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
