import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { placeId } = await req.json();

    if (!placeId) throw new Error("No placeId provided");

    // FIX 1: Ensure the placeId always has the required "places/" prefix
    const formattedId = placeId.startsWith('places/') ? placeId : `places/${placeId}`;

    const response = await fetch(`https://places.googleapis.com/v1/${formattedId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY!,
        'X-Goog-FieldMask': 'editorialSummary,websiteUri,nationalPhoneNumber,rating,primaryTypeDisplayName'
      }
    });

    const details = await response.json();

    // FIX 2: If Google throws an error (like a 400 or 404), explicitly return an error status
    if (!response.ok) {
      console.error("Google API Error:", details);
      return new Response(JSON.stringify({ error: details }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(details), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400 
    });
  }
});