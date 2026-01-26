import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Monitor, Phone, PhoneOff, Copy, Users, Eye, Loader2 } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";

interface ScreenShareSession {
  id: string;
  session_code: string;
  status: string;
  initiated_by: string;
  admin_user_id: string | null;
  client_user_id: string | null;
  tenant_id: string;
  created_at: string;
  connected_at: string | null;
}

const ScreenshareTab = () => {
  const { toast } = useToast();
  const { effectiveTenant } = useTenantContext();
  const [sessions, setSessions] = useState<ScreenShareSession[]>([]);
  const [sessionCode, setSessionCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ScreenShareSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    loadCurrentUser();
    loadSessions();
    
    // Subscribe to realtime updates for active session only (RLS is authoritative)
    // We subscribe without tenant_id filter - RLS enforces visibility
    // Filter by session_code when we have an active session
    const channel = supabase
      .channel('screen-share-sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'screen_share_sessions'
        },
        (payload) => {
          console.log('Screen share session update:', payload);
          handleRealtimeUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      cleanupConnection();
    };
  }, []);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadSessions = async () => {
    const { data, error } = await supabase
      .from('screen_share_sessions')
      .select('*')
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading sessions:', error);
      return;
    }
    
    setSessions(data || []);
  };

  const handleRealtimeUpdate = (payload: any) => {
    if (payload.eventType === 'INSERT') {
      setSessions(prev => [payload.new, ...prev]);
    } else if (payload.eventType === 'UPDATE') {
      setSessions(prev => prev.map(s => s.id === payload.new.id ? payload.new : s));
      
      // Handle WebRTC signaling
      if (activeSession?.id === payload.new.id) {
        handleSignaling(payload.new);
      }
    } else if (payload.eventType === 'DELETE') {
      setSessions(prev => prev.filter(s => s.id !== payload.old.id));
    }
  };

  const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createSession = async (initiatedBy: 'admin' | 'client') => {
    // Require tenant context for session creation
    if (!effectiveTenant?.id) {
      toast({ title: "Error", description: "No tenant selected", variant: "destructive" });
      return;
    }

    const code = generateSessionCode();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
      return;
    }

    // Build session data with tenant_id and proper participant fields for RLS
    const sessionData: {
      session_code: string;
      initiated_by: 'admin' | 'client';
      status: string;
      tenant_id: string;
      admin_user_id: string | null;
      client_user_id: string | null;
    } = {
      session_code: code,
      initiated_by: initiatedBy,
      status: 'pending',
      tenant_id: effectiveTenant.id,
      admin_user_id: initiatedBy === 'admin' ? user.id : null,
      client_user_id: initiatedBy === 'client' ? user.id : null,
    };

    const { data, error } = await supabase
      .from('screen_share_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      console.error('Failed to create session:', error);
      toast({ title: "Error", description: error.message || "Failed to create session", variant: "destructive" });
      return;
    }

    setGeneratedCode(code);
    toast({ 
      title: "Session Created", 
      description: `Share this code with your ${initiatedBy === 'admin' ? 'client' : 'support agent'}: ${code}` 
    });
  };

  const joinSession = async () => {
    if (!sessionCode.trim()) {
      toast({ title: "Error", description: "Please enter a session code", variant: "destructive" });
      return;
    }

    setIsConnecting(true);

    const { data: session, error } = await supabase
      .from('screen_share_sessions')
      .select('*')
      .eq('session_code', sessionCode.toUpperCase())
      .eq('status', 'pending')
      .single();

    if (error || !session) {
      toast({ title: "Error", description: "Session not found or expired", variant: "destructive" });
      setIsConnecting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
      setIsConnecting(false);
      return;
    }

    // Determine role based on who initiated
    const isAdmin = session.initiated_by === 'client';
    
    const updateData: any = {
      status: 'active',
      connected_at: new Date().toISOString()
    };

    if (isAdmin) {
      updateData.admin_user_id = user.id;
    } else {
      updateData.client_user_id = user.id;
    }

    await supabase
      .from('screen_share_sessions')
      .update(updateData)
      .eq('id', session.id);

    setActiveSession({ ...session, ...updateData });
    
    // If client joining admin's session, start screen share
    if (!isAdmin) {
      startScreenShare(session);
    } else {
      setIsViewing(true);
      initializeViewer(session);
    }

    setSessionCode("");
    setIsConnecting(false);
  };

  const startScreenShare = async (session: ScreenShareSession) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false
      });
      
      localStreamRef.current = stream;
      
      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      // Add stream tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          const { data: currentSession } = await supabase
            .from('screen_share_sessions')
            .select('ice_candidates')
            .eq('id', session.id)
            .single();
          
          const existingCandidates = Array.isArray(currentSession?.ice_candidates) 
            ? (currentSession.ice_candidates as unknown[])
            : [];
          const candidates = [...existingCandidates, JSON.parse(JSON.stringify(event.candidate.toJSON()))];
          
          await supabase
            .from('screen_share_sessions')
            .update({ ice_candidates: candidates })
            .eq('id', session.id);
        }
      };

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await supabase
        .from('screen_share_sessions')
        .update({ admin_offer: JSON.stringify(offer) })
        .eq('id', session.id);

      // Handle stream end
      stream.getVideoTracks()[0].onended = () => {
        endSession(session.id);
      };

      setIsViewing(true);
      toast({ title: "Screen Sharing", description: "Your screen is now being shared" });
    } catch (error) {
      console.error('Error starting screen share:', error);
      toast({ title: "Error", description: "Failed to start screen share", variant: "destructive" });
    }
  };

  const initializeViewer = async (session: ScreenShareSession) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const { data: currentSession } = await supabase
          .from('screen_share_sessions')
          .select('ice_candidates')
          .eq('id', session.id)
          .single();
        
        const existingCandidates = Array.isArray(currentSession?.ice_candidates) 
          ? (currentSession.ice_candidates as unknown[])
          : [];
        const candidates = [...existingCandidates, JSON.parse(JSON.stringify(event.candidate.toJSON()))];
        
        await supabase
          .from('screen_share_sessions')
          .update({ ice_candidates: candidates })
          .eq('id', session.id);
      }
    };
  };

  const handleSignaling = async (session: any) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    // Handle offer (viewer side)
    if (session.admin_offer && !pc.remoteDescription) {
      try {
        const offer = JSON.parse(session.admin_offer);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        await supabase
          .from('screen_share_sessions')
          .update({ client_answer: JSON.stringify(answer) })
          .eq('id', session.id);
      } catch (e) {
        console.error('Error handling offer:', e);
      }
    }

    // Handle answer (sharer side)
    if (session.client_answer && pc.localDescription && !pc.remoteDescription) {
      try {
        const answer = JSON.parse(session.client_answer);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (e) {
        console.error('Error handling answer:', e);
      }
    }

    // Handle ICE candidates
    if (session.ice_candidates && session.ice_candidates.length > 0) {
      for (const candidate of session.ice_candidates) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    }
  };

  const endSession = async (sessionId: string) => {
    await supabase
      .from('screen_share_sessions')
      .update({ 
        status: 'ended',
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    cleanupConnection();
    setActiveSession(null);
    setIsViewing(false);
    setGeneratedCode(null);
    toast({ title: "Session Ended", description: "Screen share session has ended" });
  };

  const cleanupConnection = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied", description: "Code copied to clipboard" });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" />
            Screen Share Support
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Help clients by viewing their screen remotely
          </p>
        </div>
      </div>

      {/* Instructions Card */}
      {!isViewing && (
        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-4">
            <div className="space-y-3">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">How Screen Share Works:</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="font-medium text-blue-800 dark:text-blue-200">📞 You're providing support:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
                    <li>Click "Generate Session Code"</li>
                    <li>Share the 6-digit code with your client (phone/email)</li>
                    <li>Wait for them to join — you'll see their screen</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-blue-800 dark:text-blue-200">🖥️ You need to share YOUR screen:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
                    <li>Ask support for a 6-digit code</li>
                    <li>Enter the code in "Join Session"</li>
                    <li>Select which screen/window to share</li>
                  </ol>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Session View */}
      {isViewing && activeSession && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-500">
                  <Eye className="h-3 w-3 mr-1" />
                  Live
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Session: {activeSession.session_code}
                </span>
              </div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => endSession(activeSession.id)}
              >
                <PhoneOff className="h-4 w-4 mr-1" />
                End Session
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-black rounded-lg aspect-video flex items-center justify-center">
              <video 
                ref={remoteVideoRef}
                autoPlay 
                playsInline
                className="w-full h-full rounded-lg"
              />
              {!remoteVideoRef.current?.srcObject && (
                <div className="absolute text-white flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span>Waiting for screen share...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session Creation/Join UI */}
      {!isViewing && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Admin: Create session for client */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Start Support Session
              </CardTitle>
              <CardDescription>
                Generate a code for your client to share their screen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedCode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-lg p-4 text-center">
                      <span className="text-3xl font-mono font-bold tracking-widest">
                        {generatedCode}
                      </span>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => copyCode(generatedCode)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Share this code with your client
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setGeneratedCode(null)}
                  >
                    Generate New Code
                  </Button>
                </div>
              ) : (
                <Button 
                  className="w-full"
                  onClick={() => createSession('admin')}
                >
                  Generate Session Code
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Join existing session */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Join Session
              </CardTitle>
              <CardDescription>
                Enter a code to view client's screen or share yours
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter 6-digit code"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="font-mono text-lg tracking-widest uppercase"
                />
                <Button onClick={joinSession} disabled={isConnecting}>
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Join"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Sessions List */}
      {sessions.length > 0 && !isViewing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div 
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                      {session.status}
                    </Badge>
                    <span className="font-mono">{session.session_code}</span>
                    <span className="text-sm text-muted-foreground">
                      {session.initiated_by === 'admin' ? 'Awaiting client' : 'Client waiting'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {session.status === 'pending' && session.admin_user_id === currentUserId && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => copyCode(session.session_code)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    {session.status === 'active' && (
                      <Button 
                        size="sm"
                        onClick={() => {
                          setActiveSession(session);
                          setIsViewing(true);
                          initializeViewer(session);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ScreenshareTab;
