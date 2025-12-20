import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  name: string;
  [key: string]: any;
}

interface SearchableEntitySelectProps {
  entities: Entity[];
  value: string;
  placeholder?: string;
  onSelect: (entity: Entity) => void;
  onAddNew: (name: string, additionalData: Record<string, string>) => Promise<void>;
  entityType: "customer" | "location";
  className?: string;
}

export function SearchableEntitySelect({
  entities,
  value,
  placeholder = "Search or type to add...",
  onSelect,
  onAddNew,
  entityType,
  className,
}: SearchableEntitySelectProps) {
  const [searchValue, setSearchValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newEntityData, setNewEntityData] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update search value when value prop changes
  useEffect(() => {
    setSearchValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredEntities = entities.filter((entity) =>
    entity.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  const exactMatch = entities.some(
    (entity) => entity.name.toLowerCase() === searchValue.toLowerCase()
  );

  const handleSelectEntity = (entity: Entity) => {
    setSearchValue(entity.name);
    setIsOpen(false);
    onSelect(entity);
  };

  const handleAddNew = async () => {
    if (!searchValue.trim()) return;
    
    setIsAdding(true);
    try {
      await onAddNew(searchValue, newEntityData);
      setShowAddDialog(false);
      setNewEntityData({});
    } finally {
      setIsAdding(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
    setIsOpen(true);
  };

  return (
    <>
      <div ref={containerRef} className={cn("relative", className)}>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              className="h-7 text-xs pr-8"
              value={searchValue}
              onChange={handleInputChange}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-7 w-7 p-0"
              onClick={() => {
                if (searchValue) {
                  setSearchValue("");
                } else {
                  setIsOpen(!isOpen);
                }
              }}
            >
              {searchValue ? (
                <X className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 right-8 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
            {filteredEntities.length > 0 ? (
              filteredEntities.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleSelectEntity(entity)}
                >
                  <span className="font-medium">{entity.name}</span>
                  {entity.city && entity.state && (
                    <span className="text-muted-foreground ml-1">
                      - {entity.city}, {entity.state}
                    </span>
                  )}
                </button>
              ))
            ) : searchValue.trim() ? (
              <div className="p-2">
                <p className="text-xs text-muted-foreground mb-2">No matches found</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => {
                    setIsOpen(false);
                    setShowAddDialog(true);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add "{searchValue}" as new {entityType}
                </Button>
              </div>
            ) : (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Start typing to search...
              </p>
            )}

            {/* Show Add as New option even when there are results but no exact match */}
            {filteredEntities.length > 0 && searchValue.trim() && !exactMatch && (
              <div className="border-t p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs justify-start"
                  onClick={() => {
                    setIsOpen(false);
                    setShowAddDialog(true);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add "{searchValue}" as new {entityType}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add New Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New {entityType === "customer" ? "Customer" : "Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                className="h-8 text-sm"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder={entityType === "customer" ? "Customer Name" : "Location Name"}
              />
            </div>

            {entityType === "customer" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Contact Name</Label>
                    <Input
                      className="h-8 text-sm"
                      value={newEntityData.contact_name || ""}
                      onChange={(e) => setNewEntityData({ ...newEntityData, contact_name: e.target.value })}
                      placeholder="Contact Name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      className="h-8 text-sm"
                      value={newEntityData.phone || ""}
                      onChange={(e) => setNewEntityData({ ...newEntityData, phone: e.target.value })}
                      placeholder="Phone"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    className="h-8 text-sm"
                    value={newEntityData.email || ""}
                    onChange={(e) => setNewEntityData({ ...newEntityData, email: e.target.value })}
                    placeholder="Email"
                  />
                </div>
              </>
            )}

            <div>
              <Label className="text-xs">Address</Label>
              <Input
                className="h-8 text-sm"
                value={newEntityData.address || ""}
                onChange={(e) => setNewEntityData({ ...newEntityData, address: e.target.value })}
                placeholder="Street Address"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">City</Label>
                <Input
                  className="h-8 text-sm"
                  value={newEntityData.city || ""}
                  onChange={(e) => setNewEntityData({ ...newEntityData, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input
                  className="h-8 text-sm uppercase"
                  value={newEntityData.state || ""}
                  onChange={(e) => setNewEntityData({ ...newEntityData, state: e.target.value.toUpperCase() })}
                  placeholder="ST"
                  maxLength={2}
                />
              </div>
              <div>
                <Label className="text-xs">ZIP</Label>
                <Input
                  className="h-8 text-sm"
                  value={newEntityData.zip || ""}
                  onChange={(e) => setNewEntityData({ ...newEntityData, zip: e.target.value })}
                  placeholder="ZIP"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddDialog(false);
                  setNewEntityData({});
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAddNew}
                disabled={isAdding || !searchValue.trim()}
              >
                {isAdding ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
