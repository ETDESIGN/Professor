#!/usr/bin/env node
// harvest-catalog.mjs — DEVELOPER-TIME CURATION TOOL (run manually, residential connection).
//
// Purpose: build/review the kids-ESL song seed catalog (`catalog-seed.json`)
// for the media-resolution design (docs/superpowers/specs/2026-09-04-youtube-media-resolution-design.md).
//
// How it works:
//   1. For each curated (topic, query) pair below, fetch the YouTube search
//      results page ONCE (same as a person browsing) and parse the structured
//      results (videoId, title, channel, duration, views).
//   2. Rank candidates: ESL-specific channels first, sane song duration
//      (45s-8min), then views.
//   3. Keep the best N per topic, then VALIDATE each via the keyless public
//      oEmbed endpoint (title/author/thumbnail; 404 drops the entry).
//   4. Emit scripts/media/catalog-seed.json for OWNER REVIEW + seeding.
//
// This is NOT product infrastructure: nothing in the deployed app scrapes.
// The seed script that runs at deploy time only re-verifies via oEmbed.
//
// Usage: node scripts/media/harvest-catalog.mjs [--keep N] [--out FILE]
// Politeness: ~800ms between search fetches, ~150ms between oEmbed probes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const KEEP = Number(process.argv.includes('--keep') ? process.argv[process.argv.indexOf('--keep') + 1] : 3) || 3;
const OUT = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'scripts/media/catalog-seed.json');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Channel preference tiers for ranking (ESL value first). Names are matched
// loosely (lowercased substring) against the result's channel/owner text.
const CHANNEL_TIERS = [
  ['super simple songs', 'super simple', 'noodle & pals', 'the singing walrus', 'singing walrus',
   'dream english kids', 'dream english', 'wow english tv', 'steve and maggie', 'elf kids videos',
   'elf learning', 'maple leaf learning', 'english singsing', 'super simple play'],
  ['jack hartmann', 'the learning station', 'harry kindergarten', 'miss linky', 'pancake manor',
   'barefoot books', 'sesame street', 'sesame'],
  ['bounce patrol', 'pinkfong', 'cocomelon', 'little baby bum', 'chuchu tv', 'kids tv', 'blippi', 'nat kids'],
];

