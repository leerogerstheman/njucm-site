/**
 * njucm.org comment API — a Cloudflare Worker backed by D1 (SQLite).
 *
 * Routes (mounted at /api/* on njucm.org, so the browser sees same-origin and
 * no CORS preflight is needed):
 *
 *   GET    /api/comments?slug=<slug>   list approved comments for a page
 *   POST   /api/comments               create one   { slug, name, body, trap }
 *   DELETE /api/comments/<id>          remove one   (x-admin-token required)
 *
 * Design notes
 * ------------
 * - Anonymous by design: visitors do not need an account. Because of that the
 *   endpoint is the abuse surface, so it enforces, in order: an allowed origin,
 *   a body-size cap, field validation, a honeypot field, a submit-too-fast
 *   check, a link cap, and per-IP rate limits (hashed, never stored raw).
 * - Comments are plain text. The client renders them with textContent, and this
 *   API never returns HTML, so stored XSS is not possible by construction.
 * - MODERATION=1 flips new comments to `pending` so nothing appears until it is
 *   approved with the admin token.
 */

const MAX_BODY = 1000;
const MIN_BODY = 2;
const MAX_NAME = 24;
const MAX_LINKS = 2;
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_PER_WINDOW = 3;
const RATE_MAX_PER_DAY = 20;
const MIN_FILL_MS = 1500; // a human needs at least this long to type something
// Page slugs come from markdown filenames, so allow letters/digits (any script)
// plus dash and underscore. Bound as a query parameter either way, so this is
// validation rather than the injection barrier.
const SLUG_RE = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,63}$/u;

const DEFAULT_ORIGINS = 'https://njucm.org,https://www.njucm.org';

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-admin-token',
    'Access-Control-Max-Age': '86400',
  };
  // Same-origin requests send no Origin; those are fine. Cross-origin requests
  // only get the header back when they come from an allowed site.
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(extraHeaders || {}) },
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One-way IP fingerprint for rate limiting; the raw address is never stored. */
async function ipHash(request, env) {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    'unknown';
  return sha256Hex(ip + '|' + (env.IP_SALT || 'njucm-default-salt'));
}

function countLinks(text) {
  return (text.match(/https?:\/\//gi) || []).length;
}

function normaliseSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

function cleanText(value) {
  // Collapse runs of whitespace and strip control characters. Deliberately does
  // NOT truncate: length limits are enforced by the caller so that an over-long
  // body is rejected rather than silently cut short.
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function rowToComment(row) {
  return {
    id: row.id,
    name: row.name || null,
    body: row.body,
    createdAt: row.created_at,
    status: row.status,
  };
}

async function listComments(url, env, headers) {
  const slug = normaliseSlug(url.searchParams.get('slug'));
  if (!slug) return json({ error: 'bad_slug' }, 400, headers);

  const { results } = await env.DB.prepare(
    `SELECT id, name, body, created_at, status
       FROM comments
      WHERE slug = ?1 AND status = 'approved'
      ORDER BY created_at ASC
      LIMIT 500`
  )
    .bind(slug)
    .all();

  return json({ comments: (results || []).map(rowToComment) }, 200, headers);
}

async function createComment(request, env, headers) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad_json' }, 400, headers);
  }

  const slug = normaliseSlug(payload.slug);
  if (!slug) return json({ error: 'bad_slug' }, 400, headers);

  // Honeypot: a hidden field only a bot would fill in. Pretend it worked so the
  // bot does not learn anything, but store nothing.
  if (String(payload.trap || '').trim() !== '') {
    return json({ ok: true, comment: null, skipped: true }, 200, headers);
  }

  // Submitted implausibly fast => almost certainly scripted.
  const elapsed = Number(payload.elapsed);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS) {
    return json({ error: 'too_fast' }, 429, headers);
  }

  // A nickname is optional and harmless, so an over-long one is simply cut to
  // size; the comment body is the payload, so it is validated instead.
  const name = cleanText(payload.name).slice(0, MAX_NAME);
  const body = cleanText(payload.body);
  if (body.length < MIN_BODY) return json({ error: 'body_too_short' }, 400, headers);
  if (body.length > MAX_BODY) return json({ error: 'body_too_long' }, 400, headers);
  if (countLinks(body) > MAX_LINKS) return json({ error: 'too_many_links' }, 400, headers);

  const hash = await ipHash(request, env);
  const now = Date.now();

  const windowStart = new Date(now - RATE_WINDOW_MINUTES * 60_000).toISOString();
  const dayStart = new Date(now - 24 * 60 * 60_000).toISOString();

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ?1 AND created_at >= ?2`
  )
    .bind(hash, windowStart)
    .first();
  if (recent && recent.n >= RATE_MAX_PER_WINDOW) {
    return json({ error: 'rate_limited', retryAfterMinutes: RATE_WINDOW_MINUTES }, 429, headers);
  }

  const daily = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ?1 AND created_at >= ?2`
  )
    .bind(hash, dayStart)
    .first();
  if (daily && daily.n >= RATE_MAX_PER_DAY) {
    return json({ error: 'rate_limited', retryAfterMinutes: 60 }, 429, headers);
  }

  const status = env.MODERATION === '1' ? 'pending' : 'approved';
  const createdAt = new Date(now).toISOString();

  const inserted = await env.DB.prepare(
    `INSERT INTO comments (slug, name, body, created_at, status, ip_hash, user_agent)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     RETURNING id, name, body, created_at, status`
  )
    .bind(slug, name || null, body, createdAt, status, hash, cleanText(request.headers.get('User-Agent')).slice(0, 200))
    .first();

  const comment = inserted ? rowToComment(inserted) : null;
  return json({ ok: true, comment, pending: status !== 'approved' }, 201, headers);
}

async function deleteComment(id, request, env, headers) {
  const token = request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return json({ error: 'forbidden' }, 403, headers);
  }
  const result = await env.DB.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run();
  return json({ ok: true, deleted: result.meta ? result.meta.changes : 0 }, 200, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/api/comments' || url.pathname === '/api/comments/') {
      if (request.method === 'GET') return listComments(url, env, headers);
      if (request.method === 'POST') return createComment(request, env, headers);
      return json({ error: 'method_not_allowed' }, 405, headers);
    }

    const del = url.pathname.match(/^\/api\/comments\/(\d+)$/);
    if (del) {
      if (request.method !== 'DELETE') return json({ error: 'method_not_allowed' }, 405, headers);
      return deleteComment(del[1], request, env, headers);
    }

    if (url.pathname === '/api/health') {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM comments`).first();
      return json({ ok: true, comments: row ? row.n : null }, 200, headers);
    }

    return json({ error: 'not_found' }, 404, headers);
  },
};
