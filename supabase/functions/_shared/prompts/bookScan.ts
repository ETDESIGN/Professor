// Book-fidelity extraction prompts (FIXPLAN_F P1.3, doc 10 §4/§7).
//
// Pure strings — no Deno imports — so the prompt-quota lint test can read
// them from vitest. HARD RULES (doc 10 §3) enforced by wording:
//   * verbatim reproduction, never generation
//   * NO quotas — any hard number here is a bug (doc 10 principle 4)
//   * absence = absence — empty arrays are the correct answer when nothing
//     is present
import { STRUCTURE_TYPES, type StructureType } from '../bookScan.ts';

export const INVENTORY_PROMPT = {
  id: 'inventory-v2',
  version: 2,
  systemPrompt: `You are a precise vision scanner for children's ESL/EFL textbook pages (ages 6-12). Your ONLY job is to determine WHICH pedagogical structures are present on the page and WHERE they are. You are a detector, not a transcriber: in this pass you capture no content text.

Detect these structure kinds:
- vocab_set: ANY labelled word-picture pairing — lesson word sets under a "Vocabulary" header, the numbered word strips that accompany songs (words with little circled numbers are the song's target words — capture them all), word rows beside reading passages, labelled scenes (family members, colours, classroom objects), and routines/schedule charts (capture the ACTIVITY words shown with pictures — "go to school", "have lunch" — not the clock times). If words are shown with small pictures anywhere on the page, there is a vocab_set there.
- comic: a sequence of story panels with speech bubbles
- grammar_box: a boxed grammar rule, usually with example sentences
- song_sheet: a song or chant — lyrics in verses or numbered/lettered action lines, often with small illustrations. Songs may have NO explicit "song" label: a repeated-verse structure ("How often ... how often ...") or a rhyming chant with a play illustration IS a song_sheet. Song pages usually ALSO have a vocab_set word strip — detect BOTH.
- reading_passage: a titled continuous story text, usually with scene illustrations and follow-up activities
- printed_activity: a numbered instruction directing a task ("Listen and point.", "Match.", "Circle...") — detect EACH separate activity on the page
- review_statements: "I can ..." self-assessment statements
- mission_opener: a unit opener / project mission splash (large artwork, unit title, mission description)
- character_appearance: a recurring character shown large enough to describe visually
- clil_passage: a content-subject (CLIL, e.g. "Our World") passage — its own word set / word strip is a SEPARATE vocab_set structure (detect both the clil_passage and the vocab_set)
- dialogue_sequence: a dialogue in speech bubbles or labelled lines OUTSIDE a comic

Rules:
- Report each detected structure once, with a bounding box.
- Mixed pages are the NORM: report every structure that is present. A single page often holds a vocab_set AND a song_sheet, or a reading_passage AND a vocab_set AND printed activities.
- If none are present, return an empty structures array. Never invent structures to fill the page.
- Do not limit counts in any way: the page holds however many structures it holds.
- Also read the page's own printed labels (page number, unit label, title) as METADATA only.

Output ONLY a JSON object, nothing else:
{
  "structures": [
    { "type": "<one of the kinds listed above>", "bbox": [x, y, w, h], "confidence": <0.0-1.0>, "hint": "<a few words>" }
  ],
  "page_labels": { "printed_page_number": "", "printed_unit_label": "", "printed_title": "" }
}

bbox format: [x, y, w, h] with values normalized to 0.0-1.0 relative to the FULL page image, origin at the TOP-LEFT corner: x = left edge, y = top edge, w = width, h = height.`,
  userPromptTemplate:
    'Scan this textbook page and report which structures are present and where. Output ONLY the JSON object.',
} as const;

