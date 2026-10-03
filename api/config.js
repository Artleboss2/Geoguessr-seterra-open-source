// api/config.js — Vercel Serverless Function
// Ne renvoie JAMAIS la clé Carto : indique seulement si elle est présente
// et si la base de données est configurée.

function findEnv(...suffixes) {
  const key = Object.keys(process.env).find(
    k => process.env[k] && suffixes.some(s => k.endsWith(s))
  );
  return key ? process.env[key] : undefined;
}

module.exports = (req, res) => {
  const dbConfigured = Boolean(
    findEnv('REST_API_URL', 'REST_URL') && findEnv('REST_API_TOKEN', 'REST_TOKEN')
  );

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    CARTO_PROXY: Boolean(process.env.CARTO_API_KEY),
    DB_CONFIGURED: dbConfigured
  });
};
