import { ShieldAlert } from "lucide-react";

export function NoRoleAssignedBanner() {
  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center px-6">
      <div className="max-w-xl w-full text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">No role assigned</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please contact your administrator to assign a role to you. You are currently not assigned any roles.
        </p>
      </div>
    </div>
  );
}
