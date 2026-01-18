import { useState, useEffect } from 'react';
import { 
  GitBranch, Copy, Check, Plus, Loader2, 
  FileCode, AlertTriangle, Rocket, Trash2, Edit
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface VersionableFeature {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  v1_files: string[];
  v2_files_pattern: string[];
  isolation_notes: string | null;
  created_at: string;
}

interface FeatureVersion {
  id: string;
  feature_id: string;
  version_number: number;
  feature_flag_key: string;
  status: string;
  scaffold_prompt: string | null;
  created_at: string;
  promoted_at: string | null;
  notes: string | null;
}

export default function V2PromptGenerator() {
  const [features, setFeatures] = useState<VersionableFeature[]>([]);
  const [versions, setVersions] = useState<FeatureVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  // Create V2 dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<VersionableFeature | null>(null);
  const [additionalNotes, setAdditionalNotes] = useState('');
  
  // Generated prompt dialog
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  // Add feature dialog
  const [addFeatureDialogOpen, setAddFeatureDialogOpen] = useState(false);
  const [newFeature, setNewFeature] = useState({
    feature_key: '',
    feature_name: '',
    description: '',
    v1_files: '',
    isolation_notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [featuresRes, versionsRes] = await Promise.all([
        supabase.from('versionable_features').select('*').order('feature_name'),
        supabase.from('feature_versions').select('*').order('created_at', { ascending: false }),
      ]);

      if (featuresRes.error) throw featuresRes.error;
      if (versionsRes.error) throw versionsRes.error;

      // Parse JSONB fields properly
      const parsedFeatures: VersionableFeature[] = (featuresRes.data || []).map(f => ({
        id: f.id,
        feature_key: f.feature_key,
        feature_name: f.feature_name,
        description: f.description,
        v1_files: Array.isArray(f.v1_files) ? f.v1_files.map((x: unknown) => String(x)) : [],
        v2_files_pattern: Array.isArray(f.v2_files_pattern) ? f.v2_files_pattern.map((x: unknown) => String(x)) : [],
        isolation_notes: f.isolation_notes,
        created_at: f.created_at,
      }));

      setFeatures(parsedFeatures);
      setVersions(versionsRes.data || []);
    } catch (err) {
      console.error('Error loading versionable features:', err);
      toast.error('Failed to load features');
    } finally {
      setLoading(false);
    }
  }

  function generatePrompt(feature: VersionableFeature, notes: string): string {
    const flagKey = `${feature.feature_key}_v2_enabled`;
    const v2Files = feature.v2_files_pattern.length > 0 
      ? feature.v2_files_pattern 
      : feature.v1_files.map(f => f.replace(/(\.[^.]+)$/, 'V2$1'));

    return `## V2 Scaffold Request: ${feature.feature_name}

### Context
I'm creating V2 of the **${feature.feature_name}** feature. Please scaffold the V2 files while keeping V1 completely isolated.

### Feature Flag
- Key: \`${flagKey}\`
- Enable for: \`internal\` channel only
- All other channels: disabled

### V1 Files (DO NOT MODIFY):
${feature.v1_files.map(f => `- ${f}`).join('\n')}

### V2 Files to Create:
${v2Files.map(f => `- ${f}`).join('\n')}

### Isolation Rules
1. **Create NEW files only** - never modify any V1 files listed above
2. **Add routing logic** in App.tsx / worker index.ts to switch between V1/V2 based on \`${flagKey}\` feature flag
3. **Start V2 as a copy of V1** content, then I'll request specific changes
4. **Create the feature flag** in the database if it doesn't exist:
   - \`feature_flags\` table: key = \`${flagKey}\`, default_enabled = false
   - \`release_channel_feature_flags\`: internal = true, pilot = false, general = false

### Isolation Notes
${feature.isolation_notes || 'No special notes. Standard UI/worker separation applies.'}

${notes ? `### Additional Context\n${notes}\n` : ''}
### What to Scaffold
1. Create all V2 files listed above (copy V1 content as starting point)
2. Add conditional routing based on \`${flagKey}\` flag  
3. Create/verify the feature flag exists in database
4. Test that V1 continues to work unchanged for non-internal tenants

Please proceed with scaffolding now.`;
  }

  async function handleCreateV2() {
    if (!selectedFeature) return;
    setCreating(true);

    try {
      const flagKey = `${selectedFeature.feature_key}_v2_enabled`;
      const prompt = generatePrompt(selectedFeature, additionalNotes);

      // Check if feature flag already exists
      const { data: existingFlag } = await supabase
        .from('feature_flags')
        .select('id')
        .eq('key', flagKey)
        .maybeSingle();

      // Create feature flag if it doesn't exist
      if (!existingFlag) {
        const { data: newFlag, error: flagError } = await supabase
          .from('feature_flags')
          .insert({
            key: flagKey,
            name: `${selectedFeature.feature_name} V2`,
            description: `Enables V2 of ${selectedFeature.feature_name} feature`,
            default_enabled: false,
            is_killswitch: false,
          })
          .select()
          .single();

        if (flagError) throw flagError;

        // Set internal channel to enabled
        await supabase
          .from('release_channel_feature_flags')
          .insert({
            feature_flag_id: newFlag.id,
            release_channel: 'internal',
            enabled: true,
          });

        toast.success(`Created feature flag: ${flagKey}`);
      }

      // Create feature version record
      const { error: versionError } = await supabase
        .from('feature_versions')
        .insert({
          feature_id: selectedFeature.id,
          version_number: 2,
          feature_flag_key: flagKey,
          status: 'scaffolding',
          scaffold_prompt: prompt,
          notes: additionalNotes || null,
        });

      if (versionError && !versionError.message.includes('duplicate')) {
        throw versionError;
      }

      setGeneratedPrompt(prompt);
      setCreateDialogOpen(false);
      setPromptDialogOpen(true);
      await loadData();
    } catch (err) {
      console.error('Error creating V2:', err);
      toast.error('Failed to create V2 setup');
    } finally {
      setCreating(false);
    }
  }

  async function handleAddFeature() {
    if (!newFeature.feature_key || !newFeature.feature_name) {
      toast.error('Feature key and name are required');
      return;
    }

    setCreating(true);
    try {
      const v1FilesArray = newFeature.v1_files
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0);

      const v2FilesArray = v1FilesArray.map(f => 
        f.replace(/(\.[^.]+)$/, 'V2$1')
      );

      const { error } = await supabase
        .from('versionable_features')
        .insert({
          feature_key: newFeature.feature_key,
          feature_name: newFeature.feature_name,
          description: newFeature.description || null,
          v1_files: v1FilesArray,
          v2_files_pattern: v2FilesArray,
          isolation_notes: newFeature.isolation_notes || null,
        });

      if (error) throw error;

      toast.success(`Added feature: ${newFeature.feature_name}`);
      setAddFeatureDialogOpen(false);
      setNewFeature({
        feature_key: '',
        feature_name: '',
        description: '',
        v1_files: '',
        isolation_notes: '',
      });
      await loadData();
    } catch (err) {
      console.error('Error adding feature:', err);
      toast.error('Failed to add feature');
    } finally {
      setCreating(false);
    }
  }

  function openCreateDialog(feature: VersionableFeature) {
    setSelectedFeature(feature);
    setAdditionalNotes('');
    setCreateDialogOpen(true);
  }

  function showExistingPrompt(version: FeatureVersion) {
    setGeneratedPrompt(version.scaffold_prompt || 'No prompt saved');
    setPromptDialogOpen(true);
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    toast.success('Prompt copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'scaffolding':
        return <Badge variant="secondary">Scaffolding</Badge>;
      case 'development':
        return <Badge className="bg-blue-600">Development</Badge>;
      case 'testing':
        return <Badge className="bg-amber-500 text-black">Testing</Badge>;
      case 'pilot':
        return <Badge className="bg-purple-600">Pilot</Badge>;
      case 'promoted':
        return <Badge className="bg-green-600">Promoted</Badge>;
      case 'deprecated':
        return <Badge variant="destructive">Deprecated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getVersionForFeature(featureId: string): FeatureVersion | undefined {
    return versions.find(v => v.feature_id === featureId);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading features...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                V2 Prompt Generator
              </CardTitle>
              <CardDescription>
                Create V2 versions of features with auto-generated scaffold prompts
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAddFeatureDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Feature
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>V1 Files</TableHead>
                <TableHead>V2 Status</TableHead>
                <TableHead className="w-[150px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map(feature => {
                const existingVersion = getVersionForFeature(feature.id);
                
                return (
                  <TableRow key={feature.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{feature.feature_name}</p>
                        <p className="text-xs text-muted-foreground">{feature.feature_key}</p>
                        {feature.description && (
                          <p className="text-xs text-muted-foreground mt-1">{feature.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {feature.v1_files.slice(0, 3).map((file, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-mono">
                            {file.split('/').pop()}
                          </Badge>
                        ))}
                        {feature.v1_files.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{feature.v1_files.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {existingVersion ? (
                        <div className="flex items-center gap-2">
                          {getStatusBadge(existingVersion.status)}
                          <span className="text-xs text-muted-foreground">
                            {existingVersion.feature_flag_key}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No V2</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {existingVersion ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => showExistingPrompt(existingVersion)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          View Prompt
                        </Button>
                      ) : (
                        <Button 
                          size="sm"
                          onClick={() => openCreateDialog(feature)}
                        >
                          <Rocket className="h-3 w-3 mr-1" />
                          Create V2
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {features.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No versionable features defined yet.
                    <br />
                    <Button 
                      variant="link" 
                      className="mt-2"
                      onClick={() => setAddFeatureDialogOpen(true)}
                    >
                      Add your first feature
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Active V2 Development */}
          {versions.filter(v => v.status !== 'promoted' && v.status !== 'deprecated').length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                Active V2 Development
              </h4>
              <Accordion type="single" collapsible>
                {versions
                  .filter(v => v.status !== 'promoted' && v.status !== 'deprecated')
                  .map(version => {
                    const feature = features.find(f => f.id === version.feature_id);
                    return (
                      <AccordionItem key={version.id} value={version.id}>
                        <AccordionTrigger className="text-sm">
                          <div className="flex items-center gap-3">
                            <span>{feature?.feature_name || 'Unknown'} V2</span>
                            {getStatusBadge(version.status)}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 text-sm">
                            <p><strong>Flag:</strong> <code className="bg-muted px-1 rounded">{version.feature_flag_key}</code></p>
                            <p><strong>Created:</strong> {new Date(version.created_at).toLocaleDateString()}</p>
                            {version.notes && <p><strong>Notes:</strong> {version.notes}</p>}
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-2"
                              onClick={() => showExistingPrompt(version)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy Scaffold Prompt
                            </Button>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create V2 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Create V2: {selectedFeature?.feature_name}
            </DialogTitle>
            <DialogDescription>
              This will create a feature flag and generate a scaffold prompt for you to paste.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <p className="font-medium mb-2">What will happen:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Create <code className="bg-background px-1 rounded">{selectedFeature?.feature_key}_v2_enabled</code> flag</li>
                <li>Enable for <strong>internal</strong> channel only</li>
                <li>Generate scaffold prompt with all V1 files</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Additional Notes (optional)</Label>
              <Textarea
                placeholder="Any specific requirements or context for this V2..."
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                rows={3}
              />
            </div>

            {selectedFeature?.isolation_notes && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-600 text-sm">Isolation Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedFeature.isolation_notes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateV2} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Create V2 & Generate Prompt
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generated Prompt Dialog */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Scaffold Prompt
            </DialogTitle>
            <DialogDescription>
              Copy this prompt and paste it to start scaffolding V2.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Textarea
              value={generatedPrompt}
              readOnly
              className="font-mono text-xs h-[400px] resize-none"
            />
            <Button
              size="sm"
              className="absolute top-2 right-2"
              onClick={copyPrompt}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Feature Dialog */}
      <Dialog open={addFeatureDialogOpen} onOpenChange={setAddFeatureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Versionable Feature</DialogTitle>
            <DialogDescription>
              Define a new feature that can be versioned with V2 scaffolding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Feature Key</Label>
                <Input
                  placeholder="load_hunter"
                  value={newFeature.feature_key}
                  onChange={(e) => setNewFeature(prev => ({ ...prev, feature_key: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Feature Name</Label>
                <Input
                  placeholder="Load Hunter"
                  value={newFeature.feature_name}
                  onChange={(e) => setNewFeature(prev => ({ ...prev, feature_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Brief description of the feature"
                value={newFeature.description}
                onChange={(e) => setNewFeature(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>V1 Files (one per line)</Label>
              <Textarea
                placeholder="src/pages/MyFeature.tsx
src/components/FeatureTable.tsx
worker/src/feature.ts"
                value={newFeature.v1_files}
                onChange={(e) => setNewFeature(prev => ({ ...prev, v1_files: e.target.value }))}
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Isolation Notes (optional)</Label>
              <Textarea
                placeholder="Any special instructions for keeping V2 isolated..."
                value={newFeature.isolation_notes}
                onChange={(e) => setNewFeature(prev => ({ ...prev, isolation_notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFeatureDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddFeature} disabled={creating}>
              {creating ? 'Adding...' : 'Add Feature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
