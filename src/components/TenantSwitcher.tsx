import { useState, useMemo } from 'react';
import { Building2, ChevronDown, Check, Search, AlertCircle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { useTenantContext, TenantMembership } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Channel display order and colors
const channelOrder: Record<string, number> = {
  internal: 0,
  pilot: 1,
  general: 2,
};

const channelColors: Record<string, string> = {
  internal: 'bg-red-600 text-white',
  pilot: 'bg-amber-500 text-black',
  general: 'bg-green-600/20 text-green-400 border border-green-500/50',
};

const statusColors: Record<string, string> = {
  active: 'text-green-500',
  suspended: 'text-destructive',
  pending: 'text-amber-500',
};

function getChannelBadge(channel: string) {
  const color = channelColors[channel] || 'bg-muted text-muted-foreground';
  return (
    <Badge className={cn('text-[10px] px-1.5 py-0 h-4 uppercase font-semibold', color)}>
      {channel}
    </Badge>
  );
}

export function TenantSwitcher() {
  const { 
    effectiveTenant,
    memberships, 
    loading, 
    isPlatformAdmin, 
    switchTenant, 
    isImpersonating,
  } = useTenantContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);

  // Compute role from memberships using effectiveTenant.id (not currentTenant)
  const displayRole = useMemo(() => {
    if (!effectiveTenant?.id) return null;
    const m = memberships.find(x => x.tenant.id === effectiveTenant.id);
    return m?.role ?? null;
  }, [memberships, effectiveTenant?.id]);

  // Sort memberships by channel order, then by name
  const sortedMemberships = useMemo(() => {
    return [...memberships].sort((a, b) => {
      const aOrder = channelOrder[a.tenant.release_channel] ?? 99;
      const bOrder = channelOrder[b.tenant.release_channel] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.tenant.name.localeCompare(b.tenant.name);
    });
  }, [memberships]);

  // Filter memberships by search query
  const filteredMemberships = useMemo(() => {
    if (!searchQuery.trim()) return sortedMemberships;
    const query = searchQuery.toLowerCase();
    return sortedMemberships.filter(m => 
      m.tenant.name.toLowerCase().includes(query) ||
      m.tenant.slug.toLowerCase().includes(query)
    );
  }, [sortedMemberships, searchQuery]);

  const showSearch = memberships.length > 8;

  const handleSelect = (membership: TenantMembership) => {
    if (isImpersonating) {
      toast.warning('Stop impersonation to switch tenants');
      return;
    }
    
    if (effectiveTenant?.id === membership.tenant.id) {
      setOpen(false);
      return;
    }

    switchTenant(membership.tenant.id);
    toast.success(`Switched to ${membership.tenant.name}`);
    setOpen(false);
    setSearchQuery('');
  };

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-2 text-white/70">
        <Building2 className="h-4 w-4" />
        <span className="text-sm">Loading...</span>
      </Button>
    );
  }

  // Hide dropdown if only one tenant (and not impersonating)
  if (memberships.length <= 1 && !isImpersonating) {
    if (!effectiveTenant) return null;
    
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/10">
        <Building2 className="h-4 w-4 text-white/70" />
        <span className="text-sm font-medium text-white truncate max-w-[120px]">
          {effectiveTenant.name}
        </span>
        {getChannelBadge(effectiveTenant.release_channel)}
      </div>
    );
  }

  const displayTenant = effectiveTenant;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "gap-2 max-w-[220px] text-white hover:bg-white/10 hover:text-white",
            isImpersonating && "border border-amber-500/50 bg-amber-500/10"
          )}
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">
            {displayTenant?.name || 'Select Tenant'}
          </span>
          {displayTenant && getChannelBadge(displayTenant.release_channel)}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Switch Organization</span>
          {isImpersonating && (
            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
              Impersonating
            </Badge>
          )}
        </DropdownMenuLabel>
        
        {isImpersonating && (
          <>
            <div className="px-2 py-1.5 text-xs text-amber-600 bg-amber-500/10 mx-2 rounded flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              Stop impersonation to switch tenants
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        
        {showSearch && (
          <div className="px-2 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
        )}
        
        <DropdownMenuSeparator />
        
        <div className="max-h-[300px] overflow-y-auto">
          {filteredMemberships.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No tenants found
            </div>
          ) : (
            filteredMemberships.map((membership) => {
              const isSelected = effectiveTenant?.id === membership.tenant.id;
              const statusClass = statusColors[membership.tenant.status] || 'text-muted-foreground';
              
              return (
                <DropdownMenuItem
                  key={membership.tenant.id}
                  onClick={() => handleSelect(membership)}
                  disabled={isImpersonating}
                  className={cn(
                    "flex flex-col items-start gap-1 py-2.5 cursor-pointer",
                    isSelected && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium truncate">{membership.tenant.name}</span>
                      {isSelected && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                          Current
                        </Badge>
                      )}
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  
                  <div className="flex items-center gap-2 ml-6 text-xs">
                    <span className="text-muted-foreground">{membership.tenant.slug}</span>
                    <span className="text-muted-foreground">•</span>
                    {getChannelBadge(membership.tenant.release_channel)}
                    {membership.tenant.status !== 'active' && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span className={cn('uppercase text-[10px] font-medium', statusClass)}>
                          {membership.tenant.status}
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground">•</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {membership.role}
                    </Badge>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </div>
        
        {isPlatformAdmin && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
              Platform Admin Access
            </div>
          </>
        )}
        
        <DropdownMenuSeparator />
        <div className="px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
          Tenant context controls what data you see. Server-side RLS still enforces access.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
