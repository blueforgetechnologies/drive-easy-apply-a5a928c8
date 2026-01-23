import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SoundSettingsDialog } from "@/components/SoundSettingsDialog";
import { RefreshCw, Volume2, VolumeX, Settings, Menu, Gauge, Truck } from "lucide-react";
import type { ActiveFilter, ActiveMode, LoadHunterTheme } from "@/types/loadHunter";
import type { SoundSettings } from "@/hooks/useUserPreferences";

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
  allEmailsCount: number;
  
  // Search
  matchSearchQuery: string;
  setMatchSearchQuery: (query: string) => void;
  isSearchingArchive: boolean;
  showArchiveResults: boolean;
  setShowArchiveResults: (show: boolean) => void;
  archivedSearchResults: any[];
  onArchiveResultClick: (result: any) => void;
  
  // Sources
  selectedSources: string[];
  setSelectedSources: (sources: string[]) => void;
  
  // Sound
  isSoundMuted: boolean;
  onToggleSound: () => void;
  onSoundSettingsChange: (settings: SoundSettings) => void;
  
  // Theme & grouping
  loadHunterTheme: LoadHunterTheme;
  setLoadHunterTheme: (theme: LoadHunterTheme) => void;
  groupMatchesEnabled: boolean;
  setGroupMatchesEnabled: (enabled: boolean) => void;
  
  // Refresh
  refreshing: boolean;
  onRefresh: () => void;
  
  // Visibility toggles
  showAllTabEnabled: boolean;
  
  // Filter vehicle state
  filterVehicleId: string | null;
  setFilterVehicleId: (id: string | null) => void;
  setSelectedVehicle: (vehicle: any) => void;
  setSelectedEmailForDetail: (email: any) => void;
  
  // Dispatcher
  onOpenDispatcherScorecard?: () => void;
  currentDispatcherInfo?: { first_name: string; last_name: string } | null;
}

