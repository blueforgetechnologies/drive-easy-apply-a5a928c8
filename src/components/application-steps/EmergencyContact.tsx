import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserPlus, Phone, MapPin, Heart, Users } from "lucide-react";

interface EmergencyContactProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
}

interface EmergencyContactData {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  relationship: string;
}

const emptyContact: EmergencyContactData = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  relationship: ''
};

export function EmergencyContact({ data, onNext, onBack, isFirstStep, isPreviewMode = false }: EmergencyContactProps) {
  // Check if Test Mode is enabled (set via Applications Manager toggle)
  const isTestMode = isPreviewMode || (typeof window !== 'undefined' && localStorage.getItem("app_test_mode") === "true");

  const [contacts, setContacts] = useState<EmergencyContactData[]>(
    data.emergencyContacts?.length >= 2 
      ? data.emergencyContacts 
      : [
          data.emergencyContacts?.[0] || { ...emptyContact },
          data.emergencyContacts?.[1] || { ...emptyContact }
        ]
  );
  
  // Track if this is the initial mount to prevent overwriting user-entered data
  const hasInitialized = useRef(false);
  
  // Sync form data with prop changes ONLY on initial mount
  useEffect(() => {
    if (data?.emergencyContacts?.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      setContacts(data.emergencyContacts.length >= 2 
        ? data.emergencyContacts 
        : [data.emergencyContacts[0] || { ...emptyContact }, data.emergencyContacts[1] || { ...emptyContact }]
      );
    }
  }, [data?.emergencyContacts]);

  const updateContact = (index: number, field: string, value: string) => {
    const updatedContacts = [...contacts];
    updatedContacts[index] = { ...updatedContacts[index], [field]: value };
    setContacts(updatedContacts);
  };

  const isContactComplete = (contact: EmergencyContactData): boolean => {
    return !!(
      contact.firstName.trim() &&
      contact.lastName.trim() &&
      contact.phone.trim() &&
      contact.address.trim() &&
      contact.relationship.trim()
    );
  };

  const handleNext = () => {
    // Skip validation in Test Mode
    if (!isTestMode) {
      const hasCompleteContact = contacts.some(isContactComplete);
      
      if (!hasCompleteContact) {
        toast.error("At least one emergency contact is required", {
          description: "Please fill in all fields for at least one emergency contact.",
        });
        return;
      }
    }
    
    onNext({ emergencyContacts: contacts });
  };

  const contactLabels = [
    { title: "Primary Emergency Contact", description: "Required - This person will be contacted first in an emergency", required: true },
    { title: "Secondary Emergency Contact", description: "Optional - Backup contact if primary cannot be reached", required: false }
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="section-scifi">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-scifi-purple/30 to-scifi-cyan/20 border border-scifi-purple/30">
            <Users className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-scifi-text">Emergency Contacts</h2>
            <p className="text-sm text-scifi-text-muted">
              Please provide at least one emergency contact who can be reached in case of an emergency.
              <span className="text-scifi-cyan font-medium ml-1">(Minimum 1 required)</span>
            </p>
          </div>
        </div>
      </div>

      {/* Contact Cards */}
      {contacts.map((contact: EmergencyContactData, index: number) => (
        <div 
          key={index} 
          className={`section-scifi ${
            index === 0 
              ? "border-scifi-purple/40 shadow-[0_0_20px_hsl(var(--scifi-purple)/0.15)]" 
              : "border-scifi-border/50"
          }`}
        >
          {/* Card Header */}
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-scifi-border/50">
            <div className={`p-2 rounded-lg ${index === 0 ? 'bg-scifi-purple/20' : 'bg-scifi-cyan/10'}`}>
              <Heart className={`h-4 w-4 ${index === 0 ? 'text-scifi-purple' : 'text-scifi-cyan'}`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-scifi-text flex items-center gap-1">
                {contactLabels[index].title}
                {contactLabels[index].required && <span className="text-scifi-cyan">*</span>}
              </h3>
              <p className="text-xs text-scifi-text-muted">
                {contactLabels[index].description}
              </p>
            </div>
          </div>

          {/* Name Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor={`emergency-first-name-${index}`} className="text-sm text-scifi-text-muted flex items-center gap-1.5">
                First Name {contactLabels[index].required && <span className="text-scifi-cyan">*</span>}
              </Label>
              <Input
                id={`emergency-first-name-${index}`}
                value={contact.firstName}
                onChange={(e) => updateContact(index, 'firstName', e.target.value)}
                placeholder="Enter first name"
                className="input-scifi"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`emergency-last-name-${index}`} className="text-sm text-scifi-text-muted flex items-center gap-1.5">
                Last Name {contactLabels[index].required && <span className="text-scifi-cyan">*</span>}
              </Label>
              <Input
                id={`emergency-last-name-${index}`}
                value={contact.lastName}
                onChange={(e) => updateContact(index, 'lastName', e.target.value)}
                placeholder="Enter last name"
                className="input-scifi"
              />
            </div>
          </div>

          {/* Phone & Relationship Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor={`emergency-phone-${index}`} className="text-sm text-scifi-text-muted flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-scifi-cyan" />
                Phone Number {contactLabels[index].required && <span className="text-scifi-cyan">*</span>}
              </Label>
              <Input
                id={`emergency-phone-${index}`}
                type="tel"
                value={contact.phone}
                onChange={(e) => updateContact(index, 'phone', e.target.value)}
                placeholder="(555) 555-5555"
                className="input-scifi"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`emergency-relationship-${index}`} className="text-sm text-scifi-text-muted flex items-center gap-1.5">
                Relationship {contactLabels[index].required && <span className="text-scifi-cyan">*</span>}
              </Label>
              <Input
                id={`emergency-relationship-${index}`}
                value={contact.relationship}
                onChange={(e) => updateContact(index, 'relationship', e.target.value)}
                placeholder="e.g., Spouse, Parent, Sibling"
                className="input-scifi"
              />
            </div>
          </div>

          {/* Address Row */}
          <div className="space-y-1.5">
            <Label htmlFor={`emergency-address-${index}`} className="text-sm text-scifi-text-muted flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-scifi-cyan" />
              Address {contactLabels[index].required && <span className="text-scifi-cyan">*</span>}
            </Label>
            <Input
              id={`emergency-address-${index}`}
              value={contact.address}
              onChange={(e) => updateContact(index, 'address', e.target.value)}
              placeholder="Full address"
              className="input-scifi"
            />
          </div>
        </div>
      ))}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isFirstStep}
          className="btn-scifi-outline"
        >
          Previous
        </Button>
        <Button type="button" onClick={handleNext} className="btn-scifi">
          Next
        </Button>
      </div>
    </div>
  );
}
