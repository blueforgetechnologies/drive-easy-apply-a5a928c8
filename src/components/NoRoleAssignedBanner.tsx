import { AlertTriangle, Shield } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function NoRoleAssignedBanner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <Alert className="max-w-md border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
        <Shield className="h-5 w-5 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          No Role Assigned
        </AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300 mt-2">
          You don't have a role assigned to your account yet. Please contact your administrator to assign you the appropriate permissions.
        </AlertDescription>
      </Alert>
    </div>
  );
}
