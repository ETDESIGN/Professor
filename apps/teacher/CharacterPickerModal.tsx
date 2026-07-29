
import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Search, User, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Character, CharacterService } from '../../services/CharacterService';
import { toast } from 'sonner';

/**
 * CharacterPickerModal — Phase 1.1-3 (locked L1).
 *
 * The single surface a teacher uses to pick a character from the BOOK's cast
 * (a recurring, cross-unit entity) wherever a character is needed: a story
 * speaker, a dialogue line, or "add to this unit". Shows the book's cast as
 * cards (portrait + name + role) + an inline "Create new character" form so a
 * teacher never has to leave the modal to add someone.
 *
 * Why book-scoped: course books have recurring characters; the same character
 * must be referenceable across units. The picker reads the book's library, not
 * a per-unit list — picking the same "Jenny" in unit 1 and unit 5 links the
 * same library row, giving true continuity.
 */
interface CharacterPickerModalProps {
    /** The unit whose book's cast we're picking from. */
    unitId: string;
    /** Optional: a name pre-selected (e.g. a story speaker already filled in). */
    selectedName?: string;
    onClose: () => void;
    /** Called with the picked character. Caller decides what to do (set speaker, link to unit, etc.). */
    onSelect: (character: Character) => void;
    /** If true, picking also links the character to the unit (unit_characters). Default true. */
    linkToUnit?: boolean;
}

const CharacterPickerModal: React.FC<CharacterPickerModalProps> = ({
    unitId, selectedName, onClose, onSelect, linkToUnit = true,
}) => {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookId, setBookId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newChar, setNewChar] = useState({ name: '', role: '', personality: '', look_prompt: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const bid = await (await import('../../services/CharacterService')).getUnitBookId(unitId);
            setBookId(bid);
            if (bid) {
                const list = await CharacterService.listForBook(bid);
                setCharacters(list);
            } else {
                setCharacters([]);
            }
        } catch (err: any) {
            toast.error(`Failed to load characters: ${err?.message || err}`);
        } finally {
            setLoading(false);
        }
    }, [unitId]);

    useEffect(() => { load(); }, [load]);

    const filtered = query.trim()
        ? characters.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) ||
              (c.role || '').toLowerCase().includes(query.toLowerCase()))
        : characters;

    const handlePick = async (character: Character) => {
        try {
            if (linkToUnit) {
                await CharacterService.linkUnit(unitId, character.id);
            }
            onSelect(character);
            onClose();
        } catch (err: any) {
            toast.error(`Failed to pick character: ${err?.message || err}`);
        }
    };

    const handleCreate = async () => {
        if (!bookId) { toast.error('This unit has no book to add a character to.'); return; }
        if (!newChar.name.trim()) { toast.error('Character name is required.'); return; }
        setCreating(true);
        try {
            const created = await CharacterService.create(bookId, {
                name: newChar.name.trim(),
                role: newChar.role.trim() || null,
                personality: newChar.personality.trim() || null,
                look_prompt: newChar.look_prompt.trim() || null,
            });
            if (linkToUnit) {
                await CharacterService.linkUnit(unitId, created.id);
            }
            toast.success(`Created "${created.name}"`);
            setNewChar({ name: '', role: '', personality: '', look_prompt: '' });
            setShowCreate(false);
            await load();
            onSelect(created);
            onClose();
        } catch (err: any) {
            toast.error(`Create failed: ${err?.message || err}`);
        } finally {
            setCreating(false);
        }
    };

    const portrait = (c: Character) =>
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(c.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-white w-full max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-slate-100">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <User size={20} className="text-indigo-500" /> Pick a character
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {bookId ? 'From this book\u2019s recurring cast' : 'No book bound to this unit'}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Search + create */}
                    <div className="p-4 border-b border-slate-100 space-y-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                value={query} onChange={e => setQuery(e.target.value)}
                                placeholder="Search characters..."
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        {!showCreate ? (
                            <button
                                onClick={() => setShowCreate(true)}
                                disabled={!bookId}
                                className="w-full py-2 rounded-lg border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-600 text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                            >
                                <Plus size={16} /> Create new character
                            </button>
                        ) : (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <input value={newChar.name} onChange={e => setNewChar({ ...newChar, name: e.target.value })} placeholder="Name *" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={newChar.role} onChange={e => setNewChar({ ...newChar, role: e.target.value })} placeholder="Role (e.g. teacher)" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                    <input value={newChar.personality} onChange={e => setNewChar({ ...newChar, personality: e.target.value })} placeholder="Personality" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <input value={newChar.look_prompt} onChange={e => setNewChar({ ...newChar, look_prompt: e.target.value })} placeholder="Visual description (look prompt) — keeps the character consistent across units" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                <div className="flex gap-2 pt-1">
                                    <button onClick={handleCreate} disabled={creating} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                        {creating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Add to cast
                                    </button>
                                    <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-slate-500 text-sm hover:text-slate-700">Cancel</button>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Cast grid */}
                    <div className="flex-1 overflow-auto p-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-12 text-slate-400">
                                <Loader2 className="animate-spin" /> <span className="ml-2 text-sm">Loading cast...</span>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <User size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">{query ? 'No characters match your search.' : 'No characters yet. Create one above.'}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {filtered.map(c => {
                                    const isSelected = selectedName && c.name.toLowerCase() === selectedName.toLowerCase();
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => handlePick(c)}
                                            className={`relative p-3 rounded-xl border-2 text-left transition-all hover:border-indigo-400 hover:shadow-md ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                                        >
                                            {isSelected && <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full" />}
                                            <img src={portrait(c)} alt={c.name} className="w-12 h-12 rounded-full mx-auto mb-2 bg-slate-100" />
                                            <div className="text-center">
                                                <div className="font-semibold text-sm text-slate-800 truncate">{c.name}</div>
                                                {c.role && <div className="text-[11px] text-slate-500 capitalize">{c.role}</div>}
                                                {c.personality && <div className="text-[10px] text-slate-400 truncate">{c.personality}</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default CharacterPickerModal;
