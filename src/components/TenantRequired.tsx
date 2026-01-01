import { useTenantContext } from "@/contexts/TenantContext";
import { Building2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface TenantRequiredProps {
  children: React.ReactNode;
}

export function TenantRequired({ children }: TenantRequiredProps) {
  const { currentTenant, memberships, loading, switchTenant } = useTenantContext();

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // No tenant selected - show blocking UI
  if (!currentTenant) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-amber-500" />
            </div>
            <CardTitle>Select an Organization</CardTitle>
            <CardDescription>
              Choose an organization to continue. Your data access is scoped to the selected organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {memberships.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm">
                  You don't have access to any organizations yet.
                </p>
                <p className="text-muted-foreground text-sm mt-2">
                  Please contact an administrator to get access.
                </p>
              </div>
            ) : (
              memberships.map((membership) => (
                <Button
                  key={membership.tenant.id}
                  variant="outline"
                  className="w-full h-auto py-4 px-4 justify-start gap-3"
                  onClick={() => switchTenant(membership.tenant.id)}
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">{membership.tenant.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="capitalize">{membership.role}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {membership.tenant.release_channel}
                      </Badge>
                    </div>
                  </div>
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tenant selected - render children
  return <>{children}</>;
}
