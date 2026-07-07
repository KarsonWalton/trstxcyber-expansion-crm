module.exports = function handler(req, res) {
  // Allow your frontend to read this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Pull keys from the Vercel Environment Variables dashboard
  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
  });
};