// api/tile.js — Vercel Serverless Function
// Proxy des tuiles de fond de carte : le navigateur appelle /api/tile?z=&x=&y=
// et c'est le serveur qui ajoute CARTO_API_KEY. La clé n'est jamais envoyée au client.
//
// Diagnostic : /api/tile?z=2&x=1&y=1&debug=1 affiche le statut renvoyé par CARTO
// (sans jamais afficher la clé).

module.exports = async (req, res) => {
  const { z, x, y, r, debug } = req.query;

  if (![z, x, y].every(v => /^\d{1,7}$/.test(String(v)))) {
    return res.status(400).send('Paramètres invalides');
  }
  const retina = r === '@2x' ? '@2x' : '';

  // Nettoie la clé : espaces, retours à la ligne et guillemets collés par erreur
  const key = (process.env.CARTO_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!key) return res.status(503).send('CARTO_API_KEY manquante');

  // Style sombre SANS noms (dark_nolabels), avec la clé en paramètre ?key=
  const path = `dark_nolabels/${z}/${x}/${y}${retina}.png`;
  const url = `https://a.basemaps.cartocdn.com/${path}?key=${encodeURIComponent(key)}`;

  // Si la clé est limitée à certains sites dans le tableau de bord CARTO,
  // CARTO vérifie l'en-tête Referer : on envoie celui de ton site.
  const referer = `https://${req.headers.host}/`;

  try {
    const upstream = await fetch(url, { headers: { Referer: referer } });
    const buffer = Buffer.from(await upstream.arrayBuffer());

    if (debug) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        carto_status: upstream.status,
        content_type: upstream.headers.get('content-type'),
        bytes: buffer.length,
        key_length: key.length,
        tile_path: path,
        referer_sent: referer
      });
    }

    if (!upstream.ok) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(upstream.status).end();
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('[api/tile]', err);
    return res.status(502).end();
  }
};
