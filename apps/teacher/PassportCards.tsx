import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Printer, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PassportCard } from '../../services/ManagementService';
import { buildLoginQrUrl } from '../../services/passport';
import { Modal } from './SharedUI';

// =====================================================================
// Printable login card — "Professor Academy Family Pocket Passport".
// Design spec: docs/design/qr-login-card-design-spec.md (Antigravity,
// 2026-09-15) + Stitch visual pass (docs/design/stitch-qr-passport/).
//
// ONE card per student, carrying BOTH logins for the family: the left
// panel is the student's Explorer Pass, the right panel the parent's
// Companion Pass — each with its own QR (the QR encodes
// {origin}/login#p=<base64url(username:password)>, so scanning it with
// any phone camera lands on the login page signed in).
//
// Layout: A5 landscape (210 × 148.5 mm). All internal sizes are
// multiples of --u ("1 design mm"): ~3.43 px for the on-screen preview,
// exactly 1 mm under @media print — so the preview and the printed
// sheet are the same geometry at different scales. Print sheets stack
// two cards per A4 portrait page with a centered cut guide (see
// src/index.css).
// =====================================================================

export interface PrintableCredential {
    username: string;
    password: string;
    qrDataUrl: string;
}

export interface PrintableCard {
    key: string;
    displayName: string;
    className: string;
    student: PrintableCredential | null;
    parent: PrintableCredential | null;
}

/** Pre-generate QR data URLs so printing never races image loads. */
export async function buildPrintableCards(cards: PassportCard[]): Promise<PrintableCard[]> {
    const makeCred = async (username: string, password: string): Promise<PrintableCredential> => ({
        username,
        password,
        qrDataUrl: await QRCode.toDataURL(buildLoginQrUrl(username, password), {
            margin: 1,
            // 30 mm print target → ~470 DPI at 560 px. Level Q survives
            // pencil marks and wrinkled pencil cases (spec §7.3).
            width: 560,
            errorCorrectionLevel: 'Q',
        }),
    });
    const out: PrintableCard[] = [];
    for (const card of cards) {
        out.push({
            key: card.roster_student_id,
            displayName: card.display_name,
            className: card.class_name || '',
            student: card.student ? await makeCred(card.student.username, card.student.password) : null,
            parent: card.parent ? await makeCred(card.parent.username, card.parent.password) : null,
        });
    }
    return out.filter((c) => c.student || c.parent);
}

// ── Inline SVG art (spec §5: pure vectors, no external images) ────────

const PassportMascot: React.FC<{ role: 'student' | 'parent'; className?: string }> = ({ role, className }) => {
    const student = role === 'student';
    return (
        <svg className={className ?? 'passport-mascot'} viewBox="0 0 100 90" aria-hidden="true">
            {/* antenna */}
            <line x1="50" y1="13" x2="50" y2="26" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <circle cx="50" cy="10" r="6" fill={student ? '#E91E63' : '#1CB0F6'} />
            {/* graduation cap (student only) */}
            {student && (
                <>
                    <polygon points="50,3 74,11 50,19 26,11" fill="#FFC800" stroke="#B45309" strokeWidth="1.5" strokeLinejoin="round" />
                    <line x1="74" y1="11" x2="76" y2="24" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="76" cy="26" r="2.4" fill="#E91E63" />
                </>
            )}
            {/* head */}
            <rect x="22" y="24" width="56" height="42" rx="12" fill="#38BDF8" stroke="#0284C7" strokeWidth="2" />
            <rect x="28" y="30" width="44" height="28" rx="8" fill="#E0F2FE" />
            {/* eyes + smile */}
            <circle cx={student ? 40 : 41} cy="42" r={student ? 5 : 4.5} fill="#0F172A" />
            <circle cx={student ? 60 : 59} cy="42" r={student ? 5 : 4.5} fill="#0F172A" />
            <circle cx={student ? 42 : 43} cy="40" r="1.8" fill="#FFFFFF" />
            <circle cx={student ? 62 : 61} cy="40" r="1.8" fill="#FFFFFF" />
            <path d={student ? 'M42 51 Q50 58 58 51' : 'M43 51 Q50 57 57 51'} stroke="#0F172A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            {/* waving hand (student) / held heart (parent) */}
            {student ? (
                <>
                    <circle cx="84" cy="38" r="6" fill="#38BDF8" stroke="#0284C7" strokeWidth="1.5" />
                    <path d="M80 32 Q78 28 81 26" stroke="#0284C7" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </>
            ) : (
                <path d="M78 48 C78 44, 82 42, 85 45 C88 42, 92 44, 92 48 C92 53, 85 57, 85 57 C85 57, 78 53, 78 48 Z" fill="#E91E63" stroke="#BE185D" strokeWidth="1" />
            )}
        </svg>
    );
};

