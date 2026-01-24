import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

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

export function EmergencyContact({ data, onNext, onBack, isFirstStep }: EmergencyContactProps) {
  const [contacts, setContacts] = useState<EmergencyContactData[]>(
    data.emergencyContacts || [
      { firstName: '', lastName: '', phone: '', address: '', relationship: '' },
      { firstName: '', lastName: '', phone: '', address: '', relationship: '' }
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Emergency Contacts</h2>
        <p className="text-muted-foreground">
          Please provide at least one emergency contact who can be reached in case of an emergency.
          <span className="text-destructive font-medium"> (At least 1 required)</span>
        </p>
      </div>

      {contacts.map((contact: EmergencyContactData, index: number) => (
        <Card key={index} className={index === 0 ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle>
              Emergency Contact {index + 1}
              {index === 0 && <span className="text-destructive ml-1">*</span>}
            </CardTitle>
            <CardDescription>
              {index === 0 ? "Primary emergency contact (required)" : "Secondary emergency contact (optional)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`emergency-first-name-${index}`}>
                  First Name {index === 0 && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={`emergency-first-name-${index}`}
                  value={contact.firstName}
                  onChange={(e) => updateContact(index, 'firstName', e.target.value)}
                  placeholder="Enter first name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`emergency-last-name-${index}`}>
                  Last Name {index === 0 && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={`emergency-last-name-${index}`}
                  value={contact.lastName}
                  onChange={(e) => updateContact(index, 'lastName', e.target.value)}
                  placeholder="Enter last name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`emergency-phone-${index}`}>
                  Phone Number {index === 0 && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={`emergency-phone-${index}`}
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => updateContact(index, 'phone', e.target.value)}
                  placeholder="(555) 555-5555"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`emergency-relationship-${index}`}>
                  Relationship {index === 0 && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={`emergency-relationship-${index}`}
                  value={contact.relationship}
                  onChange={(e) => updateContact(index, 'relationship', e.target.value)}
                  placeholder="e.g., Spouse, Parent, Sibling"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`emergency-address-${index}`}>
                  Address {index === 0 && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={`emergency-address-${index}`}
                  value={contact.address}
                  onChange={(e) => updateContact(index, 'address', e.target.value)}
                  placeholder="Full address"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isFirstStep}
        >
          Previous
        </Button>
        <Button type="button" onClick={handleNext}>
          Next
        </Button>
      </div>
    </div>
  );
}