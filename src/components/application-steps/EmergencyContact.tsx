import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface EmergencyContactProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function EmergencyContact({ data, onNext, onBack, isFirstStep }: EmergencyContactProps) {
  const [contacts, setContacts] = useState(
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

  const handleNext = () => {
    onNext({ emergencyContacts: contacts });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Emergency Contacts</h2>
        <p className="text-muted-foreground">
          Please provide two emergency contacts who can be reached in case of an emergency.
        </p>
      </div>

      {contacts.map((contact: any, index: number) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle>Emergency Contact {index + 1}</CardTitle>
            <CardDescription>
              {index === 0 ? "Primary" : "Secondary"} emergency contact information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`emergency-first-name-${index}`}>
                  First Name <span className="text-destructive">*</span>
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
                  Last Name <span className="text-destructive">*</span>
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
                  Phone Number <span className="text-destructive">*</span>
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
                  Relationship <span className="text-destructive">*</span>
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
                  Address <span className="text-destructive">*</span>
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