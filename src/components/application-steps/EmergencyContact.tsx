import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { UserPlus, Phone, MapPin, Heart } from "lucide-react";

interface EmergencyContactProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
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

export function EmergencyContact({ data, onNext, onBack, isFirstStep }: EmergencyContactProps) {
  const [contacts, setContacts] = useState<EmergencyContactData[]>(
    data.emergencyContacts?.length >= 2 
      ? data.emergencyContacts 
      : [
          data.emergencyContacts?.[0] || { ...emptyContact },
          data.emergencyContacts?.[1] || { ...emptyContact }
        ]
  );

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
    // Check if at least one emergency contact is fully filled out
    const hasCompleteContact = contacts.some(isContactComplete);
    
    if (!hasCompleteContact) {
      toast.error("At least one emergency contact is required", {
        description: "Please fill in all fields for at least one emergency contact.",
      });
      return;
    }
    
    onNext({ emergencyContacts: contacts });
  };

  const contactLabels = [
    { title: "Primary Emergency Contact", description: "Required - This person will be contacted first in an emergency" },
    { title: "Secondary Emergency Contact", description: "Optional - Backup contact if primary cannot be reached" }
  ];

  return (
    <div className="space-y-6">
      <div className="section-scifi p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <UserPlus className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Emergency Contacts</h2>
            <p className="text-sm text-muted-foreground">
              Please provide at least one emergency contact who can be reached in case of an emergency.
              <span className="text-scifi-cyan font-medium ml-1">(Minimum 1 required)</span>
            </p>
          </div>
        </div>
      </div>

      {contacts.map((contact: EmergencyContactData, index: number) => (
        <Card 
          key={index} 
          className={`section-scifi overflow-hidden ${
            index === 0 
              ? "border-scifi-purple/50 shadow-[0_0_15px_hsl(var(--scifi-purple)/0.15)]" 
              : "border-scifi-border"
          }`}
        >
          <CardHeader className="pb-3 border-b border-scifi-border/50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${index === 0 ? 'bg-scifi-purple/20' : 'bg-scifi-cyan/20'}`}>
                <Heart className={`h-4 w-4 ${index === 0 ? 'text-scifi-purple' : 'text-scifi-cyan'}`} />
              </div>
              <div>
                <CardTitle className="text-lg text-white">
                  {contactLabels[index].title}
                  {index === 0 && <span className="text-scifi-cyan ml-1">*</span>}
                </CardTitle>
                <CardDescription className="text-muted-foreground text-sm">
                  {contactLabels[index].description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {/* Name Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`emergency-first-name-${index}`} className="text-sm text-muted-foreground flex items-center gap-1.5">
                  First Name {index === 0 && <span className="text-scifi-cyan">*</span>}
                </Label>
                <Input
                  id={`emergency-first-name-${index}`}
                  value={contact.firstName}
                  onChange={(e) => updateContact(index, 'firstName', e.target.value)}
                  placeholder="Enter first name"
                  className="input-scifi h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`emergency-last-name-${index}`} className="text-sm text-muted-foreground flex items-center gap-1.5">
                  Last Name {index === 0 && <span className="text-scifi-cyan">*</span>}
                </Label>
                <Input
                  id={`emergency-last-name-${index}`}
                  value={contact.lastName}
                  onChange={(e) => updateContact(index, 'lastName', e.target.value)}
                  placeholder="Enter last name"
                  className="input-scifi h-10"
                />
              </div>
            </div>

            {/* Phone & Relationship Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`emergency-phone-${index}`} className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Phone Number {index === 0 && <span className="text-scifi-cyan">*</span>}
                </Label>
                <Input
                  id={`emergency-phone-${index}`}
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => updateContact(index, 'phone', e.target.value)}
                  placeholder="(555) 555-5555"
                  className="input-scifi h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`emergency-relationship-${index}`} className="text-sm text-muted-foreground flex items-center gap-1.5">
                  Relationship {index === 0 && <span className="text-scifi-cyan">*</span>}
                </Label>
                <Input
                  id={`emergency-relationship-${index}`}
                  value={contact.relationship}
                  onChange={(e) => updateContact(index, 'relationship', e.target.value)}
                  placeholder="e.g., Spouse, Parent, Sibling"
                  className="input-scifi h-10"
                />
              </div>
            </div>

            {/* Address Row */}
            <div className="space-y-1.5">
              <Label htmlFor={`emergency-address-${index}`} className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Address {index === 0 && <span className="text-scifi-cyan">*</span>}
              </Label>
              <Input
                id={`emergency-address-${index}`}
                value={contact.address}
                onChange={(e) => updateContact(index, 'address', e.target.value)}
                placeholder="Full address"
                className="input-scifi h-10"
              />
            </div>
          </CardContent>
        </Card>
      ))}

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