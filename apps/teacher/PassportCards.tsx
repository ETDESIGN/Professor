import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Printer, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PassportCard } from '../../services/ManagementService';
import { buildLoginQrUrl } from '../../services/passport';
import { Modal } from './SharedUI';

// =====================================================================
// Printable login cards ("passports"). One face per credential (student /
// parent). The QR encodes {origin}/login#p=<base64url(username:password)>,
// so scanning it with any phone camera lands on the login page signed in.
// =====================================================================

export interface PrintableCard {
    key: string;
    role: 'student' | 'parent';
    displayName: string;
    className: string;
    username: string;
    password: string;
    qrDataUrl: string;
}

/** Pre-generate QR data URLs so printing never races image loads. */
export async function buildPrintableCards(cards: PassportCard[]): Promise<PrintableCard[]> {
    const out: PrintableCard[] = [];
    for (const card of cards) {
        const entries: Array<{ role: 'student' | 'parent'; username: string; password: string }> = [];
        if (card.student) entries.push({ role: 'student', ...card.student });
        if (card.parent) entries.push({ role: 'parent', ...card.parent });
        for (const entry of entries) {
            const qrDataUrl = await QRCode.toDataURL(buildLoginQrUrl(entry.username, entry.password), {
                margin: 1,
                width: 320,
                errorCorrectionLevel: 'M',
            });
            out.push({
                key: `${card.roster_student_id}-${entry.role}`,
                role: entry.role,
                displayName: card.display_name,
                className: card.class_name || '',
                username: entry.username,
                password: entry.password,
                qrDataUrl,
            });
        }
    }
    return out;
}

export const PassportCardFace: React.FC<{ card: PrintableCard }> = ({ card }) => (
    <div className="passport-card bg-white border-2 border-slate-300 rounded-2xl overflow-hidden">
        <div className={`flex justify-between items-center px-4 py-2 ${card.role === 'student' ? 'bg-duo-green' : 'bg-duo-blue'} text-white`}>
            <span className="font-bold text-sm tracking-wide">
                {card.role === 'student' ? 'STUDENT LOGIN' : 'PARENT LOGIN'}
            </span>
            <span className="text-xs font-semibold opacity-90">Professor</span>
        </div>
        <div className="p-4 flex gap-4 items-center">
            <img src={card.qrDataUrl} alt="Login QR code" className="passport-qr w-28 h-28 shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800 truncate">{card.displayName}</div>
                {card.className && <div className="text-xs text-slate-500 mb-2 truncate">{card.className}</div>}
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Username</div>
                <div className="font-mono font-bold text-slate-900 leading-tight break-all">{card.username}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mt-1">Password</div>
                <div className="font-mono font-bold text-slate-900 leading-tight break-all">{card.password}</div>
            </div>
        </div>
        <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-200 text-[10px] leading-snug text-slate-500">
            Scan the QR code with a phone camera to log in, or type the username &amp; password in the app.
            Keep this card safe.
        </div>
    </div>
);

/** Portal-rendered sheet that is the ONLY thing visible during printing. */
const PrintPortal: React.FC<{ items: PrintableCard[] }> = ({ items }) =>
    createPortal(
        <div className="passport-print-portal">
            <div className="passport-grid">
                {items.map((card) => <PassportCardFace key={card.key} card={card} />)}
            </div>
        </div>,
        document.body
    );

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
            <Modal open={open} onClose={onClose} title={title}>
                {subtitle && <p className="text-sm text-slate-500 mb-4">{subtitle}</p>}
                <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
                    {items.map((card) => <PassportCardFace key={card.key} card={card} />)}
                    {items.length === 0 && <div className="text-sm text-slate-400">Preparing cards…</div>}
                </div>
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => printCards(cards)}
                        disabled={!items.length}
                        className="flex-1 py-3 bg-teacher-primary text-white rounded-lg font-bold hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <Printer size={18} /> Print cards
                    </button>
                    <button
                        onClick={() => {
                            const text = items
                                .map((c) => `${c.displayName} (${c.role}): ${c.username} / ${c.password}`)
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