const Sparkle: React.FC<{ x: string; y: string; s: number; color: string }> = ({ x, y, s, color }) => (
    <svg className="passport-sparkle" style={{ left: x, top: y, width: `${s}em`, height: `${s}em` }} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 0 L12.4 7.6 L20 10 L12.4 12.4 L10 20 L7.6 12.4 L0 10 L7.6 7.6 Z" fill={color} />
    </svg>
);

const ChipIcon: React.FC<{ kind: 'user' | 'key' }> = ({ kind }) => (
    <svg viewBox="0 0 24 24" className="passport-chip-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'user' ? (
            <>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
            </>
        ) : (
            <>
                <circle cx="8" cy="15" r="4.5" />
                <path d="M11.5 11.5 L20 3" />
                <path d="M16 4.5 L19.5 8" />
                <path d="M18 2.5 L21.5 6" />
            </>
        )}
    </svg>
);

const StarGlyph = () => (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" style={{ width: '1em', height: '1em' }}>
        <path d="M10 1 L12.6 7.4 L19.5 8 L14.3 12.6 L15.9 19.4 L10 15.9 L4.1 19.4 L5.7 12.6 L0.5 8 L7.4 7.4 Z" />
    </svg>
);

const HeartGlyph = () => (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" style={{ width: '1em', height: '1em' }}>
        <path d="M10 18 C10 18 1.5 12.5 1.5 6.8 C1.5 3.6 4 1.8 6.4 1.8 C8 1.8 9.3 2.7 10 4 C10.7 2.7 12 1.8 13.6 1.8 C16 1.8 18.5 3.6 18.5 6.8 C18.5 12.5 10 18 10 18 Z" />
    </svg>
);

// ── One pass panel (student or parent) ────────────────────────────────

interface PanelSpec {
    role: 'student' | 'parent';
    badge: string;
    bubble: string;
    guide: string;
}

const PassportPanel: React.FC<{ spec: PanelSpec; cred: PrintableCredential; alone: boolean }> = ({ spec, cred, alone }) => {
    const student = spec.role === 'student';
    return (
        <section className={`passport-panel ${student ? 'passport-student' : 'passport-parent'}`}>
            <div className="passport-panel-head">
                <div className="passport-role-badge">
                    {student ? <StarGlyph /> : <HeartGlyph />}
                    {spec.badge}
                </div>
            </div>
            <div className="passport-panel-body">
                <div className="passport-qr-cluster">
                    <div className="passport-bubble">{spec.bubble}</div>
                    <div className="passport-reticle">
                        <PassportMascot role={spec.role} className="passport-peek" />
                        <span className="reticle-corner reticle-tl" />
                        <span className="reticle-corner reticle-tr" />
                        <span className="reticle-corner reticle-bl" />
                        <span className="reticle-corner reticle-br" />
                        <img src={cred.qrDataUrl} alt={`${spec.role} login QR code`} className={`passport-qr ${alone ? 'passport-qr-solo' : ''}`} />
                    </div>
                    <div className="passport-mini-guide">{spec.guide}</div>
                </div>
                <div className="passport-chips">
                    <div className="passport-chip">
                        <ChipIcon kind="user" />
                        <div className="passport-chip-fields">
                            <span className="passport-chip-label">USERNAME</span>
                            <span className="passport-chip-value">{cred.username}</span>
                        </div>
                    </div>
                    <div className="passport-chip">
                        <ChipIcon kind="key" />
                        <div className="passport-chip-fields">
                            <span className="passport-chip-label">PASSWORD</span>
                            <span className="passport-chip-value">{cred.password}</span>
                        </div>
                    </div>
                </div>
            </div>
            {student ? (
                <>
                    <Sparkle x="2%" y="34%" s={0.75} color="#FFC800" />
                    <Sparkle x="96%" y="86%" s={0.6} color="#E91E63" />
                </>
            ) : (
                <>
                    <Sparkle x="96%" y="30%" s={0.6} color="#10B981" />
                    <Sparkle x="3%" y="88%" s={0.5} color="#10B981" />
                </>
            )}
        </section>
    );
};

// ── The card face ─────────────────────────────────────────────────────

