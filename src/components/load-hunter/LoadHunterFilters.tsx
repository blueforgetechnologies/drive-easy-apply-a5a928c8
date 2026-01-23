import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RefreshCw, Volume2, VolumeX, MoreVertical, Gauge, Menu } from "lucide-react";
import type { ActiveFilter, ActiveMode, EmailTimeWindow, LoadHunterTheme } from "@/types/loadHunter";

interface LoadHunterFiltersProps {
  // Mode & Filter
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  activeFilter: ActiveFilter;
  setActiveFilter: (filter: ActiveFilter) => void;
  
  // Counts
  unreviewedCount: number;
  skippedCount: number;
  bidCount: number;
  bookedCount: number;
  missedCount: number;
  expiredCount: number;
  waitlistCount: number;
  undecidedCount: number;
  
  // Search
  matchSearchQuery: string;
  setMatchSearchQuery: (query: string) => void;
  
  // Time window
  emailTimeWindow: EmailTimeWindow;
  setEmailTimeWindow: (window: EmailTimeWindow) => void;
  
  // Sources
  selectedSources: string[];
  setSelectedSources: (sources: string[]) => void;
  
  // Sound
  isSoundMuted: boolean;
  onToggleSound: () => void;
  onOpenSoundSettings: () => void;
  
  // Theme & grouping
  loadHunterTheme: LoadHunterTheme;
  setLoadHunterTheme: (theme: LoadHunterTheme) => void;
  groupMatchesEnabled: boolean;
  setGroupMatchesEnabled: (enabled: boolean) => void;
  
  // Refresh
  refreshing: boolean;
  onRefresh: () => void;
  
  // Dispatcher
  onOpenDispatcherScorecard?: () => void;
  currentDispatcherInfo?: { first_name: string; last_name: string } | null;
}

export function LoadHunterFilters({
  activeMode,
  setActiveMode,
  activeFilter,
  setActiveFilter,
  unreviewedCount,
  skippedCount,
  bidCount,
  bookedCount,
  missedCount,
  expiredCount,
  waitlistCount,
  undecidedCount,
  matchSearchQuery,
  setMatchSearchQuery,
  emailTimeWindow,
  setEmailTimeWindow,
  selectedSources,
  setSelectedSources,
  isSoundMuted,
  onToggleSound,
  onOpenSoundSettings,
  loadHunterTheme,
  setLoadHunterTheme,
  groupMatchesEnabled,
  setGroupMatchesEnabled,
  refreshing,
  onRefresh,
  onOpenDispatcherScorecard,
  currentDispatcherInfo,
}: LoadHunterFiltersProps) {
  const toggleSource = (source: string) => {
    if (selectedSources.includes(source)) {
      setSelectedSources(selectedSources.filter(s => s !== source));
    } else {
      setSelectedSources([...selectedSources, source]);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      {/* Left side: Mode toggle and filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Dispatcher Scorecard Button */}
        {currentDispatcherInfo && onOpenDispatcherScorecard && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onOpenDispatcherScorecard}
          >
            <Gauge className="h-4 w-4" />
            <span className="hidden sm:inline">Scorecard</span>
          </Button>
        )}

        {/* Mode Toggle */}
        <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as ActiveMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="dispatch" className="text-xs px-3 h-7">
              My Trucks
            </TabsTrigger>
            <TabsTrigger value="admin" className="text-xs px-3 h-7">
              All Trucks
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter Tabs */}
        <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as ActiveFilter)}>
          <TabsList className="h-8">
            <TabsTrigger value="unreviewed" className="text-xs px-2 h-7 gap-1">
              Unreviewed
              {unreviewedCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {unreviewedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="skipped" className="text-xs px-2 h-7 gap-1">
              Skipped
              {skippedCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {skippedCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Bids + Booked merged group */}
        <div className="flex rounded-full overflow-hidden border">
          <Button
            variant={activeFilter === 'mybids' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 rounded-none rounded-l-full text-xs px-3 gap-1"
            onClick={() => setActiveFilter('mybids')}
          >
            Bids
            {bidCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {bidCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={activeFilter === 'booked' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 rounded-none rounded-r-full text-xs px-3 gap-1 border-l"
            onClick={() => setActiveFilter('booked')}
          >
            Booked
            {bookedCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {bookedCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Source Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              Source
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {selectedSources.length}
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => toggleSource('sylectus')}>
              <span className={selectedSources.includes('sylectus') ? 'font-bold' : ''}>
                {selectedSources.includes('sylectus') ? '✓ ' : ''}Sylectus
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toggleSource('fullcircle')}>
              <span className={selectedSources.includes('fullcircle') ? 'font-bold' : ''}>
                {selectedSources.includes('fullcircle') ? '✓ ' : ''}FullCircle
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setActiveFilter('missed')}>
              Missed {missedCount > 0 && `(${missedCount})`}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveFilter('expired')}>
              Expired {expiredCount > 0 && `(${expiredCount})`}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveFilter('waitlist')}>
              Waitlist {waitlistCount > 0 && `(${waitlistCount})`}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveFilter('undecided')}>
              Undecided {undecidedCount > 0 && `(${undecidedCount})`}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveFilter('all')}>
              All Emails
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveFilter('issues')}>
              Issues
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setGroupMatchesEnabled(!groupMatchesEnabled)}
            >
              {groupMatchesEnabled ? '✓ ' : ''}Group Matches
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setLoadHunterTheme(loadHunterTheme === 'classic' ? 'aurora' : 'classic')}
            >
              Theme: {loadHunterTheme === 'classic' ? 'Classic' : 'Aurora'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right side: Search, time window, sound, refresh */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <Input
          placeholder="Search..."
          value={matchSearchQuery}
          onChange={(e) => setMatchSearchQuery(e.target.value)}
          className="h-8 w-40"
        />

        {/* Time Window */}
        <Select value={emailTimeWindow} onValueChange={(v) => setEmailTimeWindow(v as EmailTimeWindow)}>
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30m">30 min</SelectItem>
            <SelectItem value="6h">6 hours</SelectItem>
            <SelectItem value="24h">24 hours</SelectItem>
            <SelectItem value="session">Session</SelectItem>
          </SelectContent>
        </Select>

        {/* Sound Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onToggleSound}
        >
          {isSoundMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        {/* Sound Settings */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onOpenSoundSettings}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  );
}
