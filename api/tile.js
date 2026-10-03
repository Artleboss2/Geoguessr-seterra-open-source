// api/tile.js — Vercel Serverless Function
// Proxy des tuiles de fond de carte : le navigateur appelle /api/tile?z=&x=&y=
// et c'est le serveur qui ajoute CARTO_API_KEY. La clé n'est jamais envoyée au client.

module.exports = async (req, res) => {
  const { z, x, y, r } = req.query;

  if (![z, x, y].every(v => /^\d{1,7}$/.test(String(v)))) {
    return res.status(400).send('Paramètres invalides');
  }
  const retina = r === '@2x' ? '@2x' : '';

  const key = process.env.CARTO_API_KEY;
  const query = key ? `?api_key=${encodeURIComponent(key)}` : '';
  const url = `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}${retina}.png${query}`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).end();

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('[api/tile]', err);
    return res.status(502).end();
  }
};