export const PassportCardFace: React.FC<{ card: PrintableCard }> = ({ card }) => {
    const panels: PanelSpec[] = [];
    if (card.student) {
        panels.push({
            role: 'student',
            badge: 'STUDENT PASS',
            bubble: 'Scan to play! 🚀',
            guide: '1 Open camera · 2 Scan · 3 Learn!',
        });
    }
    if (card.parent) {
        panels.push({
            role: 'parent',
            badge: 'PARENT PASS',
            bubble: 'Scan to check! 📱',
            guide: '1 Open camera · 2 Scan · 3 Review',
        });
    }
    const alone = panels.length === 1;
    return (
        <div className="passport-card">
            {/* ZONE 1 — header: wordmark · name · class pill · family badge */}
            <header className="passport-header">
                <div className="passport-header-row">
                    <div className="passport-wordmark">
                        <span className="passport-app">PROFESSOR</span>
                        <span className="passport-tag">English Adventure</span>
                    </div>
                    {card.className && <div className="passport-class" title={card.className}>{card.className}</div>}
                    <div className="passport-family-badge">
                        <StarGlyph /> FAMILY PASS <HeartGlyph />
                    </div>
                </div>
                <div className="passport-name" title={card.displayName}>{card.displayName}</div>
            </header>

            {/* ZONE 2 — the two passes (or one, full width) */}
            <div className={`passport-panels ${alone ? 'passport-panels-single' : ''}`}>
                {panels.map((spec) => (
                    <PassportPanel key={spec.role} spec={spec} cred={card[spec.role]!} alone={alone} />
                ))}
                {!alone && (
                    <div className="passport-seam" aria-hidden="true">
                        <StarGlyph />
                        <HeartGlyph />
                    </div>
                )}
            </div>

            {/* ZONE 3 — footer */}
            <footer className="passport-footer">
                <span>
                    One card for the whole family — student side and parent side. Keep it safe!
                    {' '}Type the username &amp; password in the app if you can&apos;t scan.
                </span>
                <span className="passport-serial">PROFESSOR ENGLISH ADVENTURE · FAMILY PASSPORT</span>
            </footer>
        </div>
    );
};

/** Portal-rendered A4 sheets (2 × A5 cards + cut guide) — the ONLY thing visible during printing. */
const PrintPortal: React.FC<{ items: PrintableCard[] }> = ({ items }) => {
    const sheets: PrintableCard[][] = [];
    for (let i = 0; i < items.length; i += 2) sheets.push(items.slice(i, i + 2));
    return createPortal(
        <div className="passport-print-portal">
            {sheets.map((sheet, si) => (
                <div className="passport-sheet" key={si}>
                    {sheet.map((card) => <PassportCardFace key={card.key} card={card} />)}
                    {sheet.length === 2 && (
                        <div className="passport-cutline">
                            <span>✂ CUT HERE · 此处裁剪</span>
                        </div>
                    )}
                </div>
            ))}
        </div>,
        document.body
    );
};

/** Render printable cards and open the browser print dialog (Save-as-PDF works too). */
export const usePrintCards = () => {
    const [printItems, setPrintItems] = useState<PrintableCard[] | null>(null);

    useEffect(() => {
        if (!printItems) return;
        const done = () => setPrintItems(null);
        window.addEventListener('afterprint', done);
        // Let the QR images paint before the dialog freezes the page.
        const t = setTimeout(() => {
            window.print();
            done();
        }, 200);
        return () => {
            clearTimeout(t);
            window.removeEventListener('afterprint', done);
        };
    }, [printItems]);

    const printCards = async (cards: PassportCard[]) => {
        const items = await buildPrintableCards(cards);
        if (!items.length) {
            toast.error('No login cards to print');
            return;
        }
        setPrintItems(items);
    };

    const portal = printItems ? <PrintPortal items={printItems} /> : null;
    return { printCards, portal };
};

/**
 * Success modal shown right after creating or resetting a passport:
 * previews the exact cards and offers print / copy.
 */
export const PassportCardsModal: React.FC<{
    open: boolean;
    title: string;
    subtitle?: string;
    cards: PassportCard[];
    onClose: () => void;
}> = ({ open, title, subtitle, cards, onClose }) => {
    const [items, setItems] = useState<PrintableCard[]>([]);
    const { printCards, portal } = usePrintCards();

    useEffect(() => {
        if (open) void buildPrintableCards(cards).then(setItems);
        else setItems([]);
    }, [open, cards]);

    return (
        <>
            <Modal open={open} onClose={onClose} title={title} wide>
                {subtitle && <p className="text-sm text-slate-500 mb-4">{subtitle}</p>}
                <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
                    {items.map((card) => <PassportCardFace key={card.key} card={card} />)}
                    {items.length === 0 && <div className="text-sm text-slate-400">Preparing cards…</div>}
                </div>
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => printCards(cards)}
                        disabled={!items.length}
                        className="flex-1 py-3 bg-teacher-primary text-white rounded-lg font-bold hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <Printer size={18} /> Print cards
                    </button>
                    <button
                        onClick={() => {
                            const text = items
                                .map((c) => {
                                    const parts = [`${c.displayName}:`];
                                    if (c.student) parts.push(`  student — ${c.student.username} / ${c.student.password}`);
                                    if (c.parent) parts.push(`  parent  — ${c.parent.username} / ${c.parent.password}`);
                                    return parts.join('\n');
                                })
                                .join('\n');
                            navigator.clipboard.writeText(text);
                            toast.success('Logins copied');
                        }}
                        disabled={!items.length}
                        className="px-4 py-3 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <Copy size={16} /> Copy
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-3 text-center">
                    These passwords are shown only here — print or copy them now. Use “Reset” later to issue new cards.
                </p>
            </Modal>
            {portal}
        </>
    );
};
