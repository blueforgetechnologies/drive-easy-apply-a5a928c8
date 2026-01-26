import { useState, useEffect, useRef, useCallback } from "react";
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

type MyRole = 'admin' | 'client' | null;

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
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  
  // ICE candidate queue for candidates received before remoteDescription is set
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  // Track which remote ICE candidates we've already processed (by serialized string)
  const processedIceCandidatesRef = useRef<Set<string>>(new Set());
  // My role in the session (determines which ICE column I write to)
  const myRoleRef = useRef<MyRole>(null);
  // Track if we've already created an answer (viewer side)
  const hasCreatedAnswerRef = useRef(false);
  // Filtered channel for active session signaling
  const activeSessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Keep ref in sync with state to avoid stale closure issues
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // General subscription for session list (pending/active sessions overview)
  useEffect(() => {
    loadCurrentUser();
    loadSessions();
    
    const channel = supabase
      .channel('screen-share-sessions-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'screen_share_sessions'
        },
        (payload) => {
          console.log('Session list update:', payload);
          // Update session list
          if (payload.eventType === 'INSERT') {
            setSessions(prev => [payload.new as ScreenShareSession, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setSessions(prev => prev.map(s => s.id === payload.new.id ? payload.new as ScreenShareSession : s));
          } else if (payload.eventType === 'DELETE') {
            setSessions(prev => prev.filter(s => s.id !== payload.old.id));
          }
          
          // Auto-enter viewer mode when session becomes active and I'm the admin
          const updatedSession = payload.new as ScreenShareSession;
          const userId = currentUserIdRef.current;
          if (
            payload.eventType === 'UPDATE' &&
            updatedSession.status === 'active' && 
            updatedSession.admin_user_id === userId &&
            userId !== null
          ) {
            setActiveSession(prev => {
              if (prev === null) {
                console.log('Auto-entering viewer mode');
                myRoleRef.current = 'admin';
                setIsViewing(true);
                setGeneratedCode(null);
                initializeViewer(updatedSession);
                return updatedSession;
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      cleanupConnection();
    };
  }, []);

  // Filtered subscription for active session signaling (only when we have an active session)
  useEffect(() => {
    if (!activeSession) {
      // Cleanup existing channel if session ends
      if (activeSessionChannelRef.current) {
        supabase.removeChannel(activeSessionChannelRef.current);
        activeSessionChannelRef.current = null;
      }
      return;
    }

    // Subscribe to only this specific session for signaling
    const channel = supabase
      .channel(`screen-share-signaling-${activeSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'screen_share_sessions',
          filter: `id=eq.${activeSession.id}`
        },
        (payload) => {
          console.log('Signaling update for active session:', payload);
          handleSignaling(payload.new);
        }
      )
      .subscribe();

    activeSessionChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      activeSessionChannelRef.current = null;
    };
  }, [activeSession?.id]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      currentUserIdRef.current = user.id;
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


  const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createSession = async (initiatedBy: 'admin' | 'client') => {
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

    const sessionData = {
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

  // Use SECURITY DEFINER RPC to claim session - bypasses RLS safely
  const joinSession = async () => {
    if (!sessionCode.trim()) {
      toast({ title: "Error", description: "Please enter a session code", variant: "destructive" });
      return;
    }

    setIsConnecting(true);

    // Call the RPC that handles all validation server-side
    const { data: rawResult, error: rpcError } = await supabase.rpc('screenshare_claim_session', {
      p_session_code: sessionCode.toUpperCase()
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      toast({ title: "Error", description: rpcError.message, variant: "destructive" });
      setIsConnecting(false);
      return;
    }

    // Cast the result to the expected shape
    const result = rawResult as unknown as { success: boolean; error?: string; session?: ScreenShareSession; role?: string } | null;

    if (!result?.success) {
      console.error('Claim failed:', result?.error);
      toast({ title: "Error", description: result?.error || "Failed to join session", variant: "destructive" });
      setIsConnecting(false);
      return;
    }

    console.log('Successfully claimed session:', result);

    const session = result.session!;
    const role = result.role as 'admin' | 'client';
    
    // Store my role for ICE candidate writing
    myRoleRef.current = role;

    setActiveSession(session);
    
    // Role determines who shares vs who views:
    // - 'client' role (joiner when admin initiated) -> shares screen (calls getDisplayMedia)
    // - 'admin' role (joiner when client initiated) -> views screen
    if (role === 'client') {
      // I'm the client joining admin's session -> I share my screen
      startScreenShare(session);
    } else {
      // I'm the admin joining client's session -> I view their screen
      setIsViewing(true);
      initializeViewer(session);
    }

    setSessionCode("");
    setIsConnecting(false);
  };

  // Write ICE candidate atomically via RPC (no read-modify-write race)
  const writeMyIceCandidate = async (sessionId: string, candidate: RTCIceCandidate) => {
    const role = myRoleRef.current;
    if (!role) {
      console.error('Cannot write ICE: role not set');
      return;
    }

    const candidateJson = JSON.parse(JSON.stringify(candidate.toJSON()));

    const { data, error } = await supabase.rpc('screenshare_append_ice', {
      p_session_id: sessionId,
      p_role: role,
      p_candidate: candidateJson
    });

    if (error) {
      console.error('Error appending ICE candidate:', error);
      return;
    }

    console.log(`Atomically appended ICE candidate for role ${role}`);
  };

  // Flush queued ICE candidates after remoteDescription is set
  const flushIceCandidateQueue = async (pc: RTCPeerConnection) => {
    const queue = iceCandidateQueueRef.current;
    console.log(`Flushing ${queue.length} queued ICE candidates`);
    
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Flushed queued ICE candidate');
      } catch (e) {
        console.warn('Error adding queued ICE candidate:', e);
      }
    }
    
    iceCandidateQueueRef.current = [];
  };

  // Process remote ICE candidates (from the OTHER peer's column)
  const processRemoteIceCandidates = async (session: any, pc: RTCPeerConnection) => {
    const myRole = myRoleRef.current;
    if (!myRole) return;

    // Read from the OTHER peer's column
    const remoteColumn = myRole === 'admin' ? 'client_ice_candidates' : 'admin_ice_candidates';
    const remoteCandidates = Array.isArray(session[remoteColumn]) ? session[remoteColumn] : [];

    for (const candidate of remoteCandidates) {
      const key = JSON.stringify(candidate);
      if (processedIceCandidatesRef.current.has(key)) {
        continue; // Already processed
      }
      processedIceCandidatesRef.current.add(key);

      if (pc.remoteDescription) {
        // Remote description set, add immediately
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Added remote ICE candidate');
        } catch (e) {
          console.warn('Error adding remote ICE candidate:', e);
        }
      } else {
        // Queue for later
        console.log('Queuing remote ICE candidate (no remoteDescription yet)');
        iceCandidateQueueRef.current.push(candidate);
      }
    }
  };

  // Called by the person SHARING their screen (the joiner when admin initiated)
  const startScreenShare = async (session: ScreenShareSession) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false
      });
      
      localStreamRef.current = stream;
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Sharer writes to client_ice_candidates (role is 'client')
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await writeMyIceCandidate(session.id, event.candidate);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Sharer connection state:', pc.connectionState);
      };

      // Create and send offer (sharer creates offer)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await supabase
        .from('screen_share_sessions')
        .update({ admin_offer: JSON.stringify(offer) })
        .eq('id', session.id);
      
      console.log('Offer sent');

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

  // Called by the person VIEWING (the admin who generated the code)
  const initializeViewer = async (session: ScreenShareSession) => {
    // Reset state for new session
    hasCreatedAnswerRef.current = false;
    iceCandidateQueueRef.current = [];
    processedIceCandidatesRef.current.clear();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      console.log('Received track:', event.track.kind);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      setHasRemoteStream(true);
    };

    // Viewer writes to admin_ice_candidates (role is 'admin')
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await writeMyIceCandidate(session.id, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Viewer connection state:', pc.connectionState);
    };

    // Check if offer is already available
    const { data: currentSession } = await supabase
      .from('screen_share_sessions')
      .select('*')
      .eq('id', session.id)
      .single();

    if (currentSession?.admin_offer) {
      await handleViewerOffer(pc, currentSession, session.id);
    }
  };

  // Viewer-specific: handle incoming offer and create answer (ONCE)
  const handleViewerOffer = async (pc: RTCPeerConnection, session: any, sessionId: string) => {
    if (hasCreatedAnswerRef.current) {
      console.log('Already created answer, skipping');
      return;
    }
    if (!session.admin_offer) {
      console.log('No offer yet');
      return;
    }
    if (pc.remoteDescription) {
      console.log('Remote description already set');
      return;
    }

    try {
      console.log('Viewer: setting remote description from offer');
      const offer = JSON.parse(session.admin_offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Flush any queued ICE candidates now that remoteDescription is set
      await flushIceCandidateQueue(pc);
      
      // Create answer ONCE
      hasCreatedAnswerRef.current = true;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      await supabase
        .from('screen_share_sessions')
        .update({ client_answer: JSON.stringify(answer) })
        .eq('id', sessionId);
      
      console.log('Viewer: answer sent');
    } catch (e) {
      console.error('Error handling offer (viewer):', e);
      hasCreatedAnswerRef.current = false; // Allow retry on error
    }
  };

  const handleSignaling = async (session: any) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const myRole = myRoleRef.current;

    // VIEWER LOGIC: receives offer, creates answer
    if (myRole === 'admin') {
      // Viewer only needs to handle the offer (once)
      if (session.admin_offer && !pc.remoteDescription) {
        await handleViewerOffer(pc, session, session.id);
      }
      // Viewer processes remote ICE from client
      await processRemoteIceCandidates(session, pc);
    }

    // SHARER LOGIC: receives answer
    if (myRole === 'client') {
      // Sharer receives answer
      if (session.client_answer && pc.localDescription && !pc.remoteDescription) {
        try {
          console.log('Sharer: setting remote description from answer');
          const answer = JSON.parse(session.client_answer);
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          
          // Flush any queued ICE candidates
          await flushIceCandidateQueue(pc);
          
          console.log('Sharer: answer applied');
        } catch (e) {
          console.error('Error handling answer (sharer):', e);
        }
      }
      // Sharer processes remote ICE from admin
      await processRemoteIceCandidates(session, pc);
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
    // Reset signaling state
    myRoleRef.current = null;
    hasCreatedAnswerRef.current = false;
    iceCandidateQueueRef.current = [];
    processedIceCandidatesRef.current.clear();
    setHasRemoteStream(false);
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
            <div className="bg-black rounded-lg aspect-video flex items-center justify-center relative">
              <video 
                ref={remoteVideoRef}
                autoPlay 
                playsInline
                className="w-full h-full rounded-lg"
              />
              {!hasRemoteStream && (
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
                  placeholder="ENTER 6-DIGIT CODE"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="font-mono text-center tracking-widest"
                />
                <Button onClick={joinSession} disabled={isConnecting}>
                  {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Sessions List */}
      {!isViewing && sessions.length > 0 && (
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
                    <span className="font-mono font-medium">{session.session_code}</span>
                    <span className="text-sm text-muted-foreground">
                      {session.status === 'pending' ? 'Awaiting client' : 'Connected'}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => copyCode(session.session_code)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
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