const topicQueries = [
  { topic: 'greetings',     ages: ['toddler', 'early_primary'], queries: ['hello song for kids super simple songs', 'hello hello can you clap your hands super simple songs', 'hello song singing walrus'] },
  { topic: 'goodbye',       ages: ['toddler', 'early_primary'], queries: ['goodbye song for kids super simple songs', 'see you later goodbye song for classroom kids'] },
  { topic: 'abc',           ages: ['toddler', 'early_primary'], queries: ['the alphabet song super simple songs', 'abc phonics song dream english kids'] },
  { topic: 'numbers',       ages: ['toddler', 'early_primary'], queries: ['counting 1 to 10 song for kids super simple songs', 'counting 1 to 20 song for kids super simple songs', 'ten in the bed super simple songs'] },
  { topic: 'colors',        ages: ['toddler', 'early_primary'], queries: ['i see something blue super simple songs', 'i see something pink super simple songs', 'colors song for kids singing walrus'] },
  { topic: 'shapes',        ages: ['early_primary'],            queries: ['the shape song 1 super simple songs', 'shapes song for kids dream english'] },
  { topic: 'family',        ages: ['toddler', 'early_primary'], queries: ['finger family super simple songs', 'family finger family song for kids'] },
  { topic: 'body',          ages: ['toddler', 'early_primary'], queries: ['one little finger super simple songs', 'head shoulders knees and toes song for kids super simple songs'] },
  { topic: 'animals_farm',  ages: ['toddler', 'early_primary'], queries: ['old macdonald had a farm super simple songs', 'the animals on the farm super simple songs'] },
  { topic: 'animals_zoo',   ages: ['early_primary'],            queries: ["let's go to the zoo super simple songs", 'walking in the jungle super simple songs'] },
  { topic: 'animals_sea',   ages: ['toddler', 'early_primary'], queries: ['the jellyfish song super simple songs', 'baby shark pinkfong'] },
  { topic: 'weather',       ages: ['early_primary'],            queries: ["how's the weather super simple songs", 'rain rain go away super simple songs'] },
  { topic: 'seasons',       ages: ['early_primary'],            queries: ['the four seasons song for kids', 'seasons song singing walrus'] },
  { topic: 'food',          ages: ['toddler', 'early_primary'], queries: ['do you like broccoli ice cream super simple songs', 'apples and bananas song for kids super simple', 'are you hungry super simple songs'] },
  { topic: 'fruit',         ages: ['toddler', 'early_primary'], queries: ['fruit song dream english kids', 'down by the bay super simple songs'] },
  { topic: 'clothes',       ages: ['early_primary'],            queries: ['put on your shoes super simple songs', 'clothes song dream english kids'] },
  { topic: 'transport',     ages: ['toddler', 'early_primary'], queries: ['the wheels on the bus song for kids super simple songs', 'down by the station dream english kids'] },
  { topic: 'house',         ages: ['early_primary'],            queries: ['this is my house song dream english kids', 'in on under song for kids super simple'] },
  { topic: 'school',        ages: ['early_primary'],            queries: ['school song back to school for kids super simple', 'this is the way we go to school song'] },
  { topic: 'toys',          ages: ['toddler', 'early_primary'], queries: ['my toys song dream english kids', 'toys song for kids esl'] },
  { topic: 'feelings',      ages: ['early_primary'],            queries: ["if you're happy and you know it super simple songs", 'feelings song emotions for kids super simple', 'how do you feel today song esl'] },
  { topic: 'actions',       ages: ['toddler', 'early_primary'], queries: ['walking walking song super simple songs', 'we all fall down super simple songs', 'action verbs song dream english'] },
  { topic: 'daily_routine', ages: ['early_primary'],            queries: ['this is the way we brush our teeth song for kids', 'wash your hands song for kids super simple'] },
  { topic: 'days',          ages: ['early_primary'],            queries: ['days of the week song singing walrus', 'days of the week song for kids super simple'] },
  { topic: 'months',        ages: ['early_primary'],            queries: ['months of the year song singing walrus', 'months of the year song dream english'] },
  { topic: 'time',          ages: ['early_primary'],            queries: ['hickory dickory dock super simple songs', 'telling time song for kids esl'] },
  { topic: 'halloween',     ages: ['early_primary'],            queries: ['knock knock trick or treat super simple songs', 'go away spooky goblin super simple songs'] },
  { topic: 'christmas',     ages: ['toddler', 'early_primary'], queries: ['jingle bells song for kids super simple', 'we wish you a merry christmas super simple songs', 'santa shark pinkfong'] },
  { topic: 'birthday',      ages: ['toddler', 'early_primary'], queries: ['happy birthday song for kids super simple songs'] },
  { topic: 'cleanup',       ages: ['toddler', 'early_primary'], queries: ['clean up song for kids super simple songs', 'tidy up song for classroom kids'] },
  { topic: 'manners',       ages: ['early_primary'],            queries: ['please and thank you song super simple songs', 'sorry excuse me song for kids esl'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

function parseDuration(text) {
  // "1:10:11" | "2:25" -> seconds
  if (!text) return null;
  const parts = String(text).split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseViews(text) {
  // "1,104,809,890 views" -> 1104809890
  const m = String(text || '').replace(/,/g, '').match(/([\d.]+)\s*(K|M|B)?/);
  if (!m) return 0;
  let n = Number(m[1]);
  if (m[2] === 'K') n *= 1e3;
  if (m[2] === 'M') n *= 1e6;
  if (m[2] === 'B') n *= 1e9;
  return Math.round(n);
}

function collectVideoRenderers(obj, out) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) { for (const x of obj) collectVideoRenderers(x, out); }
    else {
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'videoRenderer' && v?.videoId) out.push(v);
        else collectVideoRenderers(v, out);
      }
    }
  }
}

function channelTier(channel) {
  const c = (channel || '').toLowerCase();
  for (let t = 0; t < CHANNEL_TIERS.length; t++) {
    if (CHANNEL_TIERS[t].some((n) => c.includes(n))) return t;
  }
  return CHANNEL_TIERS.length; // unknown
}

