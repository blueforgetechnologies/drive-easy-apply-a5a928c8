import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ChevronDown, ChevronUp, Circle, X } from "lucide-react";
import { startOfDay, subHours } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

interface UserPresence {
  id: string;
  email: string;
  fullName: string;
  lastActivity: Date;
  isOnline: boolean;
}

interface UserStats {
  unreviewed: number;
  skipped: number;
  missed: number;
  bids: number;
}

interface UserWithStats extends UserPresence {
  stats: UserStats;
}

export function UserActivityTracker() {
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [presenceActivityMap, setPresenceActivityMap] = useState<Map<string, Date>>(new Map());

  // Track current user's presence
  const trackPresence = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setCurrentUserId(user.id);

    const channel = supabase.channel('load_hunter_presence', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set(Object.keys(state));
        setOnlineUserIds(onlineIds);
        
        // Extract last activity from presence data
        const activityMap = new Map<string, Date>();
        Object.entries(state).forEach(([userId, presences]) => {
          const presence = presences[0] as any;
          if (presence?.lastActivity) {
            activityMap.set(userId, new Date(presence.lastActivity));
          }
        });
        setPresenceActivityMap(activityMap);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single();

          await channel.track({
            id: user.id,
            email: profile?.email || user.email,
            fullName: profile?.full_name || 'Unknown',
            lastActivity: new Date().toISOString(),
          });
        }
      });

    // Update activity on user actions
    const updateActivity = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
        
      await channel.track({
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || 'Unknown',
        lastActivity: new Date().toISOString(),
      });
    };

    // Track activity events
    window.addEventListener('click', updateActivity);
    window.addEventListener('keydown', updateActivity);

    return () => {
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      supabase.removeChannel(channel);
    };
  }, []);

  // Load users who logged in today
  const loadTodayUsers = useCallback(async () => {
    try {
      // Get start of today UTC (subtract hours based on potential timezone offset to be safe)
      const now = new Date();
      const todayStartLocal = startOfDay(now);
      // Use 24 hours ago as fallback to ensure we capture all users who logged in today regardless of timezone
      const cutoffTime = subHours(todayStartLocal, 6).toISOString();
      
      // Get users who logged in recently with their most recent login
      const { data: loginHistory, error: loginError } = await supabase
        .from('login_history')
        .select('user_id, logged_in_at')
        .gte('logged_in_at', cutoffTime)
        .order('logged_in_at', { ascending: false });

      if (loginError) {
        console.error('Error fetching login history:', loginError);
        setLoading(false);
        return;
      }

      // Also include any currently online users from presence
      const onlineUserIdsArray = Array.from(onlineUserIds);
      
      if ((!loginHistory || loginHistory.length === 0) && onlineUserIdsArray.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs with their most recent login time
      const userLoginMap = new Map<string, Date>();
      (loginHistory || []).forEach(entry => {
        if (!userLoginMap.has(entry.user_id)) {
          userLoginMap.set(entry.user_id, new Date(entry.logged_in_at));
        }
      });

      // Add online users who might not have login history yet
      onlineUserIdsArray.forEach(userId => {
        if (!userLoginMap.has(userId)) {
          userLoginMap.set(userId, new Date());
        }
      });

      const userIds = Array.from(userLoginMap.keys());
      
      if (userIds.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Get profiles for these users
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      if (!profiles || profiles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Get stats for each user
      const usersWithStats: UserWithStats[] = await Promise.all(
        profiles.map(async (profile) => {
          try {
            const isOnline = onlineUserIds.has(profile.id);
            
            // Use presence activity if online, otherwise use last login time
            const lastLoginTime = userLoginMap.get(profile.id) || new Date();
            const presenceActivity = presenceActivityMap.get(profile.id);
            const lastActivity = isOnline && presenceActivity ? presenceActivity : lastLoginTime;
            
            // Get user stats from dispatchers (match by email)
            const { data: dispatcher } = await supabase
              .from('dispatchers')
              .select('id')
              .ilike('email', profile.email)
              .maybeSingle();

            let stats: UserStats = { unreviewed: 0, skipped: 0, missed: 0, bids: 0 };

            if (dispatcher) {
              // Get vehicles assigned to this dispatcher
              const { data: assignedVehicles } = await supabase
                .from('vehicles')
                .select('id')
                .eq('primary_dispatcher_id', dispatcher.id);

              const vehicleIds = assignedVehicles?.map(v => v.id) || [];

              if (vehicleIds.length > 0) {
                // Count unreviewed matches for this dispatcher's vehicles
                const { count: unreviewedCount } = await supabase
                  .from('load_hunt_matches')
                  .select('*', { count: 'exact', head: true })
                  .in('vehicle_id', vehicleIds)
                  .eq('match_status', 'active')
                  .eq('is_active', true);

                // Count skipped matches
                const { count: skippedCount } = await supabase
                  .from('load_hunt_matches')
                  .select('*', { count: 'exact', head: true })
                  .in('vehicle_id', vehicleIds)
                  .eq('match_status', 'skipped');

                // Count bid matches
                const { count: bidCount } = await supabase
                  .from('load_hunt_matches')
                  .select('*', { count: 'exact', head: true })
                  .in('vehicle_id', vehicleIds)
                  .eq('match_status', 'bid');

                // Count missed loads from missed_loads_history table - same source as Missed filter
                // Query by vehicle_id since dispatcher_id may not be populated
                const { count: missedCount } = await supabase
                  .from('missed_loads_history')
                  .select('*', { count: 'exact', head: true })
                  .in('vehicle_id', vehicleIds);

                stats = {
                  unreviewed: unreviewedCount || 0,
                  skipped: skippedCount || 0,
                  missed: missedCount || 0,
                  bids: bidCount || 0,
                };
              }
            }

            return {
              id: profile.id,
              email: profile.email,
              fullName: profile.full_name || profile.email.split('@')[0],
              lastActivity,
              isOnline,
              stats,
            };
          } catch (err) {
            console.error('Error loading user stats:', err);
            return {
              id: profile.id,
              email: profile.email,
              fullName: profile.full_name || profile.email.split('@')[0],
              lastActivity: userLoginMap.get(profile.id) || new Date(),
              isOnline: onlineUserIds.has(profile.id),
              stats: { unreviewed: 0, skipped: 0, missed: 0, bids: 0 },
            };
          }
        })
      );

      // Sort: online users first, then by last activity
      usersWithStats.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return b.lastActivity.getTime() - a.lastActivity.getTime();
      });

      setUsers(usersWithStats);
    } catch (err) {
      console.error('Error loading today users:', err);
    } finally {
      setLoading(false);
    }
  }, [onlineUserIds, presenceActivityMap]);

  // Load initial data and set up presence
  useEffect(() => {
    trackPresence();
  }, [trackPresence]);

  // Reload users on mount and when tab becomes visible (visibility-based refresh)
  useEffect(() => {
    loadTodayUsers();
    
    // Visibility-based refresh: reload when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[UserActivityTracker] Tab visible - refreshing user list');
        loadTodayUsers();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadTodayUsers]);

  const formatLastActivity = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const onlineCount = users.filter(u => u.isOnline).length;

  // MOBILE: Full-screen sheet when expanded, small FAB when collapsed
  if (isMobile) {
    return (
      <>
        {/* Floating Action Button */}
        {!isExpanded && (
          <Button
            onClick={() => setIsExpanded(true)}
            className="fixed bottom-20 right-4 z-50 h-12 w-12 rounded-full shadow-lg bg-primary"
          >
            <Users className="h-5 w-5" />
            {onlineCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {onlineCount}
              </Badge>
            )}
          </Button>
        )}

        {/* Full Screen Sheet */}
        {isExpanded && (
          <div className="fixed inset-0 z-50 bg-background animate-in slide-in-from-bottom">
            <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-semibold">Team Activity</span>
                <Badge variant="secondary">{onlineCount} online</Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <ScrollArea className="h-[calc(100vh-60px)]">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading team activity...
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No team members logged in today
                </div>
              ) : (
                <div className="divide-y">
                  {users.map((user) => (
                    <div 
                      key={user.id} 
                      className={`p-4 ${user.id === currentUserId ? 'bg-primary/5' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Circle 
                            className={`h-3 w-3 ${
                              user.isOnline ? 'fill-green-500 text-green-500' : 'fill-muted text-muted'
                            }`} 
                          />
                          <span className="font-medium">
                            {user.fullName}
                            {user.id === currentUserId && (
                              <span className="text-xs text-muted-foreground ml-1">(you)</span>
                            )}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {user.isOnline ? 'Active' : formatLastActivity(user.lastActivity)}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30"
                        >
                          {user.stats.unreviewed} unreviewed
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                        >
                          {user.stats.skipped} skipped
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-red-500/10 text-red-600 border-red-500/30"
                        >
                          {user.stats.missed} missed
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30"
                        >
                          {user.stats.bids} bids
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </>
    );
  }

  // DESKTOP: FAB style like mobile
  return (
    <>
      {/* Floating Action Button when collapsed */}
      {!isExpanded && (
        <Button
          onClick={() => setIsExpanded(true)}
          className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full shadow-lg bg-primary"
        >
          <Users className="h-4 w-4" />
          {onlineCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]">
              {onlineCount}
            </Badge>
          )}
        </Button>
      )}

      {/* Expanded card */}
      {isExpanded && (
        <Card className="fixed bottom-4 right-4 w-72 z-50 shadow-lg border-border/50 bg-card/95 backdrop-blur-sm">
          <CardHeader 
            className="py-1.5 px-2 cursor-pointer flex flex-row items-center justify-between"
            onClick={() => setIsExpanded(false)}
          >
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              <CardTitle className="text-xs font-medium">Team Activity</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {onlineCount} online
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <ChevronDown className="h-3 w-3" />
            </Button>
          </CardHeader>
          
          <CardContent className="p-0">
            <ScrollArea className="h-48">
              {loading ? (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  Loading...
                </div>
              ) : users.length === 0 ? (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  No team members logged in today
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {users.map((user) => (
                    <div 
                      key={user.id} 
                      className={`px-2 py-1.5 hover:bg-muted/50 transition-colors ${
                        user.id === currentUserId ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Circle 
                            className={`h-1.5 w-1.5 ${
                              user.isOnline ? 'fill-green-500 text-green-500' : 'fill-muted text-muted'
                            }`} 
                          />
                          <span className="text-xs font-medium truncate max-w-[100px]">
                            {user.fullName}
                            {user.id === currentUserId && (
                              <span className="text-[10px] text-muted-foreground ml-0.5">(you)</span>
                            )}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {user.isOnline ? 'Active' : formatLastActivity(user.lastActivity)}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge 
                          variant="outline" 
                          className="text-[11px] px-1.5 py-0 h-5 bg-blue-500/10 text-blue-600 border-blue-500/30"
                        >
                          {user.stats.unreviewed} unrev
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-[11px] px-1.5 py-0 h-5 bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                        >
                          {user.stats.skipped} skip
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-[11px] px-1.5 py-0 h-5 bg-red-500/10 text-red-600 border-red-500/30"
                        >
                          {user.stats.missed} miss
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-[11px] px-1.5 py-0 h-5 bg-blue-500/10 text-blue-600 border-blue-500/30"
                        >
                          {user.stats.bids} bids
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </>
  );
}
