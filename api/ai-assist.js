// Vercel serverless function (Node.js runtime).
// Calls the Gemini API server-side so GEMINI_API_KEY is never exposed to the browser.
// POST /api/ai-assist  { mode: 'suggest-recommendations' | 'improve-summary' | 'whats-missing', payload: {...} }

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 800;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fmtVideos(videos) {
  if (!Array.isArray(videos) || !videos.length) return '(no videos provided)';
  return videos
    .slice(0, 20)
    .map(v => `- "${v.title || 'Untitled'}" — views: ${v.views || 0}, watch hrs: ${v.watch || 0}, subs gained: ${v.subs || 0}, impressions: ${v.impressions || 0}, CTR: ${v.ctr || 0}%${v.notes ? `, notes: ${v.notes}` : ''}`)
    .join('\n');
}

function buildPrompt(mode, payload) {
  const p = payload || {};
  if (mode === 'suggest-recommendations') {
    return `You are a YouTube channel growth strategist writing recommendations for a client's monthly channel audit report.

Client: ${p.client || '(unnamed)'}
Period: ${p.period || '(unspecified)'}

Executive summary so far:
${p.summary || '(none written yet)'}

Top videos this period:
${fmtVideos(p.videos)}

Other notables:
${p.notables || '(none)'}

Existing recommendations (do not repeat these, build on or complement them):
${p.existingRecs || '(none yet)'}

Write 3 to 5 NEW, specific, actionable recommendations grounded in the data above. Each should follow the "Label: detail" convention (a short bolded label, colon, then one or two sentences of concrete detail) — e.g. "Double down on shorts: your two sub-60s uploads outperformed long-form by 3x on views per hour, consider a weekly shorts cadence." Avoid generic advice like "post more consistently" unless the data specifically supports it. Do not invent metrics that aren't in the data provided.

Respond with ONLY strict JSON, no markdown fences, no commentary, in this exact shape:
{"recommendations": ["Label: detail", "Label: detail", ...]}`;
  }

  if (mode === 'improve-summary') {
    return `You are an editor tightening the executive summary of a YouTube channel audit report for a client. The tone is professional, plain-language, confident but not hypey — internal video-editing agency writing to a creator client.

Client: ${p.client || '(unnamed)'}
Period: ${p.period || '(unspecified)'}

Current draft of the executive summary:
"""
${p.summary || '(empty)'}
"""

${p.videos && p.videos.length ? `For factual grounding, here are the top videos this period (do not add numbers that aren't here or in the draft above):\n${fmtVideos(p.videos)}` : ''}

Rewrite this draft to be tighter, clearer, and more compelling — fix awkward phrasing, cut filler, keep every concrete fact/number that's already present, and do not invent new facts or numbers. Keep it roughly the same length (do not pad it out). If the draft is empty, write a short placeholder-style paragraph noting that no data was provided, instead of inventing content.

Respond with ONLY strict JSON, no markdown fences, no commentary, in this exact shape:
{"improved": "the rewritten paragraph text"}`;
  }

  if (mode === 'whats-missing') {
    return `You are reviewing a draft YouTube channel audit report for completeness and quality before it's sent to a client. Here is the current content:

Client: ${p.client || '(empty)'}
Report title: ${p.title || '(empty)'}
Period: ${p.period || '(empty)'}

Executive summary:
"""
${p.summary || '(empty)'}
"""

Number of videos in top-videos table: ${p.videoCount ?? 0}

Other notables:
"""
${p.notables || '(empty)'}
"""

Recommendations:
"""
${p.recs || '(empty)'}
"""

Closing takeaway:
"""
${p.closing || '(empty)'}
"""

Deep-dive analysis sections: ${p.analysisSummary || '(none)'}

Flag anything that's empty, thin, generic, or likely to read poorly to a client — e.g. a summary with no concrete numbers, a recommendations list that's too short or vague, an analysis section with a title but no content, notables that don't follow the "Label: detail" convention. Do NOT flag things that are genuinely fine. Keep each flag to one short actionable sentence. If everything looks solid, return an empty array.

Respond with ONLY strict JSON, no markdown fences, no commentary, in this exact shape:
{"flags": ["short actionable note", ...]}`;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

function extractJson(text) {
  if (!text) throw new Error('Empty response from model');
  let cleaned = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if the model added them anyway.
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return JSON.parse(cleaned);
}

async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json'
    }
  });

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (networkErr) {
      lastErr = networkErr;
      if (attempt === MAX_RETRIES) throw networkErr;
      await sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * 250);
      continue;
    }

    if (res.status === 429 || res.status === 503) {
      lastErr = new Error(`Gemini returned ${res.status}`);
      if (attempt === MAX_RETRIES) break;
      const retryAfterHeader = res.headers.get('retry-after');
      const delayMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : BASE_DELAY_MS * 2 ** attempt + Math.random() * 250;
      await sleep(delayMs);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 500)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    return text;
  }

  throw new Error(`Gemini rate-limited after ${MAX_RETRIES + 1} attempts: ${lastErr?.message || 'unknown error'}`);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server not configured: missing GEMINI_API_KEY environment variable.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { mode, payload } = body || {};
  if (!mode) {
    res.status(400).json({ error: 'Missing "mode" in request body.' });
    return;
  }

  let prompt;
  try {
    prompt = buildPrompt(mode, payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  try {
    const rawText = await callGemini(prompt, apiKey);
    let parsed;
    try {
      parsed = extractJson(rawText);
    } catch {
      // Model didn't return clean JSON — fall back to raw text so the client can still show something.
      parsed = { raw: rawText };
    }
    res.status(200).json(parsed);
  } catch (err) {
    const isRateLimit = /429|rate-limited/i.test(err.message || '');
    res.status(isRateLimit ? 429 : 502).json({ error: err.message || 'AI request failed.' });
  }
};
