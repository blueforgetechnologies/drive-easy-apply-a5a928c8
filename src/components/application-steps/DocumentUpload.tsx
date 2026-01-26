import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileText, X, FileCheck, Shield, CreditCard, FolderOpen } from "lucide-react";
import { toast } from "sonner";

interface DocumentUploadProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
}

export const DocumentUpload = ({ data, onNext, onBack, isPreviewMode = false }: DocumentUploadProps) => {
  const isTestMode = isPreviewMode || (typeof window !== 'undefined' && localStorage.getItem("app_test_mode") === "true");
  
  const [documents, setDocuments] = useState({
    socialSecurity: data?.documents?.socialSecurity || null,
    driversLicense: data?.documents?.driversLicense || null,
    medicalCard: data?.documents?.medicalCard || null,
    other: data?.documents?.other || [],
  });

  const handleFileChange = (field: string, file: File | null) => {
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      
      const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        toast.error("Please upload JPG, PNG, or PDF files only");
        return;
      }
    }

    setDocuments((prev) => ({ ...prev, [field]: file }));
    if (file) {
      toast.success(`${file.name} uploaded successfully`);
    }
  };

  const handleOtherFilesChange = (files: FileList | null) => {
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
      setDocuments((prev) => ({
        ...prev,
        other: [...prev.other, ...validFiles],
      }));
      toast.success(`${validFiles.length} file(s) uploaded successfully`);
    }
  };

  const removeOtherFile = (index: number) => {
    setDocuments((prev) => ({
      ...prev,
      other: prev.other.filter((_: any, i: number) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Skip validation in Test Mode
    if (!isTestMode && !documents.driversLicense) {
      toast.error("Driver's License is required", {
        description: "Please upload a copy of your driver's license to continue.",
      });
      return;
    }
    
    onNext({ documents });
  };

  const FileUploadCard = ({
    title,
    description,
    file,
    field,
    required = false,
    icon: Icon,
  }: {
    title: string;
    description: string;
    file: File | null;
    field: string;
    required?: boolean;
    icon: React.ElementType;
  }) => (
    <div className={`section-scifi ${required && !file ? 'border-destructive/50' : ''}`}>
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
            required && !file 
              ? 'border-destructive/50 bg-destructive/5 hover:bg-destructive/10' 
              : file 
                ? 'border-green-500/50 bg-green-500/5'
                : 'border-scifi-border bg-scifi-card/50 hover:bg-scifi-card hover:border-scifi-purple/50'
          }`}
        >
          <div className="flex flex-col items-center justify-center py-4">
            {file ? (
              <>
                <FileText className="w-6 h-6 mb-1 text-green-500" />
                <p className="text-sm text-green-400 font-medium">{file.name}</p>
                <p className="text-xs text-scifi-text-muted">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
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
          />
        </Label>
        {file && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full btn-scifi-outline text-xs h-8"
            onClick={() => handleFileChange(field, null)}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Remove File
          </Button>
        )}
      </div>
    </div>
  );

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
          file={documents.driversLicense}
          field="driversLicense"
          required={true}
          icon={CreditCard}
        />

        <FileUploadCard
          title="Social Security Card"
          description="Upload a copy of your Social Security card"
          file={documents.socialSecurity}
          field="socialSecurity"
          required={false}
          icon={Shield}
        />

        <FileUploadCard
          title="Medical Card"
          description="Upload your current DOT medical examiner's certificate"
          file={documents.medicalCard}
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
              className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-all border-scifi-border bg-scifi-card/50 hover:bg-scifi-card hover:border-scifi-purple/50"
            >
              <div className="flex flex-col items-center justify-center py-4">
                <Upload className="w-6 h-6 mb-1 text-scifi-text-muted" />
                <p className="text-sm text-scifi-text-muted">
                  Click to upload additional documents
                </p>
                <p className="text-xs text-scifi-text-muted">Multiple files allowed</p>
              </div>
              <input
                id="other"
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleOtherFilesChange(e.target.files)}
              />
            </Label>

            {documents.other.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-xs font-medium text-scifi-text-muted">Uploaded Files:</p>
                {documents.other.map((file: File, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-scifi-card/50 rounded-lg border border-scifi-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-scifi-text">{file.name}</span>
                    </div>
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
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="btn-scifi-outline">
          Previous
        </Button>
        <Button type="submit" className="btn-scifi">
          Next
        </Button>
      </div>
    </form>
  );
};