async function searchOnce(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
  if (!res.ok) throw new Error(`search HTTP ${res.status} for "${query}"`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error(`no ytInitialData for "${query}"`);
  const renderers = [];
  collectVideoRenderers(JSON.parse(m[1]), renderers);
  return renderers.slice(0, 10).map((v) => ({
    videoId: v.videoId,
    title: v?.title?.runs?.[0]?.text || '',
    channel: v?.ownerText?.runs?.[0]?.text || v?.longBylineText?.runs?.[0]?.text || '',
    channelId: v?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
      || v?.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
    durationSec: parseDuration(v?.lengthText?.simpleText),
    views: parseViews(v?.viewCountText?.simpleText),
    live: Boolean(v?.badges?.some((b) => b?.metadataBadgeRenderer?.label === 'LIVE'))
      || !v?.lengthText?.simpleText,
  }));
}

async function oembedVerify(videoId) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetchWithTimeout(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
    { headers: { 'user-agent': UA } }, 8000);
  if (!res.ok) return { ok: false, status: res.status };
  const j = await res.json();
  return { ok: true, title: j.title, author: j.author_name, thumbnailUrl: j.thumbnail_url, watch };
}

// ——— main ———
const byVideo = new Map();
let searches = 0, failures = [];

for (const group of topicQueries) {
  for (const q of group.queries) {
    try {
      const results = await searchOnce(q);
      searches++;
      const usable = results.filter((r) =>
        !r.live && r.title && r.durationSec !== null && r.durationSec >= 45 && r.durationSec <= 480
        && channelTier(r.channel) < CHANNEL_TIERS.length); // keep known channels only
      const ranked = usable.sort((a, b) =>
        (channelTier(a.channel) - channelTier(b.channel))
        || (a.durationSec - b.durationSec)
        || (b.views - a.views));
      for (const r of ranked.slice(0, KEEP)) {
        const prev = byVideo.get(r.videoId);
        if (prev) {
          if (!prev.topics.includes(group.topic)) prev.topics.push(group.topic);
          continue;
        }
        byVideo.set(r.videoId, { ...r, topics: [group.topic], ageBands: group.ages, sourceQuery: q });
      }
      process.stdout.write(`  ✓ [${group.topic}] "${q}" -> ${ranked.slice(0, KEEP).map((r) => `${r.videoId} ${r.channel} ${r.durationSec}s`).join(' | ')}\n`);
    } catch (e) {
      failures.push({ query: q, error: String(e.message || e) });
      process.stdout.write(`  ✗ [${group.topic}] "${q}" — ${e.message}\n`);
    }
    await sleep(800);
  }
}

// oEmbed validation pass
const entries = [];
const oembedFail = [];
for (const [videoId, r] of byVideo) {
  const v = await oembedVerify(videoId);
  if (!v.ok) { oembedFail.push({ videoId, status: v.status, title: r.title }); continue; }
  entries.push({
    videoId,
    url: v.watch,
    title: v.title,
    channel: v.author,
    channelId: r.channelId,
    thumbnailUrl: v.thumbnailUrl,
    durationSec: r.durationSec,
    topics: [...new Set(r.topics)],
    ageBands: r.ageBands,
    language: 'en',
    source: 'seed',
    sourceQuery: r.sourceQuery,
  });
  await sleep(150);
}

// channel rollup for the analysis doc
const byChannel = {};
for (const e of entries) {
  byChannel[e.channel] = byChannel[e.channel] || { count: 0, channelIds: new Set() };
  byChannel[e.channel].count++;
  if (e.channelId) byChannel[e.channel].channelIds.add(e.channelId);
}

const doc = {
  _note: 'GENERATED by scripts/media/harvest-catalog.mjs (developer-time curation; every entry oEmbed-verified). REVIEWED-BY-OWNER required before seeding. Entry fields match the media-resolution design §4.3.',
  generatedAt: new Date().toISOString(),
  stats: {
    topics: [...new Set(topicQueries.flatMap((g) => [g.topic]))].length,
    searches, kept: entries.length, droppedByOembed: oembedFail.length, searchFailures: failures,
    perChannel: Object.fromEntries(Object.entries(byChannel).map(([c, v]) =>
      [c, { count: v.count, channelIds: [...v.channelIds] }])),
  },
  entries,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`\nWrote ${OUT}: ${entries.length} verified entries across ${doc.stats.topics} topics.`);
if (oembedFail.length) console.log('oEmbed drops:', JSON.stringify(oembedFail));
if (failures.length) console.log('search failures:', JSON.stringify(failures));
