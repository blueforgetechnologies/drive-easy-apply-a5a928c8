import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { parseExcelFile, mapExcelRowToEntity, downloadTemplate, EntityType, getEntityColumns } from "@/lib/excel-utils";

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: EntityType;
  entityLabel: string;
  onImport: (data: any[]) => Promise<{ success: number; errors: string[] }>;
}

export function ExcelImportDialog({
  open,
  onOpenChange,
  entityType,
  entityLabel,
  onImport,
}: ExcelImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError(null);
    setFile(selectedFile);

    try {
      const data = await parseExcelFile(selectedFile);

      if (data.length === 0) {
        setError("The file is empty or has no valid data rows");
        setPreviewData([]);
        return;
      }

      // Map Excel data to entity format
      const mappedData = data.map((row) => mapExcelRowToEntity(row, entityType));

      // Filter out empty rows
      const validData = mappedData.filter((row) => Object.keys(row).length > 0);

      setPreviewData(validData);
    } catch {
      setError("Failed to parse Excel file. Please ensure it's a valid .xlsx or .xls file.");
      setPreviewData([]);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    
    // Create a synthetic event to reuse handleFileChange logic
    const syntheticEvent = {
      target: { files: [droppedFile] }
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    
    await handleFileChange(syntheticEvent);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleImport = async () => {
    if (previewData.length === 0) {
      toast.error("No data to import");
      return;
    }

    setImporting(true);
    try {
      const result = await onImport(previewData);
      
      if (result.success > 0) {
        toast.success(`Successfully imported ${result.success} ${entityLabel}`);
      }
      
      if (result.errors.length > 0) {
        result.errors.slice(0, 3).forEach(err => toast.error(err));
        if (result.errors.length > 3) {
          toast.error(`...and ${result.errors.length - 3} more errors`);
        }
      }

      if (result.success > 0) {
        handleClose();
      }
    } catch (err: any) {
      toast.error("Import failed: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreviewData([]);
    setError(null);
    onOpenChange(false);
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(entityType);
    toast.success("Template downloaded");
  };

  const columns = getEntityColumns(entityType);
  const previewColumns = columns.slice(0, 6); // Show first 6 columns in preview

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Import {entityLabel} from Excel</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx) to import {entityLabel.toLowerCase()}. 
            Download the template first to see the expected format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm">Need the correct format?</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* File upload */}
          <div 
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              {file ? file.name : "Click to upload or drag and drop"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Excel files (.xlsx, .xls)
            </p>
          </div>

          {/* Error message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">
                  Found {previewData.length} {entityLabel.toLowerCase()} to import
                </span>
              </div>
              
              <ScrollArea className="h-64 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {previewColumns.map(col => (
                        <TableHead key={col.key}>{col.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        {previewColumns.map(col => {
                          const value = col.key.includes('.') 
                            ? col.key.split('.').reduce((obj, key) => obj?.[key], row)
                            : row[col.key];
                          return (
                            <TableCell key={col.key} className="truncate max-w-[150px]">
                              {String(value ?? '')}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {previewData.length > 10 && (
                  <div className="p-2 text-center text-sm text-muted-foreground border-t">
                    ... and {previewData.length - 10} more rows
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={previewData.length === 0 || importing}
          >
            {importing ? "Importing..." : `Import ${previewData.length} ${entityLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