const TYPE_SCHEMA_BLOCKS: Record<StructureType, string> = {
  vocab_set: `[vocab_set]
{ "set_label": "<name of the word set, from the page's lesson header if present>", "lesson_header": "<header text if present>", "items": [ { "word": "<exact spelling; multi-word items such as 'have a shower' are allowed and expected>", "picture_bbox": [x,y,w,h] } ] }
Transcribe EVERY word that is shown with a picture — including numbered word strips beside songs, word rows beside passages, and labelled scenes. Do not stop early, do not skip any, do not stop at any count. The WORD is the priority: if you cannot locate a word's picture precisely, still emit the word and omit its picture_bbox — never drop a word because of its box.
Items must be TEACHABLE WORDS OR PHRASES, exactly as printed:
- Keep printed phrases COMPLETE: a strip item like "read a comic" or "write an email" is ONE item — never emit just part of it ("a comic").
- Do NOT include poster/scene TITLES or place labels of whole scenes ("BOOK CLUB", "CLASSROOM"), activity headings, or question-form captions ("Feed Fred the fish?") — those are not vocabulary items.`,
  comic: `[comic]
{ "panels": [ { "order_index": 0, "bbox": [x,y,w,h], "narration": "<narration box text if any>", "bubbles": [ { "bbox": [x,y,w,h], "speaker": "<speaker name if identifiable, else null>", "text": "<exact bubble text>" } ] } ] }
List panels in reading order. Transcribe every bubble word-for-word.`,
  grammar_box: `[grammar_box]
{ "rule_text": "<the rule or heading exactly as printed in the box; if the box has no rule/heading, leave empty and put ALL sentences in example_sentences>", "example_sentences": [ "<sentence exactly as printed>" ] }`,
  song_sheet: `[song_sheet]
{ "title": "<song title exactly as printed; if no title is printed, use the first line of the lyrics>", "lyrics": "<full lyrics verbatim, preserving line breaks and the little circled numbers if present>", "action_lines": [ { "text": "<the lyric line>", "illustration_bbox": [x,y,w,h] } ] }
Only include action_lines for lines that have their own illustration.`,
  reading_passage: `[reading_passage]
{ "title": "<story title if present>", "passage_text": "<the full passage verbatim>", "scene_illustrations": [ { "bbox": [x,y,w,h], "caption": "<caption if any>", "paragraph_index": <0-based index of the passage paragraph this illustration depicts>, "anchor_text": "<the opening words of that paragraph, copied word-for-word from passage_text>", "visual_description": "<EXHAUSTIVE description of THIS illustration: characters with appearance and clothing colors, actions, setting, objects, mood, art style — written so an artist could redraw it without seeing the book>" } ], "activities": [ { "instruction": "<exact printed instruction>", "verb": "<listen|point|read|match|circle|order|choose|write|say>", "content": "<what the activity operates on>" } ], "set_label": "<label of the passage's own word strip, if present>", "items": [ { "word": "<exact spelling, complete phrase>", "picture_bbox": [x,y,w,h] } ] }
scene_illustrations.visual_description powers story-page artwork: the BOOK CROP is the default illustration, and when a crop is unsuitable the description regenerates the scene faithfully (doc 10 §5 image default). Describe every scene exhaustively.
Each story paragraph gets its own artwork downstream, so capture EVERY scene illustration the page shows, in reading order — the passage holds however many it holds. Anchor each scene to the paragraph it illustrates: paragraph_index counts the paragraphs of passage_text in reading order starting at 0 (the blank-line-separated blocks as printed, or the page's logical paragraph breaks), and anchor_text copies the opening words of that paragraph exactly as printed. Every scene MUST also carry its bbox — the exact region of the page that illustration occupies (best estimate when unsure); a scene without a bbox cannot show the book's artwork to the child.
items = the word strip that belongs to this passage, when one is printed beside or under it (omit when there is no such strip). Every labelled word-picture pair counts — keep printed phrases complete and exclude scene/poster titles. Never drop a word because of its box.`,
  printed_activity: `[printed_activity]
{ "instruction": "<the exact printed instruction>", "verb": "<the instruction verb, e.g. listen|point|stick|count|match|order|choose|describe|say|colour|find|ask>", "content": "<the material the activity operates on, described neutrally>" }`,
  review_statements: `[review_statements]
{ "statements": [ "<each 'I can ...' statement exactly as printed>" ] }`,
  mission_opener: `[mission_opener]
{ "mission_text": "<the mission/project text verbatim>", "printed_unit_number": "<unit number printed on the page, metadata only>", "printed_title": "<the printed unit title>", "opener_art_bbox": [x,y,w,h] }`,
  character_appearance: `[character_appearance]
{ "name": "<the character's name if printed or identifiable, else null>", "visual_description": "<EXHAUSTIVE visual description of THIS depiction: physical appearance, facial features, hair, clothing with colors and garments, species, approximate age, pose, art style. Write it so an artist could redraw this exact character without seeing the page.>" }`,
  clil_passage: `[clil_passage]
{ "title": "<passage title>", "passage_text": "<full passage verbatim>", "scene_illustrations": [ { "bbox": [x,y,w,h], "caption": "<caption if any>", "paragraph_index": <0-based index of the passage paragraph this illustration depicts>, "anchor_text": "<the opening words of that paragraph, copied word-for-word from passage_text>", "visual_description": "<EXHAUSTIVE description of THIS illustration: subjects, actions, setting, objects, labels, mood, art style — written so an artist could redraw it without seeing the book>" } ], "activities": [ { "instruction": "...", "verb": "...", "content": "..." } ], "set_label": "<the CLIL word set's label>", "items": [ { "word": "<exact spelling>", "picture_bbox": [x,y,w,h] } ] }
Capture EVERY scene illustration the page shows, in reading order, each anchored to the paragraph it illustrates (paragraph_index counts passage_text paragraphs from 0; anchor_text copies that paragraph's opening words exactly). Every scene MUST carry its bbox — the exact region of the page that illustration occupies (best estimate when unsure) — and visual_description powers the artwork fallback, so describe each scene exhaustively.
items = the passage's OWN word set: look for the labelled word strip beside or under the passage and transcribe all of it. If a word's picture cannot be located precisely, still emit the word and omit picture_bbox.`,
  dialogue_sequence: `[dialogue_sequence]
{ "lines": [ { "speaker": "<speaker label/name if shown>", "text": "<exact line text>", "bbox": [x,y,w,h] } ] }
List lines in conversation order.`,
};

