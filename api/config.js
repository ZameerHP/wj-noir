module.exports = (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    response.status(503).json({ error: 'Supabase is not configured.' });
    return;
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== 'https:') throw new Error('Supabase URL must use HTTPS.');
    response.status(200).json({ supabaseUrl: parsedUrl.origin, supabaseAnonKey });
  } catch (error) {
    console.error('Invalid SUPABASE_URL configuration.', error);
    response.status(500).json({ error: 'Supabase URL configuration is invalid.' });
  }
};
