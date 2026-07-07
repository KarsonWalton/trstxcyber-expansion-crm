import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle browser CORS preflight requests
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { query, ne, sw } = await req.json();

    const response = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY!,
        // We include places.name here so Google hands back the unique ID
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.name'
      },
      body: JSON.stringify({
        textQuery: query,
        locationRestriction: {
          rectangle: {
            low: { latitude: sw.lat, longitude: sw.lng },
            high: { latitude: ne.lat, longitude: ne.lng }
          }
        }
      })
    });

    const data = await response.json();
    
    // Process and map the results safely for frontend usage
    const results = (data.places || []).map((p: any) => ({
      name: p.displayName?.text || 'Unknown Business',
      formatted_address: p.formattedAddress || 'No Address Provided',
      geometry: { 
        location: { 
          lat: p.location?.latitude, 
          lng: p.location?.longitude 
        } 
      },
      place_id: p.name // Crucial! Maps Google's resource id to place_id for app.js
    }));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400 
    });
  }
});