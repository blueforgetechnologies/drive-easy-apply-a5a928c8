import { useState, useEffect } from 'react';
import { Building2, Search, Shield, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  release_channel: string;
}

interface ImpersonateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImpersonateTenantDialog({ open, onOpenChange }: ImpersonateTenantDialogProps) {
  const { startImpersonation, loading } = useImpersonation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('30');

  useEffect(() => {
    if (open) {
      loadTenants();
    }
  }, [open]);

  async function loadTenants() {
    setLoadingTenants(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, status, release_channel')
        .order('name');

      if (error) throw error;
      setTenants(data || []);
    } catch (err) {
      console.error('Error loading tenants:', err);
      toast.error('Failed to load tenants');
    } finally {
      setLoadingTenants(false);
    }
  }

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  async function handleStart() {
    if (!selectedTenantId) {
      toast.error('Please select a tenant');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }

    const success = await startImpersonation(selectedTenantId, reason, parseInt(duration));
    if (success) {
      onOpenChange(false);
      // Reset form
      setSelectedTenantId(null);
      setReason('');
      setDuration('30');
      setSearchQuery('');
    }
  }

  function getChannelBadge(channel: string) {
    switch (channel) {
      case 'internal':
        return <Badge className="bg-red-600 text-xs">Internal</Badge>;
      case 'pilot':
        return <Badge className="bg-amber-500 text-black text-xs">Pilot</Badge>;
      case 'general':
        return <Badge variant="outline" className="border-green-500 text-green-600 text-xs">General</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{channel}</Badge>;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>;
      case 'suspended':
        return <Badge variant="destructive" className="text-xs">Suspended</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Admin: Impersonate Tenant
          </DialogTitle>
          <DialogDescription>
            Start a temporary impersonation session to view and troubleshoot a tenant's data.
            All actions are audited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tenant Search/Select */}
          <div className="space-y-2">
            <Label>Select Tenant</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[150px] border rounded-md">
              {loadingTenants ? (
                <div className="p-4 text-center text-muted-foreground">Loading tenants...</div>
              ) : filteredTenants.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No tenants found</div>
              ) : (
                <div className="p-1">
                  {filteredTenants.map((tenant) => (
                    <button
                      key={tenant.id}
                      onClick={() => setSelectedTenantId(tenant.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-md text-left transition-colors ${
                        selectedTenantId === tenant.id
                          ? 'bg-primary/10 border border-primary/50'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {getChannelBadge(tenant.release_channel)}
                        {getStatusBadge(tenant.status)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (required)</Label>
            <Textarea
              id="reason"
              placeholder="Describe why you need to impersonate this tenant (min 10 characters)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/10 characters minimum
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Session Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">60 minutes (max)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">Impersonation is audited</p>
              <p className="text-xs mt-0.5 opacity-80">
                All impersonation sessions are logged with your identity, the target tenant, 
                reason, and duration. Do not use impersonation for routine operations.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleStart} 
            disabled={loading || !selectedTenantId || reason.trim().length < 10}
          >
            {loading ? (
              <>Starting...</>
            ) : (
              <>
                <Clock className="h-4 w-4 mr-1" />
                Start {duration}min Session
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
