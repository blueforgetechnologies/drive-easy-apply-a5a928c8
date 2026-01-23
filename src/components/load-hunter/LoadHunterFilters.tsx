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

  return (
    <div className={`flex items-center gap-2 py-2 px-2 border-y overflow-x-auto flex-shrink-0 relative z-10 ${
      loadHunterTheme === 'aurora'
        ? 'bg-gradient-to-r from-slate-900/95 via-purple-900/50 to-slate-900/95 border-purple-500/30 backdrop-blur-md shadow-[0_4px_20px_-5px_rgba(168,85,247,0.3)]'
        : 'bg-background'
    }`}>
      
      {/* Mode Toggle (Admin / My Trucks) */}
      <div className={`flex items-center overflow-hidden rounded-md flex-shrink-0 ${
        loadHunterTheme === 'aurora' ? 'border border-purple-400/30' : 'border'
      }`}>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-3 text-xs font-medium !rounded-none border-0 ${
            loadHunterTheme === 'aurora'
              ? activeMode === 'admin'
                ? 'bg-gradient-to-b from-slate-600 to-slate-800 text-white'
                : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
              : activeMode === 'admin'
                ? 'bg-gradient-to-b from-slate-600 to-slate-700 text-white'
                : 'btn-glossy text-gray-700'
          }`}
          onClick={() => setActiveMode('admin')}
        >
          Admin
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-3 text-xs font-medium !rounded-none border-0 ${
            loadHunterTheme === 'aurora'
              ? activeMode === 'dispatch'
                ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white'
                : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
              : activeMode === 'dispatch'
                ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white'
                : 'btn-glossy text-gray-700'
          }`}
          onClick={() => setActiveMode('dispatch')}
        >
          MY TRUCKS
        </Button>
      </div>

      {/* Add Vehicle Button */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-3 text-xs font-medium gap-1.5 rounded-md flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 text-white border border-emerald-400/30 shadow-[0_0_10px_-3px_rgba(16,185,129,0.4)]'
            : 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm'
        }`}
        onClick={() => handleFilterChange('vehicle-assignment')}
      >
        <Truck className="h-3.5 w-3.5" />
        Add Vehicle
      </Button>

      {/* Search Input */}
      <div className="flex-shrink-0 relative">
        <Input
          placeholder="Search match ID..."
          value={matchSearchQuery}
          onChange={(e) => setMatchSearchQuery(e.target.value)}
          onFocus={() => matchSearchQuery && setShowArchiveResults(true)}
          className={`h-7 w-36 text-xs rounded-full px-3.5 ${
            loadHunterTheme === 'aurora'
              ? 'bg-slate-800/60 border-purple-500/30 text-purple-100 placeholder:text-purple-300/50 focus:border-purple-400/60 focus:ring-purple-500/20'
              : 'input-inset'
          }`}
        />
        {isSearchingArchive && (
          <div className="absolute right-5 top-1.5">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {showArchiveResults && archivedSearchResults.length > 0 && (
          <div className="absolute top-8 left-0 w-80 bg-white border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
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
          <div className="absolute top-8 left-0 w-60 bg-white border rounded-md shadow-lg z-50 p-2 text-[11px] text-gray-500">
            No archived matches found
          </div>
        )}
      </div>

      {/* Unreviewed Button with Sound controls */}
      <div className={`flex items-center overflow-hidden rounded-full flex-shrink-0 ${
        loadHunterTheme === 'aurora' ? 'border border-purple-400/30 shadow-[0_0_10px_-3px_rgba(168,85,247,0.4)]' : ''
      }`}>
        <Button
          variant="ghost"
          size="sm" 
          className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-l-full border-0 ${
            loadHunterTheme === 'aurora'
              ? activeFilter === 'unreviewed'
                ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
              : activeFilter === 'unreviewed' 
                ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white' 
                : 'btn-glossy text-gray-700'
          }`}
          onClick={() => handleFilterChange('unreviewed')}
        >
          Unreviewed
          <span className={`text-[10px] h-5 px-1.5 rounded-full ${
            loadHunterTheme === 'aurora'
              ? 'bg-rose-500/80 text-white'
              : 'bg-rose-500 text-white'
          }`}>{unreviewedCount}</span>
        </Button>
        
        <Button 
          variant="ghost"
          size="sm" 
          className={`h-7 w-7 p-0 !rounded-none border-0 ${
            loadHunterTheme === 'aurora'
              ? 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
              : 'btn-glossy text-gray-700'
          }`}
          onClick={onToggleSound}
          title={isSoundMuted ? "Sound alerts off" : "Sound alerts on"}
        >
          {isSoundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </Button>
        
        <SoundSettingsDialog 
          onSettingsChange={onSoundSettingsChange}
          trigger={
            <Button 
              variant="ghost"
              size="sm" 
              className={`h-7 w-7 p-0 !rounded-none !rounded-r-full border-0 ${
                loadHunterTheme === 'aurora'
                  ? 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                  : 'btn-glossy text-gray-700'
              }`}
              title="Sound settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          }
        />
      </div>

      {/* Missed Button */}
      <Button
        variant="ghost"
        size="sm" 
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? activeFilter === 'missed'
              ? 'bg-gradient-to-b from-amber-500 to-amber-700 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
              : 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : activeFilter === 'missed' 
              ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-white' 
              : 'btn-glossy text-gray-700'
        }`}
        onClick={() => handleFilterChange('missed')}
      >
        Missed
        <span className={`text-[10px] h-5 px-1.5 rounded-full ${
          loadHunterTheme === 'aurora'
            ? 'bg-amber-400/80 text-amber-900'
            : 'bg-amber-400 text-amber-900'
        }`}>{missedCount}</span>
      </Button>

      {/* Wait Button */}
      <Button
        variant="ghost"
        size="sm" 
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? activeFilter === 'waitlist'
              ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
              : 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : activeFilter === 'waitlist' 
              ? 'btn-glossy-dark text-white' 
              : 'btn-glossy text-gray-700'
        }`}
        onClick={() => handleFilterChange('waitlist')}
      >
        Wait
        <span className="badge-inset text-[10px] h-5">{waitlistCount}</span>
      </Button>

      {/* Undec Button */}
      <Button
        variant="ghost"
        size="sm" 
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? activeFilter === 'undecided'
              ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
              : 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : activeFilter === 'undecided' 
              ? 'btn-glossy-dark text-white' 
              : 'btn-glossy text-gray-700'
        }`}
        onClick={() => handleFilterChange('undecided')}
      >
        Undec
        <span className="badge-inset text-[10px] h-5">{undecidedCount}</span>
      </Button>

      {/* Skip Button */}
      <Button
        variant="ghost"
        size="sm" 
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? activeFilter === 'skipped'
              ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
              : 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : activeFilter === 'skipped' 
              ? 'btn-glossy-dark text-white' 
              : 'btn-glossy text-gray-700'
        }`}
        onClick={() => handleFilterChange('skipped')}
      >
        Skip
        <span className="badge-inset text-[10px] h-5">{skippedCount}</span>
      </Button>

      {/* Bids Button */}
      <Button
        variant="ghost"
        size="sm" 
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? activeFilter === 'mybids'
              ? 'bg-gradient-to-b from-cyan-400 to-cyan-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
              : 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : activeFilter === 'mybids' 
              ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white' 
              : 'btn-glossy text-gray-700'
        }`}
        onClick={() => handleFilterChange('mybids')}
      >
        Bids
        <span className="badge-inset text-[10px] h-5">{bidCount}</span>
      </Button>

      {/* Booked Button */}
      <Button
        variant="ghost"
        size="sm" 
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? activeFilter === 'booked'
              ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
              : 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : activeFilter === 'booked' 
              ? 'bg-gradient-to-b from-orange-500 to-orange-600 text-white' 
              : 'btn-glossy text-gray-700'
        }`}
        onClick={() => handleFilterChange('booked')}
      >
        Booked
        <span className="badge-inset text-[10px] h-5">{bookedCount}</span>
      </Button>

      {/* Dispatcher Scorecard Button */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : 'btn-glossy text-gray-700'
        }`}
        onClick={onOpenDispatcherScorecard}
      >
        Dispatcher Score Card
      </Button>

      {/* Assign Button */}
      <Button 
        variant="ghost"
        size="sm" 
        className={`h-7 px-3 text-xs font-medium gap-1 rounded-full flex-shrink-0 ${
          loadHunterTheme === 'aurora'
            ? activeFilter === 'vehicle-assignment'
              ? 'bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
              : 'bg-slate-800/40 border border-purple-400/30 text-purple-200/70 hover:bg-slate-700/40'
            : activeFilter === 'vehicle-assignment' 
              ? 'btn-glossy-primary text-white' 
              : 'btn-glossy text-gray-700'
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
            className={`h-8 px-4 text-xs font-semibold gap-2 rounded-full flex-shrink-0 border border-white/40 bg-gradient-to-br from-violet-500/90 via-purple-500/90 to-fuchsia-500/90 text-white shadow-[0_4px_20px_-2px_rgba(139,92,246,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-md hover:shadow-[0_6px_28px_-2px_rgba(139,92,246,0.6),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 ${
              selectedSources.length < 2 ? 'animate-[pulse_1.5s_ease-in-out_infinite]' : ''
            }`}
          >
            <svg className={`h-3.5 w-3.5 drop-shadow-sm ${selectedSources.length < 2 ? 'animate-[ping_1.5s_ease-in-out_infinite]' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Source
            <span className={`flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[10px] font-bold rounded-full border shadow-inner transition-colors ${
              selectedSources.length < 2 
                ? 'bg-amber-400/90 border-amber-300 text-amber-900' 
                : 'bg-white/25 backdrop-blur-sm border-white/40'
            }`}>
              {selectedSources.length}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start">
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
            className={`h-7 w-7 p-0 rounded-full flex-shrink-0 border-0 ${
              loadHunterTheme === 'aurora'
                ? 'bg-slate-800/60 border border-purple-400/30 text-purple-200 hover:bg-slate-700/60 shadow-[0_0_10px_-3px_rgba(168,85,247,0.4)]'
                : 'btn-glossy text-gray-700'
            }`}
          >
            <Menu className="h-4 w-4" />
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
