// Unitization proposal algorithm (FIXPLAN_G, doc 11 §2). Pure TypeScript —
// NO Deno imports — shared by the propose-unitization edge function,
// vitest, and the frontend (types/pipeline.ts re-export).
//
// Deterministic, no AI. Two detection modes:
//   Mode A (any page carries a mission opener with a parseable unit
//   number): boundaries ONLY at openers whose unit number differs from the
//   current group's. Everything else — lesson labels ("Language practice
//   1"), stage tags ("STAGE 3"), exam labels ("A1 Movers") — never splits.
//   Mode B (no opener signal anywhere): boundaries at printed_unit_label
//   changes, only for unit-ish labels (/unit/i), for books without openers.
// Pages before the first boundary become the book-level setup group
// (welcome material — recorded, never feeds units/pools; doc 10 §5).

export interface UnitizeOpener {
  printed_unit_number?: string | null;
  printed_title?: string | null;
}

export interface UnitizePageInput {
  id: string;
  upload_order: number;
  printed_page_number?: string | null;
  printed_unit_label?: string | null;
  printed_title?: string | null;
  /** Non-removed mission_opener structures found on this page. */
  openers: UnitizeOpener[];
}

export interface UnitGroup {
  key: string;
  title: string;
  is_setup: boolean;
  pageIds: string[];
  fromPrinted: string | null;
  toPrinted: string | null;
  unitNumber: number | null;
}

/** "1", "Unit 2" parse; "STAGE 3", "", "Language practice 1" do not. */
const UNIT_NO_RE = /^\s*(?:unit\s*)?(\d{1,3})\s*$/i;

const norm = (s: unknown): string => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function isUnitNumber(raw: string | null | undefined): number | null {
  const m = UNIT_NO_RE.exec(String(raw ?? '').trim());
  return m ? parseInt(m[1], 10) : null;
}

export function proposeGroups(pages: UnitizePageInput[]): UnitGroup[] {
  const sorted = [...pages].sort((a, b) => a.upload_order - b.upload_order);
  if (sorted.length === 0) return [];

  // Mode A only when at least one opener carries a parseable unit number.
  const hasOpenerSignal = sorted.some((p) => p.openers.some((o) => isUnitNumber(o.printed_unit_number) != null));

  const setupPages: UnitizePageInput[] = [];
  const groups: UnitGroup[] = [];
  let current: UnitGroup | null = null;
  let currentLabel = '';

  const newGroup = (title: string, unitNumber: number | null): UnitGroup => ({
    key: `g${groups.length}-${unitNumber ?? 'x'}-${norm(title).slice(0, 24)}`,
    title,
    is_setup: false,
    pageIds: [],
    fromPrinted: null,
    toPrinted: null,
    unitNumber,
  });

  const closeCurrent = () => {
    if (current && current.pageIds.length > 0) groups.push(current);
    current = null;
  };

  for (const page of sorted) {
    let boundary: { n: number | null; title: string } | null = null;

    if (hasOpenerSignal) {
      for (const opener of page.openers) {
        const n = isUnitNumber(opener.printed_unit_number);
        if (n != null) {
          if (!current || current.unitNumber !== n) {
            const title = String(opener.printed_title ?? '').trim()
              || String(page.printed_title ?? '').trim()
              || `Unit ${n}`;
            boundary = { n, title };
          }
          break; // first valid opener on the page decides
        }
      }
    } else {
      const label = norm(page.printed_unit_label);
      if (label && /unit/i.test(label) && label !== currentLabel) {
        const n = isUnitNumber(label);
        boundary = {
          n,
          title: String(page.printed_title ?? '').trim() || String(page.printed_unit_label ?? '').trim(),
        };
        currentLabel = label;
      }
    }

    if (boundary) {
      closeCurrent();
      current = newGroup(boundary.title, boundary.n);
    }

    if (current) {
      current.pageIds.push(page.id);
      const printed = String(page.printed_page_number ?? '').trim() || null;
      if (printed) {
        if (current.fromPrinted == null) current.fromPrinted = printed;
        current.toPrinted = printed;
      }
    } else {
      setupPages.push(page);
    }
  }
  closeCurrent();

  // No boundary signal at all: one unit holding everything (teacher renames).
  if (groups.length === 0 && setupPages.length > 0) {
    const first = setupPages[0];
    const g = newGroup(
      String(first.printed_title ?? '').trim() || 'Unit 1',
      null,
    );
    g.pageIds = setupPages.map((p) => p.id);
    g.fromPrinted = String(first.printed_page_number ?? '').trim() || null;
    const last = setupPages[setupPages.length - 1];
    g.toPrinted = String(last.printed_page_number ?? '').trim() || null;
    return [g];
  }

  const result: UnitGroup[] = [];
  if (setupPages.length > 0) {
    const first = setupPages[0];
    const last = setupPages[setupPages.length - 1];
    result.push({
      key: 'g-setup',
      title: 'Welcome & class setup',
      is_setup: true,
      pageIds: setupPages.map((p) => p.id),
      fromPrinted: String(first.printed_page_number ?? '').trim() || null,
      toPrinted: String(last.printed_page_number ?? '').trim() || null,
      unitNumber: null,
    });
  }
  result.push(...groups);
  return result;
}
