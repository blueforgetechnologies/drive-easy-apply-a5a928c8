import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { X, CheckCircle, MapPin, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { formatTimeAgo, buildPickupDisplay, buildDeliveryDisplay } from "@/utils/loadHunterHelpers";

interface LoadHunterTableProps {
  matches: any[];
  loadEmails?: any[];
  activeFilter: string;
  onSkip: (match: any) => void;
  onBid: (match: any) => void;
  onBook: (match: any) => void;
  onViewDetail: (match: any) => void;
  onViewMultipleMatches?: (matches: any[]) => void;
  vehiclesMap: Record<string, string>;
  // Pagination
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
  // Theme
  loadHunterTheme: 'classic' | 'aurora';
}

export function LoadHunterTable({
  matches,
  loadEmails = [],
  activeFilter,
  onSkip,
  onBid,
  onBook,
  onViewDetail,
  onViewMultipleMatches,
  vehiclesMap,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  loadHunterTheme,
}: LoadHunterTableProps) {
  // Pagination
  const totalPages = Math.ceil(matches.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedMatches = matches.slice(startIndex, startIndex + itemsPerPage);

  // Determine source from match data
  const getEmailSource = (match: any) => {
    const fromEmail = (match.from_email || '').toLowerCase();
    if (fromEmail.includes('fullcircletms.com') || fromEmail.includes('fctms.com')) {
      return 'fullcircle';
    }
    return match.email_source || 'sylectus';
  };

  // Get source badge styling
  const getSourceBadge = (source: string) => {
    if (source === 'fullcircle') {
      return <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300">FC</Badge>;
    }
    return <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">SYL</Badge>;
  };

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className={loadHunterTheme === 'aurora' ? 'bg-gradient-to-r from-primary/5 to-primary/10' : ''}>
              <TableHead className="w-[60px]">Source</TableHead>
              <TableHead className="w-[100px]">Vehicle</TableHead>
              <TableHead className="w-[80px]">Distance</TableHead>
              <TableHead>Pickup</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="w-[80px]">Rate</TableHead>
              <TableHead className="w-[100px]">Received</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {activeFilter === 'unreviewed' 
                    ? 'No unreviewed matches. Enable a hunt plan to start matching loads.'
                    : 'No matches found for this filter.'
                  }
                </TableCell>
              </TableRow>
            ) : (
              paginatedMatches.map((match) => {
                const parsed = match.parsed_data || {};
                const cleanBody = match.body_text || match.body_html || '';
                const pickupDisplay = buildPickupDisplay(parsed, cleanBody);
                const deliveryDisplay = buildDeliveryDisplay(parsed, cleanBody);
                const source = getEmailSource(match);
                const vehicleName = vehiclesMap[match.vehicle_id] || match.vehicle_number || 'Unknown';
                const isGrouped = match._isGrouped && match._matchCount > 1;

                return (
                  <TableRow
                    key={match.id || match.match_id}
                    className={`
                      cursor-pointer hover:bg-muted/50 transition-colors
                      ${loadHunterTheme === 'aurora' ? 'hover:bg-primary/5' : ''}
                    `}
                    onClick={() => onViewDetail(match)}
                  >
                    <TableCell>{getSourceBadge(source)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm">{vehicleName}</span>
                        {isGrouped && onViewMultipleMatches && (
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewMultipleMatches(match._allMatches);
                            }}
                          >
                            +{match._matchCount - 1}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {match.distance_miles ? (
                        <span className="text-sm">{Math.round(match.distance_miles)} mi</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <div className="flex items-center gap-1 cursor-help">
                            <MapPin className="h-3 w-3 text-green-500 flex-shrink-0" />
                            <span className="text-sm truncate max-w-[150px]">
                              {pickupDisplay.length > 25 ? pickupDisplay.slice(0, 25) + '...' : pickupDisplay}
                            </span>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-auto max-w-[300px]">
                          <p className="text-sm">{pickupDisplay}</p>
                          {parsed.pickup_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {parsed.pickup_date} {parsed.pickup_time || ''}
                            </p>
                          )}
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <div className="flex items-center gap-1 cursor-help">
                            <MapPin className="h-3 w-3 text-red-500 flex-shrink-0" />
                            <span className="text-sm truncate max-w-[150px]">
                              {deliveryDisplay.length > 25 ? deliveryDisplay.slice(0, 25) + '...' : deliveryDisplay}
                            </span>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-auto max-w-[300px]">
                          <p className="text-sm">{deliveryDisplay}</p>
                          {parsed.delivery_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {parsed.delivery_date} {parsed.delivery_time || ''}
                            </p>
                          )}
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      {parsed.rate ? (
                        <span className="font-medium text-green-600">
                          ${typeof parsed.rate === 'number' ? parsed.rate.toLocaleString() : parsed.rate}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(new Date(match.received_at || match.created_at))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => onSkip(match)}
                          title="Skip"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onBid(match)}
                          title="Place Bid"
                        >
                          Bid
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onBook(match)}
                          title="Book Load"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Book
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, matches.length)} of {matches.length}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
