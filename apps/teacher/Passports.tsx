import React, { useMemo, useState } from 'react';
import {
    ArrowLeft, CreditCard, QrCode, Printer, RotateCcw, Eye, Plus, CheckCircle2, Circle,
} from 'lucide-react';
import { toast } from 'sonner';
import { ClassData } from '../../services/DataService';
import { PassportService, PassportCard } from '../../services/ManagementService';
import {
    usePassportsForClass, useRosterForClass, useCreatePassport, useResetPassport,
} from '../../hooks/useQueries';
import { PassportCardsModal, usePrintCards } from './PassportCards';

// =====================================================================
// Class "login cards" (passports) manager: grid of minted student/parent
// logins, bulk printing, per-student reset, and creation for roster rows
// that don't have cards yet.
// =====================================================================

const PassportsView: React.FC<{ cls: ClassData; onBack: () => void }> = ({ cls, onBack }) => {
    const { data: passports = [], isLoading } = usePassportsForClass(cls.id);
    const { data: roster = [] } = useRosterForClass(cls.id);
    const createPassport = useCreatePassport();
    const resetPassport = useResetPassport();
    const { printCards, portal } = usePrintCards();

    const [selected, setSelected] = useState<Set<string>>(new Set());
    // Cards to show in the success/preview modal (after Show / Reset / Create).
    const [modalCards, setModalCards] = useState<PassportCard[] | null>(null);
    const [modalTitle, setModalTitle] = useState('Login cards');
    const [printing, setPrinting] = useState(false);

    const rosterById = useMemo(() => new Map(roster.map((r) => [r.id, r])), [roster]);
    const activePassports = passports.filter((p) => p.status === 'active');
    const withoutCards = roster.filter(
        (r) => !passports.some((p) => p.roster_student_id === r.id && p.status === 'active')
    );

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const allSelected = activePassports.length > 0 && selected.size === activePassports.length;
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(activePassports.map((p) => p.roster_student_id)));

    const handlePrintSelected = async () => {
        if (!selected.size) return;
        try {
            setPrinting(true);
            const cards = await PassportService.getCards({ classId: cls.id }, true);
            const chosen = cards.filter((c) => selected.has(c.roster_student_id) && c.status !== 'revoked');
            await printCards(chosen);
        } catch { /* toast handled in service */ } finally {
            setPrinting(false);
        }
    };

    const handleShow = async (rosterId: string) => {
        try {
            const cards = await PassportService.getCards({ rosterId });
            if (!cards.length) {
                toast.error('No login cards found');
                return;
            }
            setModalTitle(cards[0].display_name || 'Login cards');
            setModalCards(cards);
        } catch { /* handled */ }
    };

    const handleReset = async (rosterId: string, name: string) => {
        if (!confirm(`Issue new passwords for ${name}? Their current cards will stop working.`)) return;
        try {
            const card = await resetPassport.mutateAsync({ rosterId, target: 'both', classId: cls.id });
            setModalTitle(`${card.display_name} — new cards`);
            setModalCards([card]);
        } catch { /* handled */ }
    };

    const handleCreate = async (rosterId: string, name: string, claimed: boolean) => {
        try {
            const card = await createPassport.mutateAsync({
                classId: cls.id,
                opts: { rosterId, createStudent: !claimed, createParent: true },
            });
            setModalTitle(`${name} — login cards ready`);
            setModalCards([card]);
        } catch { /* handled */ }
    };

    return (
        <div>
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1">
                <ArrowLeft size={14} /> Back to roster
            </button>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <QrCode size={22} className="text-teacher-primary" /> Login cards
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                            {cls.name} · {activePassports.length} student{activePassports.length === 1 ? '' : 's'} with cards
                        </p>
                    </div>
                    <button
                        onClick={handlePrintSelected}
                        disabled={!selected.size || printing}
                        className="px-4 py-2 bg-teacher-primary text-white rounded-lg text-sm font-bold hover:bg-pink-700 disabled:opacity-50 flex items-center gap-1.5"
                    >
                        <Printer size={15} /> {printing ? 'Preparing…' : `Print selected (${selected.size})`}
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="text-slate-400 text-sm">Loading login cards…</div>
            ) : activePassports.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CreditCard size={28} className="text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-800 mb-1">No login cards yet</h3>
                    <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
                        Create accounts with printable cards below, or add students from the roster screen.
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 cursor-pointer">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                        Select all
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {activePassports.map((p) => {
                            const r = rosterById.get(p.roster_student_id);
                            const name = r?.display_name || p.student_username || 'Student';
                            const isSel = selected.has(p.roster_student_id);
                            return (
                                <div
                                    key={p.id}
                                    className={`rounded-xl border-2 p-4 transition-colors ${isSel ? 'border-teacher-primary bg-pink-50/40' : 'border-slate-200'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <button onClick={() => toggle(p.roster_student_id)} className="flex items-start gap-2 text-left min-w-0">
                                            {isSel
                                                ? <CheckCircle2 size={20} className="text-teacher-primary shrink-0 mt-0.5" />
                                                : <Circle size={20} className="text-slate-300 shrink-0 mt-0.5" />}
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 truncate">{name}</div>
                                                <div className="text-xs text-slate-500 font-mono truncate">{p.student_username}</div>
                                            </div>
                                        </button>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            {p.parent_username ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-duo-blue/10 text-duo-blue">parent ✓</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">no parent</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={() => handleShow(p.roster_student_id)}
                                            className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center gap-1"
                                        >
                                            <Eye size={13} /> Show
                                        </button>
                                        <button
                                            onClick={() => handleReset(p.roster_student_id, name)}
                                            disabled={resetPassport.isPending}
                                            className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 flex items-center justify-center gap-1"
                                        >
                                            <RotateCcw size={13} /> Reset
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {withoutCards.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
                        Students without login cards ({withoutCards.length})
                    </h3>
                    <ul className="divide-y divide-slate-100">
                        {withoutCards.map((r) => (
                            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-800 truncate">{r.display_name}</div>
                                    <div className="text-xs text-slate-500">
                                        {r.claimed_profile_id ? 'Already has a home account (self-registered)' : 'No account yet'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleCreate(r.id, r.display_name, !!r.claimed_profile_id)}
                                    disabled={createPassport.isPending}
                                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teacher-primary text-white hover:bg-pink-700 disabled:opacity-50 flex items-center gap-1 shrink-0"
                                >
                                    <Plus size={13} /> {r.claimed_profile_id ? 'Parent login' : 'Create cards'}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <PassportCardsModal
                open={!!modalCards}
                title={modalTitle}
                subtitle="Print these cards and hand them to the family — the QR code logs in directly."
                cards={modalCards || []}
                onClose={() => setModalCards(null)}
            />
            {portal}
        </div>
    );
};

export default PassportsView;
