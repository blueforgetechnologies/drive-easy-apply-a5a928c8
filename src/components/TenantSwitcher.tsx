import { Building2, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenantContext } from '@/hooks/useTenantContext';

export function TenantSwitcher() {
  const { currentTenant, memberships, loading, isPlatformAdmin, switchTenant, getCurrentRole } = useTenantContext();

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-2">
        <Building2 className="h-4 w-4" />
        <span className="text-sm">Loading...</span>
      </Button>
    );
  }

  if (memberships.length === 0) {
    return null;
  }

  // Don't show switcher if only one tenant and not platform admin
  if (memberships.length === 1 && !isPlatformAdmin) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{currentTenant?.name}</span>
        <Badge variant="secondary" className="text-xs">
          {getCurrentRole()}
        </Badge>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 max-w-[200px]">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm">{currentTenant?.name || 'Select Tenant'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.tenant.id}
            onClick={() => switchTenant(membership.tenant.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{membership.tenant.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {membership.role}
              </Badge>
              {currentTenant?.id === membership.tenant.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        {isPlatformAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              Platform Admin Access
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
