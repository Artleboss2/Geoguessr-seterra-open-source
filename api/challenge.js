// api/challenges.js — Vercel Serverless Function
//
// GET  /api/challenges?q=europe&type=CAPITAL  -> recherche dans la base
// GET  /api/challenges?id=c_abc123            -> un challenge précis
// POST /api/challenges                        -> sauvegarde un challenge
//
// Les identifiants de la base restent côté serveur (variables d'environnement),
// ils ne sont jamais envoyés au navigateur.

const crypto = require('crypto');

// Vercel permet de choisir un préfixe personnalisé (ex: STORAGE_KV_REST_API_URL).
// On cherche donc toute variable qui se termine par le bon suffixe.
function findEnv(...suffixes) {
  const key = Object.keys(process.env).find(
    k => process.env[k] && suffixes.some(s => k.endsWith(s))
  );
  return key ? process.env[key] : undefined;
}

const KV_URL = findEnv('REST_API_URL', 'REST_URL');
const KV_TOKEN = findEnv('REST_API_TOKEN', 'REST_TOKEN');

const INDEX_KEY = 'challenges:index';
const MAX_RESULTS = 100;
const MAX_INDEX_SCAN = 500;

async function redis(command) {
  const response = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json.error || `Erreur base de données (${response.status})`);
  }
  return json.result;
}

function parse(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!KV_URL || !KV_TOKEN) {
    return res.status(503).json({ error: 'DB_NOT_CONFIGURED' });
  }

  try {
    // ---------- LECTURE / RECHERCHE ----------
    if (req.method === 'GET') {
      const { id, q, type } = req.query;

      if (id) {
        if (!/^[a-z0-9_]{3,40}$/i.test(id)) {
          return res.status(400).json({ error: 'ID invalide' });
        }
        const raw = await redis(['GET', `challenge:${id}`]);
        const challenge = parse(raw);
        if (!challenge) return res.status(404).json({ error: 'Introuvable' });
        return res.status(200).json({ challenge });
      }

      const ids = (await redis(['SMEMBERS', INDEX_KEY])) || [];
      if (ids.length === 0) return res.status(200).json({ challenges: [] });

      const keys = ids.slice(0, MAX_INDEX_SCAN).map(i => `challenge:${i}`);
      const raws = (await redis(['MGET', ...keys])) || [];

      const query = normalize(q);
      let list = raws.map(parse).filter(Boolean);

      if (type === 'COUNTRY' || type === 'CAPITAL') {
        list = list.filter(c => c.type === type);
      }
      if (query) {
        list = list.filter(c =>
          normalize(`${c.title} ${c.desc} ${c.author}`).includes(query)
        );
      }

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return res.status(200).json({ challenges: list.slice(0, MAX_RESULTS) });
    }

    // ---------- SAUVEGARDE ----------
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = parse(body);
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Corps de requête invalide' });
      }

      const title = cleanText(body.title, 80);
      const desc = cleanText(body.desc, 200);
      const author = cleanText(body.author, 40);
      const type = body.type === 'CAPITAL' ? 'CAPITAL' : 'COUNTRY';

      const countryIds = Array.isArray(body.countryIds)
        ? [...new Set(body.countryIds.filter(c => typeof c === 'string' && /^[A-Z]{3}$/.test(c)))]
        : [];

      if (!title) return res.status(400).json({ error: 'Titre requis' });
      if (countryIds.length < 2 || countryIds.length > 100) {
        return res.status(400).json({ error: 'Entre 2 et 100 pays requis' });
      }

      const id = 'c_' + crypto.randomBytes(5).toString('hex');
      const challenge = { id, title, type, desc, author, countryIds, createdAt: Date.now() };

      await redis(['SET', `challenge:${id}`, JSON.stringify(challenge)]);
      await redis(['SADD', INDEX_KEY, id]);

      return res.status(201).json({ id, challenge });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    console.error('[api/challenges]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
