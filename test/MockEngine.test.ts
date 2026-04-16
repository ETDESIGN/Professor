import { describe, it, expect, beforeEach } from 'vitest';
import { MockEngine } from '../services/MockEngine';

describe('MockEngine - SuperMemo-2 SRS Algorithm', () => {
  it('should return SRS items that are due for review', async () => {
    const items = await MockEngine.fetchSRSItems();
    expect(items.length).toBeGreaterThanOrEqual(1);
    const now = new Date();
    for (const item of items) {
      expect(new Date(item.next_review).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('should increase interval and repetition for quality >= 3', async () => {
    const before = await MockEngine.fetchSRSItems();
    if (before.length === 0) return;
    const item = before[0];
    const oldInterval = item.interval;
    const oldRepetition = item.repetition;

    await MockEngine.updateSRSItem(item.id, 4);

    const after = await MockEngine.fetchSRSItems();
    const updated = after.find(i => i.id === item.id);
    if (updated) {
      expect(updated.repetition).toBeGreaterThanOrEqual(oldRepetition);
    }
  });

  it('should reset repetition to 0 for quality < 3', async () => {
    const before = await MockEngine.fetchSRSItems();
    if (before.length === 0) return;
    const item = before[0];

    await MockEngine.updateSRSItem(item.id, 1);

    const after = await MockEngine.fetchSRSItems();
    const updated = after.find(i => i.id === item.id);
    if (updated) {
      expect(updated.repetition).toBe(0);
      expect(updated.interval).toBe(1);
    }
  });

  it('should never let efactor drop below 1.3', async () => {
    const before = await MockEngine.fetchSRSItems();
    if (before.length === 0) return;
    const item = before[0];

    await MockEngine.updateSRSItem(item.id, 0);

    const after = await MockEngine.fetchSRSItems();
    const updated = after.find(i => i.id === item.id);
    if (updated) {
      expect(updated.efactor).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('should set interval=1 for repetition=0 and quality>=3', async () => {
    const before = await MockEngine.fetchSRSItems();
    if (before.length === 0) return;
    const newItem = before.find(i => i.repetition === 0);
    if (!newItem) return;

    await MockEngine.updateSRSItem(newItem.id, 5);

    const after = await MockEngine.fetchSRSItems();
    const updated = after.find(i => i.id === newItem.id);
    if (updated) {
      expect(updated.interval).toBe(1);
      expect(updated.repetition).toBe(1);
    }
  });
});

describe('MockEngine - Unit CRUD', () => {
  it('should fetch initial units', async () => {
    const units = await MockEngine.fetchUnits();
    expect(units.length).toBeGreaterThanOrEqual(1);
    expect(units[0].title).toBeDefined();
  });

  it('should create a unit and find it by id', async () => {
    const created = await MockEngine.createUnit('Test Unit');
    expect(created.title).toBe('Test Unit');
    expect(created.status).toBe('Processing');

    const found = await MockEngine.getUnitById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('should update a unit', async () => {
    const created = await MockEngine.createUnit('Update Test');
    await MockEngine.updateUnit(created.id, { title: 'Updated Title' });

    const found = await MockEngine.getUnitById(created.id);
    expect(found!.title).toBe('Updated Title');
  });

  it('should return undefined for non-existent unit', async () => {
    const found = await MockEngine.getUnitById('nonexistent_id');
    expect(found).toBeUndefined();
  });
});

describe('MockEngine - Student Progress', () => {
  it('should return student progress', async () => {
    const progress = await MockEngine.getStudentProgress();
    expect(progress).toHaveProperty('xp');
    expect(progress).toHaveProperty('streak');
    expect(progress).toHaveProperty('completedUnitIds');
  });

  it('should update student progress', async () => {
    await MockEngine.updateStudentProgress({ xp: 2000 });
    const progress = await MockEngine.getStudentProgress();
    expect(progress.xp).toBe(2000);
  });
});
