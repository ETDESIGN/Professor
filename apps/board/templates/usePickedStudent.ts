import { useSession } from '../../../store/SessionContext';

/**
 * Resolve the currently-picked responder (quickWheelWinner) into a usable
 * { id, name, avatar } object, or null in choral/practice mode.
 *
 * Shared by the game templates so success messages can be personalized
 * ("Leo nailed it! +3 pts") instead of generic ("All Matched!").
 * Returns null when no responder is picked so callers can fall back gracefully.
 */
export interface PickedStudent {
  id: string;
  name: string;
  avatar: string;
}

export function usePickedStudent(): PickedStudent | null {
  const { state } = useSession();
  const id = state.quickWheelWinner;
  if (!id) return null;
  const s = (state.students || []).find((st: any) => st.id === id);
  if (!s) return null;
  return {
    id,
    name: s.name || s.full_name || s.display_name || 'Student',
    avatar: s.avatar || s.avatar_url || '',
  };
}
