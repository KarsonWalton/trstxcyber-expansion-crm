module.exports = function handler(req, res) {
  // Enable CORS headers so your frontend can fetch it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Send the back-end environment variables securely
  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
  });
};