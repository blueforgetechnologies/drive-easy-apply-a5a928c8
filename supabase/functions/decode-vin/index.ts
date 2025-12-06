import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vin } = await req.json();

    if (!vin || vin.length !== 17) {
      return new Response(
        JSON.stringify({ error: 'Valid 17-character VIN is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Call the free NHTSA vPIC API
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
    );

    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract relevant fields from NHTSA response
    const results = data.Results || [];
    
    const getValue = (variableId: number): string | null => {
      const item = results.find((r: any) => r.VariableId === variableId);
      return item?.Value && item.Value.trim() !== '' ? item.Value.trim() : null;
    };

    const getValueByName = (name: string): string | null => {
      const item = results.find((r: any) => r.Variable === name);
      return item?.Value && item.Value.trim() !== '' ? item.Value.trim() : null;
    };

    // Check for errors in decode
    const errorCode = getValueByName('Error Code');
    if (errorCode && errorCode !== '0') {
      const errorText = getValueByName('Error Text');
      return new Response(
        JSON.stringify({ 
          found: false,
          error: errorText || 'VIN decode failed',
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    const vehicleData = {
      make: getValueByName('Make'),
      model: getValueByName('Model'),
      year: getValueByName('Model Year'),
      body_class: getValueByName('Body Class'),
      vehicle_type: getValueByName('Vehicle Type'),
      gvwr: getValueByName('Gross Vehicle Weight Rating From'),
      engine_cylinders: getValueByName('Engine Number of Cylinders'),
      engine_displacement: getValueByName('Displacement (L)'),
      fuel_type: getValueByName('Fuel Type - Primary'),
      drive_type: getValueByName('Drive Type'),
      doors: getValueByName('Doors'),
      manufacturer: getValueByName('Manufacturer Name'),
      plant_city: getValueByName('Plant City'),
      plant_state: getValueByName('Plant State'),
      plant_country: getValueByName('Plant Country'),
    };

    // Check if we got meaningful data
    const hasMeaningfulData = vehicleData.make || vehicleData.model || vehicleData.year;

    if (!hasMeaningfulData) {
      return new Response(
        JSON.stringify({ 
          found: false,
          error: 'No vehicle information found for this VIN',
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log('VIN decoded successfully:', vehicleData);

    return new Response(
      JSON.stringify({ 
        found: true,
        data: vehicleData
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error decoding VIN:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