/**
 * Build the stage-2 (verbatim extraction) prompt for a specific set of
 * detected structure types — only their schemas are included, so the model
 * never sees instructions for absent structures.
 */
export function buildStructureExtractionPrompt(detectedTypes: StructureType[]): {
  systemPrompt: string;
  userPromptTemplate: string;
} {
  const schemaBlocks = STRUCTURE_TYPES.filter((t) => detectedTypes.includes(t))
    .map((t) => TYPE_SCHEMA_BLOCKS[t])
    .join('\n\n');

  return {
    systemPrompt: `You are a faithful transcriber of children's ESL/EFL textbook pages. You reproduce EXACTLY what is printed — word-for-word, preserving spelling, punctuation, capitalization, and line breaks. You NEVER invent, complete, translate, summarize, or paraphrase content. You NEVER impose counts: transcribe as many items as the page actually shows, and return empty arrays for anything absent. A truncated answer is useless — output the complete closing brackets and braces.`,
    userPromptTemplate: `This page was already scanned. These structures were detected:

{{inventoryJson}}

For EACH detected structure, extract its content following its schema:

${schemaBlocks}

Rules:
- Transcribe word-for-word. Multi-word lexical items are allowed and expected.
- Keep the detected bboxes where accurate; refine them if they are clearly off. All bboxes stay normalized [x, y, w, h], origin top-left.
- Return the same structures that were detected — do not add structure types that were not detected, do not drop any.
- Empty content must be represented as an empty array or empty string, never as invented content.

Output ONLY a JSON object:
{ "structures": [ { "structure_type": "<type>", "bbox": [x,y,w,h], "order_index": <int>, "confidence": <0.0-1.0>, "set_label": "<vocab sets only: the set's label>", "data": { <the per-type schema from above> } } ] }`,
  };
}
