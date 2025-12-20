import { useState, useRef, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Download, Plus, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { PDFImageViewer } from "./PDFImageViewer";

interface LoadDocument {
  id: string;
  load_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string | null;
}

interface LoadDocumentsProps {
  loadId: string;
  documents: LoadDocument[];
  onDocumentsChange: () => void;
}

const DOCUMENT_TYPES = [
  { value: "rate_confirmation", label: "Rate Confirmation" },
  { value: "bill_of_lading", label: "Bill of Lading" },
] as const;

export function LoadDocuments({ loadId, documents, onDocumentsChange }: LoadDocumentsProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string; isPdf: boolean } | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<{ files: FileList; existingDoc: LoadDocument } | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const getDocsByType = (type: string) => documents.filter(d => d.document_type === type);

  const handleFileSelect = async (docType: string, files: FileList | null, skipReplaceCheck = false) => {
    if (!files || files.length === 0) return;

    // Check if trying to upload rate confirmation when one already exists
    const isRateConfirmation = docType === 'rate_confirmation';
    const existingRateCon = getDocsByType('rate_confirmation')[0];
    
    if (isRateConfirmation && existingRateCon && !skipReplaceCheck) {
      setReplaceConfirm({ files, existingDoc: existingRateCon });
      return;
    }

    setUploading(docType);
    
    try {
      for (const file of Array.from(files)) {
        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          toast.error(`Invalid file type for ${file.name}. Please upload PDF or images only.`);
          continue;
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is too large. Maximum size is 10MB.`);
          continue;
        }

        // Create unique file path
        const fileExt = file.name.split('.').pop();
        const fileName = `${loadId}/${docType}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('load-documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('load-documents')
          .getPublicUrl(fileName);

        // Save document record
        const { error: dbError } = await supabase
          .from('load_documents')
          .insert({
            load_id: loadId,
            document_type: docType,
            file_name: file.name,
            file_url: fileName,
            file_size: file.size,
          });

        if (dbError) throw dbError;
      }

      toast.success(`Document${files.length > 1 ? 's' : ''} uploaded successfully`);
      onDocumentsChange();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload document: ' + error.message);
    } finally {
      setUploading(null);
      // Reset file input
      if (fileInputRefs.current[docType]) {
        fileInputRefs.current[docType]!.value = '';
      }
    }
  };

  const handleDelete = async (doc: LoadDocument) => {
    if (!confirm(`Delete ${doc.file_name}?`)) return;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('load-documents')
        .remove([doc.file_url]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('load_documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      toast.success('Document deleted');
      onDocumentsChange();
    } catch (error: any) {
      toast.error('Failed to delete document: ' + error.message);
    }
  };

  const handleReplaceRateConfirmation = async () => {
    if (!replaceConfirm) return;
    
    const { files, existingDoc } = replaceConfirm;
    setReplaceConfirm(null);
    
    try {
      // Delete existing rate confirmation from storage
      await supabase.storage
        .from('load-documents')
        .remove([existingDoc.file_url]);
      
      // Delete from database
      await supabase
        .from('load_documents')
        .delete()
        .eq('id', existingDoc.id);
      
      // Now upload the new one
      await handleFileSelect('rate_confirmation', files, true);
    } catch (error: any) {
      toast.error('Failed to replace rate confirmation: ' + error.message);
    }
  };

  const handleView = async (doc: LoadDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('load-documents')
        .createSignedUrl(doc.file_url, 3600); // 1 hour expiry

      if (error) throw error;
      
      const isPdf = doc.file_name.toLowerCase().endsWith('.pdf');
      setViewingDoc({ url: data.signedUrl, name: doc.file_name, isPdf });
    } catch (error: any) {
      toast.error('Failed to open document: ' + error.message);
    }
  };

  const handleDownload = async (doc: LoadDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('load-documents')
        .download(doc.file_url);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error('Failed to download document: ' + error.message);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };


  const handleDragOver = (e: DragEvent<HTMLDivElement>, docType: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(docType);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, docType: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(docType, files);
    }
  };

  return (
    <>
      <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span className="truncate">{viewingDoc?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {viewingDoc?.isPdf ? (
              <PDFImageViewer url={viewingDoc.url} fileName={viewingDoc.name} />
            ) : viewingDoc ? (
              <div className="h-full overflow-auto flex items-center justify-center bg-muted rounded p-4">
                <img 
                  src={viewingDoc.url} 
                  alt={viewingDoc.name} 
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Replace Rate Confirmation Dialog */}
      <Dialog open={!!replaceConfirm} onOpenChange={() => setReplaceConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Replace Rate Confirmation?
            </DialogTitle>
            <DialogDescription>
              Only one Rate Confirmation is allowed per load. Would you like to replace the existing Rate Confirmation with the new one?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              Current: <span className="font-medium text-foreground">{replaceConfirm?.existingDoc.file_name}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={handleReplaceRateConfirmation}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <div className="space-y-3">
        {DOCUMENT_TYPES.map(docType => {
        const typeDocs = getDocsByType(docType.value);
        const isRateConfirmation = docType.value === 'rate_confirmation';

        return (
          <Card key={docType.value} className="overflow-hidden">
            <CardHeader className="py-2 px-4 bg-gradient-to-r from-primary/10 to-transparent border-b">
              <div className="flex items-center justify-between">
                <CardTitle className={`text-base font-medium flex items-center gap-2 ${isRateConfirmation ? 'text-emerald-600' : 'text-blue-600'}`}>
                  <FileText className="h-4 w-4" />
                  {docType.label}
                  {typeDocs.length > 0 && (
                    <span className="text-xs bg-background px-2 py-0.5 rounded-full text-muted-foreground">
                      {typeDocs.length}
                    </span>
                  )}
                </CardTitle>
                <>
                  <input
                    ref={el => fileInputRefs.current[docType.value] = el}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    multiple={!isRateConfirmation}
                    className="hidden"
                    onChange={e => handleFileSelect(docType.value, e.target.files)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRefs.current[docType.value]?.click()}
                    disabled={uploading === docType.value}
                  >
                    {uploading === docType.value ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-1" />
                        {isRateConfirmation && typeDocs.length > 0 ? 'Replace' : 'Upload'}
                      </>
                    )}
                  </Button>
                </>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {typeDocs.length === 0 ? (
                <div 
                  className={`text-center py-5 text-muted-foreground border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                    dragOver === docType.value 
                      ? 'border-primary bg-primary/5' 
                      : 'hover:border-primary/50 hover:bg-muted/50'
                  }`}
                  onDragOver={(e) => handleDragOver(e, docType.value)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, docType.value)}
                  onClick={() => fileInputRefs.current[docType.value]?.click()}
                >
                  <Upload className={`h-6 w-6 mx-auto mb-1 ${dragOver === docType.value ? 'text-primary' : 'opacity-50'}`} />
                  <p className="text-sm">
                    {dragOver === docType.value 
                      ? 'Drop files here' 
                      : isRateConfirmation 
                        ? 'No rate confirmation uploaded' 
                        : 'No bills of lading uploaded'}
                  </p>
                  <p className="text-xs mt-1">PDF or images accepted</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Show drag-drop area for adding/replacing documents */}
                  <div 
                    className={`text-center py-2.5 text-muted-foreground border-2 border-dashed rounded transition-colors cursor-pointer ${
                      dragOver === docType.value 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:border-primary/50 hover:bg-muted/50'
                    }`}
                    onDragOver={(e) => handleDragOver(e, docType.value)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, docType.value)}
                    onClick={() => fileInputRefs.current[docType.value]?.click()}
                  >
                    <Upload className={`h-4 w-4 mx-auto mb-0.5 ${dragOver === docType.value ? 'text-primary' : 'opacity-50'}`} />
                    <p className="text-xs">
                      {dragOver === docType.value 
                        ? 'Drop files here' 
                        : isRateConfirmation 
                          ? 'Drag & drop to replace' 
                          : 'Drag & drop to add more'}
                    </p>
                  </div>
                  {typeDocs.map(doc => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-2 bg-muted/50 rounded group hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => handleView(doc)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(doc.file_size)} • {format(new Date(doc.uploaded_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      </div>
    </>
  );
}
