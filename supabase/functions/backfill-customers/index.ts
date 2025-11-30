import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting customer backfill from load emails...');

    // Fetch all load emails with parsed data
    const { data: loadEmails, error: fetchError } = await supabase
      .from('load_emails')
      .select('parsed_data, from_email')
      .not('parsed_data', 'is', null);

    if (fetchError) {
      console.error('Error fetching load emails:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${loadEmails?.length || 0} emails to process`);

    // Extract unique customers
    const customersMap = new Map<string, any>();

    for (const email of loadEmails || []) {
      const data = email.parsed_data;
      const customerName = data?.customer;

      if (customerName && 
          customerName !== '- Alliance Posted Load' && 
          !customerName.includes('Name: </strong>') && 
          customerName.trim() !== '') {
        
        // Use customer name as key to avoid duplicates
        const key = customerName.toUpperCase().trim();
        
        if (!customersMap.has(key)) {
          customersMap.set(key, {
            name: customerName.trim(),
            email: data?.customer_email || null,
            email_secondary: data?.customer_email_secondary || null,
            phone: data?.customer_phone || null,
            phone_secondary: data?.customer_phone_secondary || null,
            phone_mobile: data?.customer_phone_mobile || null,
            contact_name: data?.customer_contact || null,
            address: data?.customer_address || null,
            city: data?.customer_city || null,
            state: data?.customer_state || null,
            zip: data?.customer_zip || null,
            status: 'active',
            notes: 'Auto-imported from load emails'
          });
        }
      }
    }

    console.log(`Found ${customersMap.size} unique customers`);

    // Check existing customers to avoid duplicates
    const { data: existingCustomers, error: existingError } = await supabase
      .from('customers')
      .select('name');

    if (existingError) {
      console.error('Error fetching existing customers:', existingError);
      throw existingError;
    }

    const existingNames = new Set(
      (existingCustomers || []).map(c => c.name.toUpperCase().trim())
    );

    // Filter out existing customers
    const newCustomers = Array.from(customersMap.values()).filter(
      customer => !existingNames.has(customer.name.toUpperCase().trim())
    );

    console.log(`${newCustomers.length} new customers to insert`);

    let insertedCount = 0;
    if (newCustomers.length > 0) {
      // Insert new customers
      const { error: insertError } = await supabase
        .from('customers')
        .insert(newCustomers);

      if (insertError) {
        console.error('Error inserting customers:', insertError);
        throw insertError;
      }

      insertedCount = newCustomers.length;
      console.log(`Successfully inserted ${insertedCount} new customers`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Backfill complete. Added ${insertedCount} new customers.`,
        total_unique: customersMap.size,
        already_existed: customersMap.size - insertedCount,
        newly_added: insertedCount
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in backfill-customers:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
