import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Download, Eye, Plus } from "lucide-react";
import { format } from "date-fns";

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
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleFileSelect = async (docType: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

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

  const handleView = async (doc: LoadDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('load-documents')
        .createSignedUrl(doc.file_url, 3600); // 1 hour expiry

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
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

  const getDocsByType = (type: string) => documents.filter(d => d.document_type === type);

  return (
    <div className="space-y-6">
      {DOCUMENT_TYPES.map(docType => {
        const typeDocs = getDocsByType(docType.value);
        const isRateConfirmation = docType.value === 'rate_confirmation';
        const canUploadMore = !isRateConfirmation || typeDocs.length === 0;

        return (
          <Card key={docType.value}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {docType.label}
                  {typeDocs.length > 0 && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                      {typeDocs.length}
                    </span>
                  )}
                </CardTitle>
                {canUploadMore && (
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
                          Upload
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {typeDocs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {isRateConfirmation 
                      ? 'No rate confirmation uploaded' 
                      : 'No bills of lading uploaded'}
                  </p>
                  <p className="text-xs mt-1">PDF or images accepted (max 10MB)</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {typeDocs.map(doc => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(doc.file_size)} • {format(new Date(doc.uploaded_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleView(doc)}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleDownload(doc)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(doc)}
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
  );
}
