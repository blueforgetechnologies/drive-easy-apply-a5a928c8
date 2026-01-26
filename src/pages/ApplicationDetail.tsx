import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  ArrowLeft, Save, Trash2, User, CreditCard, FileText, 
  Phone, Mail, Calendar, MapPin, Shield, Briefcase,
  Building2, DollarSign, AlertCircle, Upload, Eye, Clock,
  TrendingUp, Wallet, MinusCircle, Check, ClipboardList,
  Download, Loader2, X
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ApplicationViewer } from "@/components/driver/ApplicationViewer";

// Document type configuration for easy management
const DOCUMENT_TYPES = {
  driversLicense: { label: "Driver License", color: "emerald", icon: CreditCard },
  socialSecurityCard: { label: "Social Security", color: "sky", icon: Shield },
  medicalCard: { label: "Medical Card", color: "pink", icon: FileText },
  mvr: { label: "Driver Record", color: "orange", icon: FileText },
  workPermit: { label: "Work Permit", color: "teal", icon: FileText },
  greenCard: { label: "Green Card", color: "green", icon: FileText },
} as const;

type DocType = keyof typeof DOCUMENT_TYPES;

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [formData, setFormData] = useState<any>({});
  
  // MVR Preview state
  const [mvrPreviewOpen, setMvrPreviewOpen] = useState(false);
  const [mvrPreviewUrl, setMvrPreviewUrl] = useState<string | null>(null);
  const [mvrPreviewLoading, setMvrPreviewLoading] = useState(false);
  
  // Document management state
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewType, setDocPreviewType] = useState<string>("");
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<DocType | null>(null);
  const fileInputRefs = useRef<Record<DocType, HTMLInputElement | null>>({} as Record<DocType, HTMLInputElement | null>);

  useEffect(() => {
    loadApplication();
  }, [id]);

  const loadApplication = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setFormData(data);
    } catch (error: any) {
      toast.error("Error loading application");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update(formData)
        .eq("id", id);

      if (error) throw error;
      toast.success("Driver information updated successfully");
    } catch (error: any) {
      toast.error("Failed to update driver information: " + error.message);
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Driver deleted successfully");
      navigate("/dashboard/business?subtab=drivers");
    } catch (error: any) {
      toast.error("Failed to delete driver: " + error.message);
      console.error("Delete error:", error);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const updateNestedField = (parent: string, field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value }
    }));
  };

  const handleViewMvr = async () => {
    const documentUpload = formData.document_upload || {};
    const mvrPath = documentUpload.mvr;
    
    if (!mvrPath) {
      toast.error("No MVR uploaded");
      return;
    }

    setMvrPreviewLoading(true);
    setMvrPreviewOpen(true);

    try {
      const { data, error } = await supabase.storage
        .from("load-documents")
        .createSignedUrl(mvrPath, 3600);

      if (error) {
        console.error("Error creating signed URL:", error);
        toast.error("Could not load MVR document");
        setMvrPreviewOpen(false);
        return;
      }

      if (data?.signedUrl) {
        setMvrPreviewUrl(data.signedUrl);
      } else {
        toast.error("Could not generate MVR link");
        setMvrPreviewOpen(false);
      }
    } catch (error) {
      console.error("Error viewing MVR:", error);
      toast.error("Failed to view MVR");
      setMvrPreviewOpen(false);
    } finally {
      setMvrPreviewLoading(false);
    }
  };

  const hasMvrUploaded = !!(formData.document_upload?.mvr);
  
  // Generic document viewer
  const handleViewDocument = async (docType: DocType) => {
    const documentUpload = formData.document_upload || {};
    const docPath = documentUpload[docType];
    
    if (!docPath) {
      toast.error(`No ${DOCUMENT_TYPES[docType].label} uploaded`);
      return;
    }

    setDocPreviewLoading(true);
    setDocPreviewType(DOCUMENT_TYPES[docType].label);
    setDocPreviewOpen(true);

    try {
      const { data, error } = await supabase.storage
        .from("load-documents")
        .createSignedUrl(docPath, 3600);

      if (error) {
        console.error("Error creating signed URL:", error);
        toast.error(`Could not load ${DOCUMENT_TYPES[docType].label}`);
        setDocPreviewOpen(false);
        return;
      }

      if (data?.signedUrl) {
        setDocPreviewUrl(data.signedUrl);
      } else {
        toast.error("Could not generate document link");
        setDocPreviewOpen(false);
      }
    } catch (error) {
      console.error("Error viewing document:", error);
      toast.error("Failed to view document");
      setDocPreviewOpen(false);
    } finally {
      setDocPreviewLoading(false);
    }
  };

  // Upload/replace document
  const handleUploadDocument = async (docType: DocType, file: File) => {
    if (!formData.tenant_id || !formData.invite_id) {
      toast.error("Missing application context");
      return;
    }

    setUploadingDoc(docType);
    
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const storagePath = `${formData.tenant_id}/applications/${formData.invite_id}/${docType}.${ext}`;
      
      // Delete existing file if it exists
      const existingPath = formData.document_upload?.[docType];
      if (existingPath) {
        await supabase.storage.from("load-documents").remove([existingPath]);
      }

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from("load-documents")
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Update formData
      const updatedDocUpload = { ...(formData.document_upload || {}), [docType]: storagePath };
      setFormData((prev: any) => ({ ...prev, document_upload: updatedDocUpload }));

      // Save to database
      const { error: updateError } = await supabase
        .from("applications")
        .update({ document_upload: updatedDocUpload })
        .eq("id", id);

      if (updateError) throw updateError;

      toast.success(`${DOCUMENT_TYPES[docType].label} uploaded successfully`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(`Failed to upload ${DOCUMENT_TYPES[docType].label}: ${error.message}`);
    } finally {
      setUploadingDoc(null);
    }
  };

  // Delete document
  const handleDeleteDocument = async (docType: DocType) => {
    const docPath = formData.document_upload?.[docType];
    if (!docPath) return;

    setDeletingDoc(docType);

    try {
      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from("load-documents")
        .remove([docPath]);

      if (deleteError) throw deleteError;

      // Update formData
      const updatedDocUpload = { ...(formData.document_upload || {}) };
      delete updatedDocUpload[docType];
      setFormData((prev: any) => ({ ...prev, document_upload: updatedDocUpload }));

      // Save to database
      const { error: updateError } = await supabase
        .from("applications")
        .update({ document_upload: updatedDocUpload })
        .eq("id", id);

      if (updateError) throw updateError;

      toast.success(`${DOCUMENT_TYPES[docType].label} deleted successfully`);
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(`Failed to delete ${DOCUMENT_TYPES[docType].label}: ${error.message}`);
    } finally {
      setDeletingDoc(null);
    }
  };

  // Check if document exists
  const hasDocument = (docType: DocType) => !!(formData.document_upload?.[docType]);

  // Trigger file input
  const triggerFileInput = (docType: DocType) => {
    fileInputRefs.current[docType]?.click();
  };

  // File input change handler
  const onFileChange = (docType: DocType) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadDocument(docType, file);
    }
    // Reset input
    if (e.target) e.target.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

  const personalInfo = formData.personal_info || {};
  const licenseInfo = formData.license_info || {};
  const directDeposit = formData.direct_deposit || {};
  const emergencyContacts = formData.emergency_contacts || [];
  const primaryContact = emergencyContacts[0] || {};

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'pending': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'inactive': return 'bg-slate-500/10 text-slate-600 border-slate-200';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-200';
    }
  };

  const driverName = `${personalInfo.firstName || ''} ${personalInfo.lastName || ''}`.trim() || 'Driver';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate("/dashboard/business?subtab=drivers")} variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Drivers
            </Button>
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                {personalInfo.firstName?.[0]?.toUpperCase() || 'D'}{personalInfo.lastName?.[0]?.toUpperCase() || ''}
              </div>
              <div>
                <h1 className="font-semibold text-lg">{driverName}</h1>
                <Badge variant="outline" className={getStatusColor(formData.driver_status)}>
                  {formData.driver_status || 'Pending'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the driver and all associated data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="application" className="space-y-6">
          <TabsList className="bg-white dark:bg-slate-800 p-1 shadow-sm flex-wrap">
            <TabsTrigger value="application" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
              <ClipboardList className="w-4 h-4 mr-2" />
              Application
            </TabsTrigger>
            <TabsTrigger value="personal" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <User className="w-4 h-4 mr-2" />
              Personal
            </TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
              <FileText className="w-4 h-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="financial" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white">
              <DollarSign className="w-4 h-4 mr-2" />
              Financial
            </TabsTrigger>
            <TabsTrigger value="employment" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
              <Briefcase className="w-4 h-4 mr-2" />
              Employment
            </TabsTrigger>
          </TabsList>

          {/* Application Tab - Read-only professional view */}
          <TabsContent value="application">
            <ApplicationViewer data={formData} onViewMvr={handleViewMvr} />
          </TabsContent>

          {/* Personal Tab */}
          <TabsContent value="personal" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Basic Information */}
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <User className="w-5 h-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                    <Select 
                      value={formData.driver_status || 'pending'} 
                      onValueChange={(value) => updateField('driver_status', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">First Name</Label>
                      <Input 
                        value={personalInfo.firstName || ''} 
                        onChange={(e) => updateNestedField('personal_info', 'firstName', e.target.value)}
                        className="border-slate-200 focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Last Name</Label>
                      <Input 
                        value={personalInfo.lastName || ''} 
                        onChange={(e) => updateNestedField('personal_info', 'lastName', e.target.value)}
                        className="border-slate-200 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Address
                    </Label>
                    <Input 
                      value={formData.driver_address || personalInfo.address || ''} 
                      onChange={(e) => updateField('driver_address', e.target.value)}
                      className="border-slate-200 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Date of Birth
                    </Label>
                    <Input 
                      type="date"
                      value={personalInfo.dateOfBirth || ''} 
                      onChange={(e) => updateNestedField('personal_info', 'dateOfBirth', e.target.value)}
                      className="border-slate-200 focus:border-blue-500"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card className="border-l-4 border-l-indigo-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-indigo-600">
                    <Phone className="w-5 h-5" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Home Phone</Label>
                      <Input 
                        value={formData.home_phone || ''} 
                        onChange={(e) => updateField('home_phone', e.target.value)}
                        className="border-slate-200 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cell Phone</Label>
                      <Input 
                        value={formData.cell_phone || personalInfo.phone || ''} 
                        onChange={(e) => updateField('cell_phone', e.target.value)}
                        className="border-slate-200 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email
                    </Label>
                    <Input 
                      type="email"
                      value={personalInfo.email || ''} 
                      onChange={(e) => updateNestedField('personal_info', 'email', e.target.value)}
                      className="border-slate-200 focus:border-indigo-500"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Emergency Contact */}
              <Card className="border-l-4 border-l-rose-500 shadow-sm lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-rose-600">
                    <AlertCircle className="w-5 h-5" />
                    Emergency Contact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Name</Label>
                      <Input 
                        value={`${primaryContact.firstName || ''} ${primaryContact.lastName || ''}`.trim()} 
                        onChange={(e) => {
                          const [firstName, ...lastNameParts] = e.target.value.split(' ');
                          const updatedContacts = [...emergencyContacts];
                          updatedContacts[0] = {
                            ...updatedContacts[0],
                            firstName: firstName || '',
                            lastName: lastNameParts.join(' ') || ''
                          };
                          updateField('emergency_contacts', updatedContacts);
                        }}
                        className="border-slate-200 focus:border-rose-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</Label>
                      <Input 
                        value={primaryContact.phone || ''} 
                        onChange={(e) => {
                          const updatedContacts = [...emergencyContacts];
                          updatedContacts[0] = { ...updatedContacts[0], phone: e.target.value };
                          updateField('emergency_contacts', updatedContacts);
                        }}
                        className="border-slate-200 focus:border-rose-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Relationship</Label>
                      <Input 
                        value={primaryContact.relationship || ''} 
                        onChange={(e) => {
                          const updatedContacts = [...emergencyContacts];
                          updatedContacts[0] = { ...updatedContacts[0], relationship: e.target.value };
                          updateField('emergency_contacts', updatedContacts);
                        }}
                        className="border-slate-200 focus:border-rose-500"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            {/* Hidden file inputs */}
            {(Object.keys(DOCUMENT_TYPES) as DocType[]).map((docType) => (
              <input
                key={docType}
                type="file"
                ref={(el) => { fileInputRefs.current[docType] = el; }}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                onChange={onFileChange(docType)}
              />
            ))}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Driver License */}
              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-emerald-600">
                      <CreditCard className="w-5 h-5" />
                      Driver License
                    </span>
                    <div className="flex items-center gap-1">
                      {hasDocument('driversLicense') && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => handleViewDocument('driversLicense')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive"
                                disabled={deletingDoc === 'driversLicense'}
                              >
                                {deletingDoc === 'driversLicense' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Driver License?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the uploaded document. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDocument('driversLicense')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-emerald-600 hover:text-emerald-700"
                        onClick={() => triggerFileInput('driversLicense')}
                        disabled={uploadingDoc === 'driversLicense'}
                      >
                        {uploadingDoc === 'driversLicense' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">License #</Label>
                    <Input 
                      value={licenseInfo.licenseNumber || ''} 
                      onChange={(e) => updateNestedField('license_info', 'licenseNumber', e.target.value)}
                      className="border-slate-200 focus:border-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Class</Label>
                      <Input 
                        value={licenseInfo.class || ''} 
                        onChange={(e) => updateNestedField('license_info', 'class', e.target.value)}
                        className="border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">State</Label>
                      <Input 
                        value={licenseInfo.state || ''} 
                        onChange={(e) => updateNestedField('license_info', 'state', e.target.value)}
                        className="border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Endorsements</Label>
                    <Input 
                      value={licenseInfo.endorsements || ''} 
                      onChange={(e) => updateNestedField('license_info', 'endorsements', e.target.value)}
                      className="border-slate-200 focus:border-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Issued</Label>
                      <Input 
                        type="date"
                        value={licenseInfo.issuedDate || ''} 
                        onChange={(e) => updateNestedField('license_info', 'issuedDate', e.target.value)}
                        className="border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expires</Label>
                      <Input 
                        type="date"
                        value={licenseInfo.expirationDate || ''} 
                        onChange={(e) => updateNestedField('license_info', 'expirationDate', e.target.value)}
                        className="border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  {hasDocument('driversLicense') && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      <Check className="w-3 h-3 mr-1" /> Document Uploaded
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {/* Social Security Card */}
              <Card className="border-l-4 border-l-sky-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sky-600">
                      <Shield className="w-5 h-5" />
                      Social Security
                    </span>
                    <div className="flex items-center gap-1">
                      {hasDocument('socialSecurityCard') && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-sky-600 hover:text-sky-700"
                            onClick={() => handleViewDocument('socialSecurityCard')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive"
                                disabled={deletingDoc === 'socialSecurityCard'}
                              >
                                {deletingDoc === 'socialSecurityCard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Social Security Card?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the uploaded document. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDocument('socialSecurityCard')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-sky-600 hover:text-sky-700"
                        onClick={() => triggerFileInput('socialSecurityCard')}
                        disabled={uploadingDoc === 'socialSecurityCard'}
                      >
                        {uploadingDoc === 'socialSecurityCard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">SS #</Label>
                    <Input 
                      value={personalInfo.ssn || ''} 
                      onChange={(e) => updateNestedField('personal_info', 'ssn', e.target.value)}
                      className="border-slate-200 focus:border-sky-500"
                      type="password"
                    />
                  </div>
                  {hasDocument('socialSecurityCard') && (
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                      <Check className="w-3 h-3 mr-1" /> Document Uploaded
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {/* Medical Card */}
              <Card className="border-l-4 border-l-pink-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-pink-600">
                      <FileText className="w-5 h-5" />
                      Medical Card
                    </span>
                    <div className="flex items-center gap-1">
                      {hasDocument('medicalCard') && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-pink-600 hover:text-pink-700"
                            onClick={() => handleViewDocument('medicalCard')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive"
                                disabled={deletingDoc === 'medicalCard'}
                              >
                                {deletingDoc === 'medicalCard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Medical Card?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the uploaded document. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDocument('medicalCard')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-pink-600 hover:text-pink-700"
                        onClick={() => triggerFileInput('medicalCard')}
                        disabled={uploadingDoc === 'medicalCard'}
                      >
                        {uploadingDoc === 'medicalCard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
                    <Input 
                      type="date"
                      value={formData.medical_card_expiry || licenseInfo.dotCardExpiration || ''} 
                      onChange={(e) => updateField('medical_card_expiry', e.target.value)}
                      className="border-slate-200 focus:border-pink-500"
                    />
                  </div>
                  {hasDocument('medicalCard') && (
                    <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                      <Check className="w-3 h-3 mr-1" /> Document Uploaded
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {/* Driver Record (MVR) */}
              <Card className="border-l-4 border-l-orange-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-orange-600">
                      <FileText className="w-5 h-5" />
                      Driver Record
                    </span>
                    <div className="flex items-center gap-1">
                      {hasDocument('mvr') && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-orange-600 hover:text-orange-700"
                            onClick={() => handleViewDocument('mvr')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive"
                                disabled={deletingDoc === 'mvr'}
                              >
                                {deletingDoc === 'mvr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Driver Record?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the uploaded document. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDocument('mvr')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-orange-600 hover:text-orange-700"
                        onClick={() => triggerFileInput('mvr')}
                        disabled={uploadingDoc === 'mvr'}
                      >
                        {uploadingDoc === 'mvr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
                    <Input 
                      type="date"
                      value={formData.driver_record_expiry || ''} 
                      onChange={(e) => updateField('driver_record_expiry', e.target.value)}
                      className="border-slate-200 focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Restrictions</Label>
                    <Input 
                      value={formData.restrictions || ''} 
                      onChange={(e) => updateField('restrictions', e.target.value)}
                      className="border-slate-200 focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">National Registry</Label>
                    <Input 
                      value={formData.national_registry || ''} 
                      onChange={(e) => updateField('national_registry', e.target.value)}
                      className="border-slate-200 focus:border-orange-500"
                    />
                  </div>
                  {hasDocument('mvr') && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                      <Check className="w-3 h-3 mr-1" /> Document Uploaded
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {/* Work Permit */}
              <Card className="border-l-4 border-l-teal-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-teal-600">
                      <FileText className="w-5 h-5" />
                      Work Permit
                    </span>
                    <div className="flex items-center gap-1">
                      {hasDocument('workPermit') && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-teal-600 hover:text-teal-700"
                            onClick={() => handleViewDocument('workPermit')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive"
                                disabled={deletingDoc === 'workPermit'}
                              >
                                {deletingDoc === 'workPermit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Work Permit?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the uploaded document. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDocument('workPermit')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-teal-600 hover:text-teal-700"
                        onClick={() => triggerFileInput('workPermit')}
                        disabled={uploadingDoc === 'workPermit'}
                      >
                        {uploadingDoc === 'workPermit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
                    <Input 
                      type="date"
                      value={formData.work_permit_expiry || ''} 
                      onChange={(e) => updateField('work_permit_expiry', e.target.value)}
                      className="border-slate-200 focus:border-teal-500"
                    />
                  </div>
                  {hasDocument('workPermit') && (
                    <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                      <Check className="w-3 h-3 mr-1" /> Document Uploaded
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {/* Green Card */}
              <Card className="border-l-4 border-l-green-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-green-600">
                      <FileText className="w-5 h-5" />
                      Green Card
                    </span>
                    <div className="flex items-center gap-1">
                      {hasDocument('greenCard') && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleViewDocument('greenCard')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive"
                                disabled={deletingDoc === 'greenCard'}
                              >
                                {deletingDoc === 'greenCard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Green Card?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the uploaded document. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDocument('greenCard')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-green-600 hover:text-green-700"
                        onClick={() => triggerFileInput('greenCard')}
                        disabled={uploadingDoc === 'greenCard'}
                      >
                        {uploadingDoc === 'greenCard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
                    <Input 
                      type="date"
                      value={formData.green_card_expiry || ''} 
                      onChange={(e) => updateField('green_card_expiry', e.target.value)}
                      className="border-slate-200 focus:border-green-500"
                    />
                  </div>
                  {hasDocument('greenCard') && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <Check className="w-3 h-3 mr-1" /> Document Uploaded
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Document Preview Dialog */}
            <Dialog open={docPreviewOpen} onOpenChange={setDocPreviewOpen}>
              <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between">
                    <span>{docPreviewType}</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setDocPreviewOpen(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                  {docPreviewLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : docPreviewUrl ? (
                    docPreviewUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                      <img 
                        src={docPreviewUrl} 
                        alt={docPreviewType}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <iframe
                        src={`https://docs.google.com/viewer?url=${encodeURIComponent(docPreviewUrl)}&embedded=true`}
                        className="w-full h-full border-0"
                        title={docPreviewType}
                      />
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No document to display
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Financial Tab */}
          <TabsContent value="financial" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* Banking Information */}
              <Card className="border-l-4 border-l-violet-500 shadow-sm">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-violet-600">
                    <Building2 className="w-4 h-4" />
                    Banking Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bank Name</Label>
                    <Input 
                      value={formData.bank_name || directDeposit.bankName || ''} 
                      onChange={(e) => updateField('bank_name', e.target.value)}
                      className="border-slate-200 focus:border-violet-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Account Holder Name</Label>
                    <Input 
                      value={formData.account_name || `${directDeposit.firstName} ${directDeposit.lastName}`.trim() || ''} 
                      onChange={(e) => updateField('account_name', e.target.value)}
                      className="border-slate-200 focus:border-violet-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Routing #</Label>
                      <Input 
                        value={formData.routing_number || directDeposit.routingNumber || ''} 
                        onChange={(e) => updateField('routing_number', e.target.value)}
                        className="border-slate-200 focus:border-violet-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Checking #</Label>
                      <Input 
                        value={formData.checking_number || directDeposit.checkingNumber || ''} 
                        onChange={(e) => updateField('checking_number', e.target.value)}
                        className="border-slate-200 focus:border-violet-500"
                        type="password"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Account Type</Label>
                    <Select 
                      value={formData.account_type || directDeposit.accountType || ''} 
                      onValueChange={(value) => updateField('account_type', value)}
                    >
                      <SelectTrigger className="border-slate-200 focus:border-violet-500">
                        <SelectValue placeholder="Select account type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personal_checking">Personal Checking</SelectItem>
                        <SelectItem value="personal_savings">Personal Savings</SelectItem>
                        <SelectItem value="business_checking">Business Checking</SelectItem>
                        <SelectItem value="business_savings">Business Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Primary Compensation */}
              <Card className={`border-l-4 shadow-sm ${formData.pay_method_active ? 'border-l-amber-500' : 'border-l-slate-300'}`}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="flex items-center justify-between">
                    <span className={`flex items-center gap-2 ${formData.pay_method_active ? 'text-amber-600' : 'text-slate-400'}`}>
                      <DollarSign className="w-4 h-4" />
                      Primary Compensation
                    </span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="pay-active" className="text-xs text-muted-foreground">
                        {formData.pay_method_active ? 'Active' : 'Inactive'}
                      </Label>
                      <Switch 
                        id="pay-active"
                        checked={formData.pay_method_active ?? true}
                        onCheckedChange={(checked) => updateField('pay_method_active', checked)}
                      />
                    </div>
                  </CardTitle>
                  {formData.pay_method_active && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Used for Fleet$ calculations
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pay Type</Label>
                    <Select 
                      value={formData.pay_method || 'salary'} 
                      onValueChange={(value) => updateField('pay_method', value)}
                    >
                      <SelectTrigger className="border-slate-200 focus:border-amber-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="salary">Weekly Salary</SelectItem>
                        <SelectItem value="hourly">Hourly Rate</SelectItem>
                        <SelectItem value="mileage">Per Mile</SelectItem>
                        <SelectItem value="percentage">Percentage of Load</SelectItem>
                        <SelectItem value="hybrid">Hybrid (Base + Mileage)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conditional fields based on pay type */}
                  {formData.pay_method === 'salary' && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Weekly Salary</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input 
                          type="number"
                          step="0.01"
                          value={formData.weekly_salary || ''} 
                          onChange={(e) => updateField('weekly_salary', e.target.value)}
                          className="pl-7 border-slate-200 focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  {formData.pay_method === 'hourly' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hourly Rate</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number"
                            step="0.01"
                            value={formData.hourly_rate || ''} 
                            onChange={(e) => updateField('hourly_rate', e.target.value)}
                            className="pl-7 border-slate-200 focus:border-amber-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hours/Week</Label>
                        <Input 
                          type="number"
                          value={formData.hours_per_week || ''} 
                          onChange={(e) => updateField('hours_per_week', e.target.value)}
                          className="border-slate-200 focus:border-amber-500"
                          placeholder="40"
                        />
                      </div>
                    </div>
                  )}

                  {formData.pay_method === 'mileage' && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pay Per Mile</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input 
                          type="number"
                          step="0.01"
                          value={formData.pay_per_mile || ''} 
                          onChange={(e) => updateField('pay_per_mile', e.target.value)}
                          className="pl-7 border-slate-200 focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  {formData.pay_method === 'percentage' && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Percentage of Load</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={formData.load_percentage || ''} 
                          onChange={(e) => updateField('load_percentage', e.target.value)}
                          className="pr-8 border-slate-200 focus:border-amber-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      </div>
                    </div>
                  )}

                  {formData.pay_method === 'hybrid' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Base Salary</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number"
                            step="0.01"
                            value={formData.base_salary || ''} 
                            onChange={(e) => updateField('base_salary', e.target.value)}
                            className="pl-7 border-slate-200 focus:border-amber-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Per Mile</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number"
                            step="0.01"
                            value={formData.pay_per_mile || ''} 
                            onChange={(e) => updateField('pay_per_mile', e.target.value)}
                            className="pl-7 border-slate-200 focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show all fields in a summary if no specific type */}
                  {(!formData.pay_method || formData.pay_method === 'salary') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pay Per Mile</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number"
                            step="0.01"
                            value={formData.pay_per_mile || ''} 
                            onChange={(e) => updateField('pay_per_mile', e.target.value)}
                            className="pl-7 border-slate-200 focus:border-amber-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hourly Rate</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number"
                            step="0.01"
                            value={formData.hourly_rate || ''} 
                            onChange={(e) => updateField('hourly_rate', e.target.value)}
                            className="pl-7 border-slate-200 focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Overtime & Premium Pay */}
              <Card className="border-l-4 border-l-orange-500 shadow-sm">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-orange-600">
                    <Clock className="w-4 h-4" />
                    Overtime & Premium Pay
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                    <div>
                      <Label className="text-sm font-medium">Overtime Eligible</Label>
                      <p className="text-xs text-muted-foreground">After 40 hours/week</p>
                    </div>
                    <Checkbox 
                      checked={formData.overtime_eligible || false}
                      onCheckedChange={(checked) => updateField('overtime_eligible', checked)}
                    />
                  </div>

                  {formData.overtime_eligible && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Overtime Rate Multiplier</Label>
                      <Select 
                        value={formData.overtime_multiplier || '1.5'} 
                        onValueChange={(value) => updateField('overtime_multiplier', value)}
                      >
                        <SelectTrigger className="border-slate-200 focus:border-orange-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1.5">1.5x (Time and a Half)</SelectItem>
                          <SelectItem value="2.0">2.0x (Double Time)</SelectItem>
                          <SelectItem value="1.25">1.25x</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Weekend Premium</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.weekend_premium || ''} 
                        onChange={(e) => updateField('weekend_premium', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-orange-500"
                        placeholder="Extra per day"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Holiday Pay Rate</Label>
                    <Select 
                      value={formData.holiday_pay_rate || 'none'} 
                      onValueChange={(value) => updateField('holiday_pay_rate', value)}
                    >
                      <SelectTrigger className="border-slate-200 focus:border-orange-500">
                        <SelectValue placeholder="Select holiday pay" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Holiday Pay</SelectItem>
                        <SelectItem value="1.5x">1.5x Regular Rate</SelectItem>
                        <SelectItem value="2.0x">2.0x Regular Rate</SelectItem>
                        <SelectItem value="flat">Flat Bonus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Bonuses & Incentives */}
              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-emerald-600">
                    <TrendingUp className="w-4 h-4" />
                    Bonuses & Incentives
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sign-On Bonus</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.sign_on_bonus || ''} 
                        onChange={(e) => updateField('sign_on_bonus', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Safety Bonus (Monthly)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.safety_bonus || ''} 
                        onChange={(e) => updateField('safety_bonus', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fuel Efficiency Bonus</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.fuel_bonus || ''} 
                        onChange={(e) => updateField('fuel_bonus', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Referral Bonus</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.referral_bonus || ''} 
                        onChange={(e) => updateField('referral_bonus', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Allowances */}
              <Card className="border-l-4 border-l-sky-500 shadow-sm">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-sky-600">
                    <Wallet className="w-4 h-4" />
                    Allowances & Per Diem
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Per Diem (Daily)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.per_diem || ''} 
                        onChange={(e) => updateField('per_diem', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Layover Pay</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.layover_pay || ''} 
                        onChange={(e) => updateField('layover_pay', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-sky-500"
                        placeholder="Per night"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Detention Pay (Hourly)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.detention_pay || ''} 
                        onChange={(e) => updateField('detention_pay', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-sky-500"
                        placeholder="After 2 hours"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Stop Pay</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.stop_pay || ''} 
                        onChange={(e) => updateField('stop_pay', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-sky-500"
                        placeholder="Per extra stop"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Deductions */}
              <Card className="border-l-4 border-l-rose-500 shadow-sm">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-rose-600">
                    <MinusCircle className="w-4 h-4" />
                    Standard Deductions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Insurance Deduction</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.insurance_deduction || ''} 
                        onChange={(e) => updateField('insurance_deduction', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-rose-500"
                        placeholder="Per week"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Escrow Deduction</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.escrow_deduction || ''} 
                        onChange={(e) => updateField('escrow_deduction', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-rose-500"
                        placeholder="Per week"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Equipment Lease</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.equipment_lease || ''} 
                        onChange={(e) => updateField('equipment_lease', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-rose-500"
                        placeholder="Per week"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Other Deductions</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={formData.other_deductions || ''} 
                        onChange={(e) => updateField('other_deductions', e.target.value)}
                        className="pl-7 border-slate-200 focus:border-rose-500"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Employment Tab */}
          <TabsContent value="employment" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Job Application */}
              <Card className="border-l-4 border-l-cyan-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-cyan-600">
                      <Briefcase className="w-5 h-5" />
                      Job Application
                    </span>
                    <Button variant="ghost" size="sm" className="text-cyan-600 hover:text-cyan-700">
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Application Date</Label>
                      <Input 
                        type="date"
                        value={formData.application_date || formData.submitted_at?.split('T')[0] || ''} 
                        onChange={(e) => updateField('application_date', e.target.value)}
                        className="border-slate-200 focus:border-cyan-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hired Date</Label>
                      <Input 
                        type="date"
                        value={formData.hired_date || ''} 
                        onChange={(e) => updateField('hired_date', e.target.value)}
                        className="border-slate-200 focus:border-cyan-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Score Card</Label>
                    <Input 
                      value={formData.score_card || ''} 
                      onChange={(e) => updateField('score_card', e.target.value)}
                      className="border-slate-200 focus:border-cyan-500"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-cyan-600 border-cyan-200 hover:bg-cyan-50"
                    disabled={downloadingPdf}
                    onClick={async () => {
                      setDownloadingPdf(true);
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) throw new Error("Not authenticated");
                        
                        const response = await fetch(
                          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-application-pdf`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${session.access_token}`,
                            },
                            body: JSON.stringify({ application_id: id }),
                          }
                        );

                        if (!response.ok) {
                          const errData = await response.json();
                          throw new Error(errData.error || "Failed to generate PDF");
                        }

                        const data = await response.json();
                        
                        // Decode base64 to binary
                        const binaryString = atob(data.pdf_base64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                          bytes[i] = binaryString.charCodeAt(i);
                        }
                        
                        const blob = new Blob([bytes], { type: 'application/pdf' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = data.filename || `${personalInfo.firstName || "Driver"}_${personalInfo.lastName || "Application"}_Application.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                        toast.success("PDF downloaded successfully");
                      } catch (error: any) {
                        toast.error("Failed to download PDF: " + error.message);
                      } finally {
                        setDownloadingPdf(false);
                      }
                    }}
                  >
                    {downloadingPdf ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download Application PDF
                  </Button>
                </CardContent>
              </Card>

              {/* Driver Notes */}
              <Card className="border-l-4 border-l-purple-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-purple-600">
                      <FileText className="w-5 h-5" />
                      Driver Notes
                    </span>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => updateField('vehicle_note', '')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                        onClick={async () => {
                          try {
                            const { error } = await supabase
                              .from("applications")
                              .update({ vehicle_note: formData.vehicle_note })
                              .eq("id", id);
                            if (error) throw error;
                            toast.success("Driver notes saved");
                          } catch (error: any) {
                            toast.error("Failed to save notes: " + error.message);
                          }
                        }}
                      >
                        Save Note
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea 
                    value={formData.vehicle_note || ''} 
                    onChange={(e) => updateField('vehicle_note', e.target.value)}
                    rows={5}
                    className="resize-none border-slate-200 focus:border-purple-500"
                    placeholder="Dispatcher will be able to view this in the Load Hunter"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* MVR Preview Dialog */}
      <Dialog open={mvrPreviewOpen} onOpenChange={setMvrPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Motor Vehicle Record (MVR)
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {mvrPreviewLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : mvrPreviewUrl ? (
              (() => {
                const isPdf = mvrPreviewUrl.toLowerCase().includes('.pdf') || 
                              mvrPreviewUrl.toLowerCase().includes('application/pdf');
                const isImage = /\.(jpg|jpeg|png|gif|webp)/i.test(mvrPreviewUrl);
                
                if (isImage) {
                  return (
                    <div className="p-4 flex items-center justify-center bg-muted/30">
                      <img
                        src={mvrPreviewUrl}
                        alt="Motor Vehicle Record"
                        className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                      />
                    </div>
                  );
                }
                
                // For PDFs, use Google Docs viewer
                const googleDocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(mvrPreviewUrl)}&embedded=true`;
                return (
                  <iframe
                    src={googleDocsUrl}
                    className="w-full h-[70vh] border-0"
                    title="MVR Preview"
                  />
                );
              })()
            ) : (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                No document available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
