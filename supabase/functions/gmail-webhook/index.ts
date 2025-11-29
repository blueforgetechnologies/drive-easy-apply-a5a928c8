import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PubSubMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pubsubMessage: PubSubMessage = await req.json();
    
    // Decode Pub/Sub message
    const decodedData = atob(pubsubMessage.message.data);
    const notification = JSON.parse(decodedData);
    
    console.log('Gmail notification received:', notification);

    // Get Gmail access token (in production, store and refresh tokens properly)
    // For now, we'll fetch the email using a placeholder approach
    // You'll need to implement proper token storage and refresh logic

    // Parse email and store in database
    const { data: emailData, error: emailError } = await supabase
      .from('load_emails')
      .insert({
        email_id: notification.emailAddress + '_' + Date.now(),
        from_email: 'P.D@talbilogistics.com', // This should come from actual email parsing
        subject: 'Load notification',
        received_at: new Date().toISOString(),
        body_text: 'Email body will be parsed here',
        status: 'new'
      })
      .select()
      .single();

    if (emailError) {
      console.error('Error storing email:', emailError);
      throw emailError;
    }

    console.log('Load email stored:', emailData);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Gmail webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});