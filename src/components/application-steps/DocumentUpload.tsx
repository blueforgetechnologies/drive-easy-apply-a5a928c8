import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileText, X, FileCheck, Shield, CreditCard, FolderOpen, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DocumentUploadProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
  tenantId?: string;
  inviteId?: string;
}

interface UploadedDocument {
  path: string;
  name: string;
  size: number;
  previewUrl?: string;
}

export const DocumentUpload = ({ 
  data, 
  onNext, 
  onBack, 
  isPreviewMode = false,
  tenantId,
  inviteId 
}: DocumentUploadProps) => {
  const isTestMode = isPreviewMode || (typeof window !== 'undefined' && localStorage.getItem("app_test_mode") === "true");
  
  // Documents can be: UploadedDocument (with path), string (existing path), or null
  const [documents, setDocuments] = useState<{
    socialSecurity: UploadedDocument | string | null;
    driversLicense: UploadedDocument | string | null;
    medicalCard: UploadedDocument | string | null;
    other: (UploadedDocument | string)[];
  }>({
    socialSecurity: data?.documents?.socialSecurity || null,
    driversLicense: data?.documents?.driversLicense || null,
    medicalCard: data?.documents?.medicalCard || null,
    other: data?.documents?.other || [],
  });
  
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // Get signed URL for viewing
  const getSignedUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from("load-documents")
        .createSignedUrl(storagePath, 3600);
      
      if (error) {
        console.error("Error creating signed URL:", error);
        return null;
      }
      return data?.signedUrl || null;
    } catch (err) {
      console.error("Error getting signed URL:", err);
      return null;
    }
  }, []);

  // Upload file immediately to storage
  const uploadFile = useCallback(async (file: File, docType: string): Promise<UploadedDocument | null> => {
    if (!tenantId || !inviteId) {
      console.error("Missing tenantId or inviteId for upload");
      toast.error("Unable to upload - missing application context");
      return null;
    }

    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const storagePath = `${tenantId}/applications/${inviteId}/${docType}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('load-documents')
        .upload(storagePath, file, { upsert: true });
      
      if (uploadError) {
        console.error(`Failed to upload ${docType}:`, uploadError);
        toast.error(`Failed to upload ${file.name}`);
        return null;
      }
      
      // Get signed URL for preview
      const signedUrl = await getSignedUrl(storagePath);
      if (signedUrl) {
        setPreviewUrls(prev => ({ ...prev, [docType]: signedUrl }));
      }
      
      console.log(`[DocumentUpload] Uploaded ${docType} to:`, storagePath);
      
      return {
        path: storagePath,
        name: file.name,
        size: file.size,
        previewUrl: signedUrl || undefined,
      };
    } catch (err) {
      console.error(`Error uploading ${docType}:`, err);
      toast.error(`Failed to upload ${file.name}`);
      return null;
    }
  }, [tenantId, inviteId, getSignedUrl]);

  const handleFileChange = async (field: string, file: File | null) => {
    if (!file) {
      setDocuments((prev) => ({ ...prev, [field]: null }));
      setPreviewUrls(prev => {
        const newUrls = { ...prev };
        delete newUrls[field];
        return newUrls;
      });
      return;
    }

    // Validate file
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }
    
    const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload JPG, PNG, or PDF files only");
      return;
    }

    // Upload immediately
    setUploadingField(field);
    toast.info(`Uploading ${file.name}...`);
    
    const uploaded = await uploadFile(file, field);
    
    setUploadingField(null);
    
    if (uploaded) {
      setDocuments((prev) => ({ ...prev, [field]: uploaded }));
      toast.success(`${file.name} uploaded successfully!`);
    }
  };

  const handleOtherFilesChange = async (files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Max size is 10MB`);
        return;
      }
      
      const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name} is not a valid file type`);
        return;
      }
      
      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      setUploadingField('other');
      toast.info(`Uploading ${validFiles.length} file(s)...`);
      
      const uploadedFiles: UploadedDocument[] = [];
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const docType = `other_${Date.now()}_${i}`;
        const uploaded = await uploadFile(file, docType);
        if (uploaded) {
          uploadedFiles.push(uploaded);
        }
      }
      
      setUploadingField(null);
      
      if (uploadedFiles.length > 0) {
        setDocuments((prev) => ({
          ...prev,
          other: [...prev.other, ...uploadedFiles],
        }));
        toast.success(`${uploadedFiles.length} file(s) uploaded successfully!`);
      }
    }
  };

  const removeOtherFile = (index: number) => {
    setDocuments((prev) => ({
      ...prev,
      other: prev.other.filter((_, i) => i !== index),
    }));
  };

  const removeDocument = (field: string) => {
    setDocuments((prev) => ({ ...prev, [field]: null }));
    setPreviewUrls(prev => {
      const newUrls = { ...prev };
      delete newUrls[field];
      return newUrls;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if driver's license is uploaded (has a path)
    const hasDriversLicense = documents.driversLicense && 
      (typeof documents.driversLicense === 'string' || 
       (documents.driversLicense as UploadedDocument).path);
    
    if (!isTestMode && !hasDriversLicense) {
      toast.error("Driver's License is required", {
        description: "Please upload a copy of your driver's license to continue.",
      });
      return;
    }
    
    // Convert documents to storage paths for saving
    const documentsToSave: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(documents)) {
      if (key === 'other' && Array.isArray(value)) {
        documentsToSave[key] = value.map(item => 
          typeof item === 'string' ? item : (item as UploadedDocument).path
        );
      } else if (value) {
        documentsToSave[key] = typeof value === 'string' ? value : (value as UploadedDocument).path;
      } else {
        documentsToSave[key] = null;
      }
    }
    
    onNext({ documents: documentsToSave });
  };

  // Get display info for a document
  const getDocumentInfo = (doc: UploadedDocument | string | null): { name: string; size?: number } | null => {
    if (!doc) return null;
    if (typeof doc === 'string') {
      // Extract filename from path
      const filename = doc.split('/').pop() || 'Document';
      return { name: filename };
    }
    return { name: doc.name, size: doc.size };
  };

  // Get preview URL for viewing
  const getDocPreviewUrl = async (doc: UploadedDocument | string | null, field: string) => {
    if (!doc) return;
    
    const path = typeof doc === 'string' ? doc : doc.path;
    const url = await getSignedUrl(path);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error("Unable to load document preview");
    }
  };

  const FileUploadCard = ({
    title,
    description,
    doc,
    field,
    required = false,
    icon: Icon,
  }: {
    title: string;
    description: string;
    doc: UploadedDocument | string | null;
    field: string;
    required?: boolean;
    icon: React.ElementType;
  }) => {
    const isUploading = uploadingField === field;
    const docInfo = getDocumentInfo(doc);
    const hasDocument = !!docInfo;

    return (
      <div className={`section-scifi ${required && !hasDocument ? 'border-destructive/50' : ''}`}>
        <div className="flex items-start gap-3 mb-3">
          <div className={`p-2 rounded-lg ${required ? 'bg-scifi-purple/20' : 'bg-scifi-cyan/20'}`}>
            <Icon className={`h-4 w-4 ${required ? 'text-scifi-purple' : 'text-scifi-cyan'}`} />
          </div>
          <div>
            <h4 className="font-medium text-sm text-scifi-text">
              {title} {required && <span className="text-scifi-cyan">* (Required)</span>}
            </h4>
            <p className="text-xs text-scifi-text-muted">{description}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor={field}
            className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
              isUploading
                ? 'border-scifi-purple/50 bg-scifi-purple/5'
                : required && !hasDocument 
                  ? 'border-destructive/50 bg-destructive/5 hover:bg-destructive/10' 
                  : hasDocument 
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-scifi-border bg-scifi-card/50 hover:bg-scifi-card hover:border-scifi-purple/50'
            }`}
          >
            <div className="flex flex-col items-center justify-center py-4">
              {isUploading ? (
                <>
                  <Loader2 className="w-6 h-6 mb-1 text-scifi-purple animate-spin" />
                  <p className="text-sm text-scifi-purple font-medium">Uploading...</p>
                </>
              ) : hasDocument ? (
                <>
                  <FileCheck className="w-6 h-6 mb-1 text-green-500" />
                  <p className="text-sm text-green-400 font-medium truncate max-w-[200px]">{docInfo.name}</p>
                  {docInfo.size && (
                    <p className="text-xs text-scifi-text-muted">
                      {(docInfo.size / 1024).toFixed(2)} KB
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Upload className={`w-6 h-6 mb-1 ${required ? 'text-destructive' : 'text-scifi-text-muted'}`} />
                  <p className={`text-sm ${required ? 'text-destructive' : 'text-scifi-text-muted'}`}>
                    Click to upload
                  </p>
                  <p className="text-xs text-scifi-text-muted">PDF, JPG, or PNG (Max 10MB)</p>
                </>
              )}
            </div>
            <input
              id={field}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => handleFileChange(field, e.target.files?.[0] || null)}
              disabled={isUploading}
            />
          </Label>
          {hasDocument && !isUploading && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 btn-scifi-outline text-xs h-8"
                onClick={() => getDocPreviewUrl(doc, field)}
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                View
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 btn-scifi-outline text-xs h-8 text-destructive hover:bg-destructive/10"
                onClick={() => removeDocument(field)}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Remove
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const isUploading = uploadingField !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="section-scifi p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <FileCheck className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Document Upload</h2>
            <p className="text-sm text-muted-foreground">
              Please upload clear, legible copies of the following documents.
              <span className="text-scifi-cyan font-medium ml-1">Driver's License is required.</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <FileUploadCard
          title="Driver's License"
          description="Upload a copy of your current driver's license (front and back)"
          doc={documents.driversLicense}
          field="driversLicense"
          required={true}
          icon={CreditCard}
        />

        <FileUploadCard
          title="Social Security Card"
          description="Upload a copy of your Social Security card"
          doc={documents.socialSecurity}
          field="socialSecurity"
          required={false}
          icon={Shield}
        />

        <FileUploadCard
          title="Medical Card"
          description="Upload your current DOT medical examiner's certificate"
          doc={documents.medicalCard}
          field="medicalCard"
          required={false}
          icon={FileCheck}
        />

        {/* Other Documents */}
        <div className="section-scifi">
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-lg bg-scifi-cyan/20">
              <FolderOpen className="h-4 w-4 text-scifi-cyan" />
            </div>
            <div>
              <h4 className="font-medium text-sm text-scifi-text">Other Documents</h4>
              <p className="text-xs text-scifi-text-muted">
                Upload any additional documents (certifications, endorsements, etc.)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="other"
              className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                uploadingField === 'other'
                  ? 'border-scifi-purple/50 bg-scifi-purple/5'
                  : 'border-scifi-border bg-scifi-card/50 hover:bg-scifi-card hover:border-scifi-purple/50'
              }`}
            >
              <div className="flex flex-col items-center justify-center py-4">
                {uploadingField === 'other' ? (
                  <>
                    <Loader2 className="w-6 h-6 mb-1 text-scifi-purple animate-spin" />
                    <p className="text-sm text-scifi-purple font-medium">Uploading...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 mb-1 text-scifi-text-muted" />
                    <p className="text-sm text-scifi-text-muted">
                      Click to upload additional documents
                    </p>
                    <p className="text-xs text-scifi-text-muted">Multiple files allowed</p>
                  </>
                )}
              </div>
              <input
                id="other"
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleOtherFilesChange(e.target.files)}
                disabled={uploadingField === 'other'}
              />
            </Label>

            {documents.other.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-xs font-medium text-scifi-text-muted">Uploaded Files:</p>
                {documents.other.map((item, index) => {
                  const info = typeof item === 'string' 
                    ? { name: item.split('/').pop() || 'Document' }
                    : { name: item.name, size: item.size };
                  
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-scifi-card/50 rounded-lg border border-scifi-border/50"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm text-scifi-text truncate">{info.name}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-scifi-cyan hover:bg-scifi-cyan/20"
                          onClick={() => getDocPreviewUrl(item, `other_${index}`)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/20"
                          onClick={() => removeOtherFile(index)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="btn-scifi-outline" disabled={isUploading}>
          Previous
        </Button>
        <Button type="submit" className="btn-scifi" disabled={isUploading}>
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            'Next'
          )}
        </Button>
      </div>
    </form>
  );
};
