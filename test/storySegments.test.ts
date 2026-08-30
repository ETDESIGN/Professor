// Story segmentation tests (story fidelity, doc 10 §5): a verbatim passage
// splits into per-paragraph story pages bound to the scene illustrations the
// book prints beside them. Precision first — a scene only binds to the
// paragraph it was anchored to; unbound paragraphs fall back to no art.
import { describe, expect, it } from 'vitest';
import { segmentPassageByScenes } from '../supabase/functions/_shared/storySegments';
import type { SceneIllustration } from '../supabase/functions/_shared/bookScan';

const PASSAGE = [
  'One morning, Kipper found a big box in the garden.',
  'He opened it slowly. Inside was a shiny red tractor.',
  'Kipper drove the tractor all around the yard.',
  'At night, he parked it under the tree and smiled.',
].join('\n\n');

const ANCHORED_SCENES: SceneIllustration[] = [
  { anchor_text: 'One morning, Kipper found', bbox: [0.1, 0.1, 0.3, 0.2], visual_description: 'boy discovering a cardboard box' },
  { anchor_text: 'He opened it slowly', bbox: [0.1, 0.35, 0.3, 0.2], visual_description: 'boy opening the box, red tractor inside' },
  { anchor_text: 'At night, he parked it', bbox: [0.1, 0.7, 0.3, 0.2], visual_description: 'tractor parked under a tree at night' },
];

describe('segmentPassageByScenes', () => {
  it('cuts one page per paragraph; unillustrated paragraphs ride unanchored', () => {
    const segs = segmentPassageByScenes(PASSAGE, ANCHORED_SCENES);
    expect(segs.map((s) => s.sceneIndex)).toEqual([0, 1, null, 2]);
    expect(segs[0].text).toBe('One morning, Kipper found a big box in the garden.');
    expect(segs[1].text).toContain('He opened it slowly. Inside was a shiny red tractor.');
    expect(segs[2].text).toContain('Kipper drove the tractor all around the yard.');
    expect(segs[3].text).toContain('At night, he parked it under the tree and smiled.');
  });

  it('matches anchors tolerantly (case, whitespace) and keeps words verbatim', () => {
    const noisyScenes = ANCHORED_SCENES.map((s) => ({ ...s, anchor_text: s.anchor_text!.toUpperCase().replace(/ /g, '  ') }));
    const segs = segmentPassageByScenes(PASSAGE, noisyScenes);
    expect(segs.map((s) => s.sceneIndex)).toEqual([0, 1, null, 2]);
    expect(segs[0].text).toContain('One morning, Kipper found');
  });

  it('merges a title-sized lead into the first anchored paragraph', () => {
    const text = 'The Tractor\n\n' + PASSAGE;
    const scenes = [{ ...ANCHORED_SCENES[0] }];
    const segs = segmentPassageByScenes(text, scenes);
    expect(segs[0].text.startsWith('The Tractor One morning')).toBe(true);
    expect(segs[0].sceneIndex).toBe(0);
  });

  it('keeps substantial leading text as its own unillustrated page', () => {
    const lead = 'It was the first day of the holidays and anything could happen.';
    const segs = segmentPassageByScenes(lead + '\n\n' + PASSAGE, ANCHORED_SCENES);
    expect(segs[0].sceneIndex).toBeNull();
    expect(segs[0].text).toContain('first day of the holidays');
    expect(segs.slice(1).map((s) => s.sceneIndex)).toEqual([0, 1, null, 2]);
  });

  it('first scene wins when several scenes anchor the same paragraph', () => {
    const scenes = [
      { ...ANCHORED_SCENES[0] },
      { ...ANCHORED_SCENES[1], anchor_text: ANCHORED_SCENES[0].anchor_text },
    ];
    const segs = segmentPassageByScenes(PASSAGE, scenes);
    expect(segs[0].sceneIndex).toBe(0);
    expect(segs.every((s) => s.sceneIndex !== 1)).toBe(true);
  });

  it('cuts purely at anchor positions when the passage has no blank-line structure', () => {
    const oneBlock = PASSAGE.replace(/\n\n/g, ' ');
    const segs = segmentPassageByScenes(oneBlock, ANCHORED_SCENES);
    expect(segs.length).toBe(3);
    expect(segs.map((s) => s.sceneIndex)).toEqual([0, 1, 2]);
    expect(segs[2].text).toContain('At night, he parked it');
  });

  it('falls back to blank-line paragraphs paired by paragraph_index', () => {
    const scenes: SceneIllustration[] = [0, 1, 2, 3].map((i) => ({ paragraph_index: i, bbox: [0, 0, 0.2, 0.2], visual_description: `scene ${i}` }));
    const segs = segmentPassageByScenes(PASSAGE, scenes);
    expect(segs).toHaveLength(4);
    expect(segs.map((s) => s.sceneIndex)).toEqual([0, 1, 2, 3]);
  });

  it('zips scenes to paragraphs in order when v6 scenes carry no anchors or indexes', () => {
    const scenes: SceneIllustration[] = PASSAGE.split('\n\n').map((_, i) => ({ bbox: [0, i * 0.1, 0.2, 0.1] }));
    const segs = segmentPassageByScenes(PASSAGE, scenes);
    expect(segs).toHaveLength(4);
    expect(segs.map((s) => s.sceneIndex)).toEqual([0, 1, 2, 3]);
  });

  it('returns the whole passage with the first scene when nothing segments (v6 single block)', () => {
    const oneBlock = PASSAGE.replace(/\n\n/g, ' ');
    const segs = segmentPassageByScenes(oneBlock, [{ bbox: [0, 0, 0.3, 0.3] }]);
    expect(segs).toHaveLength(1);
    expect(segs[0].sceneIndex).toBe(0);
    expect(segs[0].text).toBe(oneBlock);
  });

  it('returns one unillustrated page when the passage has no scenes at all', () => {
    const segs = segmentPassageByScenes(PASSAGE, []);
    expect(segs).toHaveLength(1);
    expect(segs[0].sceneIndex).toBeNull();
  });

  it('ignores unusable anchors (too few words / not found) and binds only what resolved', () => {
    const scenes: SceneIllustration[] = [
      { anchor_text: 'zebra', bbox: [0, 0, 0.1, 0.1] }, // 1 word — unusable
      { ...ANCHORED_SCENES[1] },
      { anchor_text: 'Somewhere over the rainbow', bbox: [0, 0.5, 0.1, 0.1] }, // not in text
    ];
    const segs = segmentPassageByScenes(PASSAGE, scenes);
    expect(segs.some((s) => s.sceneIndex === 1)).toBe(true);
    expect(segs.every((s) => s.sceneIndex !== 0 && s.sceneIndex !== 2)).toBe(true);
  });

  it('never alters the words — segments reassemble the passage', () => {
    const segs = segmentPassageByScenes(PASSAGE, ANCHORED_SCENES);
    const reassembled = segs.map((s) => s.text).join(' ');
    expect(reassembled.replace(/\s+/g, ' ')).toBe(PASSAGE.replace(/\s+/g, ' '));
  });
});