// Base button class - matches LoadsTab style
const btnBase = "h-[30px] px-3 text-[13px] font-medium gap-1.5 border-0 transition-all duration-200";
const iconSize = "h-3.5 w-3.5";

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
  allEmailsCount,
  matchSearchQuery,
  setMatchSearchQuery,
  isSearchingArchive,
  showArchiveResults,
  setShowArchiveResults,
  archivedSearchResults,
  onArchiveResultClick,
  selectedSources,
  setSelectedSources,
  isSoundMuted,
  onToggleSound,
  onSoundSettingsChange,
  loadHunterTheme,
  setLoadHunterTheme,
  groupMatchesEnabled,
  setGroupMatchesEnabled,
  refreshing,
  onRefresh,
  showAllTabEnabled,
  filterVehicleId,
  setFilterVehicleId,
  setSelectedVehicle,
  setSelectedEmailForDetail,
  onOpenDispatcherScorecard,
  currentDispatcherInfo,
}: LoadHunterFiltersProps) {
  const handleFilterChange = (filter: ActiveFilter) => {
    setActiveFilter(filter);
    setFilterVehicleId(null);
    setSelectedVehicle(null);
    setSelectedEmailForDetail(null);
  };

  // For Aurora theme, use purple-tinted versions
  const getAuroraActiveClass = (baseClass: string) => {
    if (loadHunterTheme !== 'aurora') return baseClass;
    // Aurora uses purple-tinted glossy buttons
    return 'btn-glossy-aurora-active';
  };

  const getAuroraInactiveClass = () => {
    if (loadHunterTheme !== 'aurora') return 'btn-glossy';
    return 'btn-glossy-aurora';
  };

  return (
    <div className={`flex items-center gap-0 py-2 px-2 border-y overflow-x-auto flex-shrink-0 relative z-10 ${
      loadHunterTheme === 'aurora'
        ? 'bg-gradient-to-r from-slate-900/95 via-purple-900/50 to-slate-900/95 border-purple-500/30 backdrop-blur-md shadow-[0_4px_20px_-5px_rgba(168,85,247,0.3)]'
        : 'bg-gradient-to-b from-gray-100 to-gray-200 border-gray-300'
    }`}>
      
      {/* Mode Toggle (Admin / My Trucks) - Connected capsule */}
      <div className="flex items-center mr-2">
        <Button
          variant="ghost"
          size="sm"
          className={`${btnBase} rounded-none rounded-l-full ${
            activeMode === 'admin'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-active text-white' : 'btn-glossy-dark text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => setActiveMode('admin')}
        >
          Admin
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${btnBase} rounded-none rounded-r-full ${
            activeMode === 'dispatch'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-active text-white' : 'btn-glossy-primary text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => setActiveMode('dispatch')}
        >
          MY TRUCKS
        </Button>
      </div>

      {/* Search Input - Carved inset style */}
      <div className="flex-shrink-0 relative mr-2">
        <Input
          placeholder="Search match ID..."
          value={matchSearchQuery}
          onChange={(e) => setMatchSearchQuery(e.target.value)}
          onFocus={() => matchSearchQuery && setShowArchiveResults(true)}
          className={`h-[30px] w-32 text-[13px] rounded-full px-3 ${
            loadHunterTheme === 'aurora'
              ? 'bg-slate-900/80 border-purple-600/50 text-purple-100 placeholder:text-purple-400/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(139,92,246,0.2)] focus:border-purple-400/70'
              : 'bg-white border-gray-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.15),inset_0_0_0_1px_rgba(0,0,0,0.05)] focus:border-blue-400'
          }`}
        />
        {isSearchingArchive && (
          <div className="absolute right-4 top-1.5">
            <RefreshCw className={`${iconSize} animate-spin text-muted-foreground`} />
          </div>
        )}
        {showArchiveResults && archivedSearchResults.length > 0 && (
          <div className="absolute top-9 left-0 w-80 bg-white border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
            <div className="px-2 py-1 bg-gray-100 text-[10px] font-semibold text-gray-600 border-b">
              Archived Matches ({archivedSearchResults.length})
            </div>
            {archivedSearchResults.map((result) => (
              <div 
                key={result.id}
                className="px-2 py-1.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 text-[11px]"
                onClick={() => onArchiveResultClick(result)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-blue-600">{result.original_match_id?.slice(0, 8)}...</span>
                  <Badge variant="outline" className="text-[9px] h-4">{result.match_status}</Badge>
                </div>
                <div className="text-gray-500 truncate">
                  {result.load_emails?.parsed_data?.origin_city}, {result.load_emails?.parsed_data?.origin_state} → {result.load_emails?.parsed_data?.destination_city}, {result.load_emails?.parsed_data?.destination_state}
                </div>
                <div className="text-gray-400 text-[10px]">
                  Archived: {new Date(result.archived_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
        {showArchiveResults && matchSearchQuery.length >= 3 && archivedSearchResults.length === 0 && !isSearchingArchive && (
          <div className="absolute top-9 left-0 w-60 bg-white border rounded-md shadow-lg z-50 p-2 text-[11px] text-gray-500">
            No archived matches found
          </div>
        )}
      </div>

      {/* ALL + Unreviewed + Sound Controls - Connected Group */}
      <div className="flex items-center mr-2">
        {/* ALL Button */}
        {showAllTabEnabled && (
          <Button
            variant="ghost"
            size="sm"
            className={`${btnBase} rounded-none rounded-l-full ${
              activeFilter === 'all'
                ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-active text-white' : 'btn-glossy-dark text-white'
                : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
            }`}
            onClick={() => handleFilterChange('all')}
          >
            All
            <span className={`${activeFilter === 'all' ? 'badge-inset' : 'badge-inset'} text-[10px] h-5`}>{allEmailsCount}</span>
          </Button>
        )}

        {/* Unreviewed Button */}
        <Button
          variant="ghost"
          size="sm" 
          className={`${btnBase} rounded-none ${!showAllTabEnabled ? 'rounded-l-full' : ''} ${
            activeFilter === 'unreviewed'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-active text-white' : 'btn-glossy-success text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => handleFilterChange('unreviewed')}
        >
          Unreviewed
          <span className={`${activeFilter === 'unreviewed' ? 'badge-inset-success' : 'badge-inset'} text-[10px] h-5`}>{unreviewedCount}</span>
        </Button>
        
        {/* Sound Toggle */}
        <Button 
          variant="ghost"
          size="sm" 
          className={`h-[30px] w-[30px] p-0 rounded-none border-0 ${
            loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-600'
          }`}
          onClick={onToggleSound}
          title={isSoundMuted ? "Sound alerts off" : "Sound alerts on"}
        >
          {isSoundMuted ? <VolumeX className={iconSize} /> : <Volume2 className={iconSize} />}
        </Button>
        
        {/* Sound Settings */}
        <SoundSettingsDialog 
          onSettingsChange={onSoundSettingsChange}
          trigger={
            <Button 
              variant="ghost"
              size="sm" 
              className={`h-[30px] w-[30px] p-0 rounded-none rounded-r-full border-0 ${
                loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-600'
              }`}
              title="Sound settings"
            >
              <Settings className={iconSize} />
            </Button>
          }
        />
      </div>

      {/* Missed Button - Standalone - RED when selected */}
      <Button
        variant="ghost"
        size="sm" 
        className={`${btnBase} rounded-full mr-2 ${
          activeFilter === 'missed'
            ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-red text-white' : 'btn-glossy-danger text-white'
            : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
        }`}
        onClick={() => handleFilterChange('missed')}
      >
        Missed
        <span className={`${activeFilter === 'missed' ? 'badge-inset-danger' : 'badge-inset'} text-[10px] h-5`}>{missedCount}</span>
      </Button>

      {/* Wait / Undec / Skip - Connected Group - ORANGE when selected */}
      <div className="flex items-center mr-2">
        <Button
          variant="ghost"
          size="sm" 
          className={`${btnBase} rounded-none rounded-l-full ${
            activeFilter === 'waitlist'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-orange text-white' : 'btn-glossy-warning text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => handleFilterChange('waitlist')}
        >
          Wait
          <span className={`${activeFilter === 'waitlist' ? 'badge-inset-warning' : 'badge-inset'} text-[10px] h-5`}>{waitlistCount}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm" 
          className={`${btnBase} rounded-none ${
            activeFilter === 'undecided'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-orange text-white' : 'btn-glossy-warning text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => handleFilterChange('undecided')}
        >
          Undec
          <span className={`${activeFilter === 'undecided' ? 'badge-inset-warning' : 'badge-inset'} text-[10px] h-5`}>{undecidedCount}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm" 
          className={`${btnBase} rounded-none rounded-r-full ${
            activeFilter === 'skipped'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-orange text-white' : 'btn-glossy-warning text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => handleFilterChange('skipped')}
        >
          Skip
          <span className={`${activeFilter === 'skipped' ? 'badge-inset-warning' : 'badge-inset'} text-[10px] h-5`}>{skippedCount}</span>
        </Button>
      </div>

      {/* Bids / Booked - Connected Group */}
      <div className="flex items-center mr-2">
        <Button
          variant="ghost"
          size="sm" 
          className={`${btnBase} rounded-none rounded-l-full ${
            activeFilter === 'mybids'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-active text-white' : 'btn-glossy-primary text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => handleFilterChange('mybids')}
        >
          Bids
          <span className={`${activeFilter === 'mybids' ? 'badge-inset-primary' : 'badge-inset'} text-[10px] h-5`}>{bidCount}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm" 
          className={`${btnBase} rounded-none rounded-r-full ${
            activeFilter === 'booked'
              ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-active text-white' : 'btn-glossy-success text-white'
              : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
          }`}
          onClick={() => handleFilterChange('booked')}
        >
          Booked
          <span className={`${activeFilter === 'booked' ? 'badge-inset-success' : 'badge-inset'} text-[10px] h-5`}>{bookedCount}</span>
        </Button>
      </div>

      {/* Dispatcher Scorecard Button - Standalone with beautiful cyan glow when active */}
      <Button
        variant="ghost"
        size="sm"
        className={`${btnBase} rounded-full mr-2 btn-glossy-cyan text-white`}
        onClick={onOpenDispatcherScorecard}
      >
        <Gauge className={iconSize} />
        Scorecard
      </Button>

      {/* Assign Button - Standalone */}
      <Button 
        variant="ghost"
        size="sm" 
        className={`${btnBase} rounded-full mr-2 ${
          activeFilter === 'vehicle-assignment'
            ? loadHunterTheme === 'aurora' ? 'btn-glossy-aurora-active text-white' : 'btn-glossy-primary text-white'
            : loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
        }`}
        onClick={() => {
          setActiveFilter('vehicle-assignment');
          setSelectedVehicle(null);
          setSelectedEmailForDetail(null);
        }}
      >
        Assign
      </Button>

      {/* Source Filter Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`${btnBase} rounded-full mr-2 btn-glossy-violet text-white ${
              selectedSources.length < 2 ? 'animate-[pulse_1.5s_ease-in-out_infinite]' : ''
            }`}
          >
            <svg className={`${iconSize} drop-shadow-sm ${selectedSources.length < 2 ? 'animate-[ping_1.5s_ease-in-out_infinite]' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Source
            <span className={`${selectedSources.length < 2 ? 'badge-inset-warning' : 'badge-inset'} text-[10px] h-5`}>
              {selectedSources.length}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2 bg-background z-50" align="start">
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground px-2 py-1">Filter by Source</div>
            <div 
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                selectedSources.includes('sylectus') ? 'bg-primary/10' : 'hover:bg-muted'
              }`}
              onClick={() => {
                setSelectedSources(
                  selectedSources.includes('sylectus') 
                    ? selectedSources.filter(s => s !== 'sylectus')
                    : [...selectedSources, 'sylectus']
                );
              }}
            >
              <Checkbox checked={selectedSources.includes('sylectus')} />
              <span className="text-sm">Sylectus</span>
            </div>
            <div 
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                selectedSources.includes('fullcircle') ? 'bg-primary/10' : 'hover:bg-muted'
              }`}
              onClick={() => {
                setSelectedSources(
                  selectedSources.includes('fullcircle') 
                    ? selectedSources.filter(s => s !== 'fullcircle')
                    : [...selectedSources, 'fullcircle']
                );
              }}
            >
              <Checkbox checked={selectedSources.includes('fullcircle')} />
              <span className="text-sm">Full Circle TMS</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      
      {/* More Actions Dropdown (Menu icon) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-[30px] w-[30px] p-0 rounded-full ${
              loadHunterTheme === 'aurora' ? 'btn-glossy-aurora text-purple-200' : 'btn-glossy text-gray-700'
            }`}
          >
            <Menu className={iconSize} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 bg-background z-50">
          {/* Theme Selection */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Theme</div>
          <DropdownMenuItem
            className={loadHunterTheme === 'classic' ? 'bg-primary/10 text-primary' : ''}
            onClick={() => setLoadHunterTheme('classic')}
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300" />
              Classic
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={loadHunterTheme === 'aurora' ? 'bg-primary/10 text-primary' : ''}
            onClick={() => setLoadHunterTheme('aurora')}
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 border border-white/40 shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)]" />
              Aurora
            </div>
          </DropdownMenuItem>
          <div className="h-px bg-border my-1" />
          
          {/* Additional Filters in menu */}
          <DropdownMenuItem
            className={activeFilter === 'expired' ? 'bg-primary/10 text-primary' : ''}
            onClick={() => handleFilterChange('expired')}
          >
            Expired ({expiredCount})
          </DropdownMenuItem>
          
          <div className="h-px bg-border my-1" />
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Display</div>
          <DropdownMenuItem
            className={groupMatchesEnabled ? 'bg-primary/10 text-primary' : ''}
            onClick={() => {
              const newValue = !groupMatchesEnabled;
              setGroupMatchesEnabled(newValue);
              localStorage.setItem('loadHunterGroupMatches', String(newValue));
            }}
          >
            <div className="flex items-center gap-2">
              {groupMatchesEnabled ? (
                <div className="w-4 h-4 rounded-sm bg-primary/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-sm bg-primary" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-sm border border-muted-foreground/40" />
              )}
              Group Matches by Load
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
