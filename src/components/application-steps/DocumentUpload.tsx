import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Upload, FileText, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface DocumentUploadProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const DocumentUpload = ({ data, onNext, onBack }: DocumentUploadProps) => {
  const [documents, setDocuments] = useState({
    socialSecurity: data?.documents?.socialSecurity || null,
    driversLicense: data?.documents?.driversLicense || null,
    medicalCard: data?.documents?.medicalCard || null,
    other: data?.documents?.other || [],
  });

  const handleFileChange = (field: string, file: File | null) => {
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      
      // Validate file type
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
    
    // Validate that driver's license is uploaded (mandatory)
    if (!documents.driversLicense) {
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
  }: {
    title: string;
    description: string;
    file: File | null;
    field: string;
    required?: boolean;
  }) => (
    <Card className={`p-6 ${required && !file ? 'border-destructive' : ''}`}>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-foreground mb-1">
            {title} {required && <span className="text-destructive">* (Required)</span>}
          </h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor={field}
            className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              required && !file 
                ? 'border-destructive bg-destructive/5 hover:bg-destructive/10' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {file ? (
                <>
                  <FileText className="w-8 h-8 mb-2 text-success" />
                  <p className="text-sm text-success font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </>
              ) : (
                <>
                  <Upload className={`w-8 h-8 mb-2 ${required ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <p className={`text-sm ${required ? 'text-destructive' : 'text-muted-foreground'}`}>
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">PDF, JPG, or PNG (Max 10MB)</p>
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
              className="w-full"
              onClick={() => handleFileChange(field, null)}
            >
              <X className="w-4 h-4 mr-2" />
              Remove File
            </Button>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Document Upload</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please upload clear, legible copies of the following documents. 
          <span className="text-destructive font-medium"> Driver's License is required.</span>
        </p>
      </div>

      <div className="space-y-4">
        <FileUploadCard
          title="Driver's License"
          description="Upload a copy of your current driver's license (front and back)"
          file={documents.driversLicense}
          field="driversLicense"
          required={true}
        />

        <FileUploadCard
          title="Social Security Card"
          description="Upload a copy of your Social Security card (both sides if applicable)"
          file={documents.socialSecurity}
          field="socialSecurity"
          required={false}
        />

        <FileUploadCard
          title="Medical Card"
          description="Upload your current DOT medical examiner's certificate"
          file={documents.medicalCard}
          field="medicalCard"
          required={false}
        />

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-1">Other Documents</h4>
              <p className="text-sm text-muted-foreground">
                Upload any additional documents (certifications, endorsements, etc.)
              </p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="other"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload additional documents
                  </p>
                  <p className="text-xs text-muted-foreground">Multiple files allowed</p>
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
                <div className="space-y-2 mt-4">
                  <p className="text-sm font-medium">Uploaded Files:</p>
                  {documents.other.map((file: File, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-success" />
                        <span className="text-sm">{file.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOtherFile(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2">
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};