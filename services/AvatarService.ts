import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import {
  AvatarBody,
  AvatarConfig,
  AvatarItem,
  AvatarRarity,
  AvatarSlot,
  normalizeConfig,
} from './avatarCore';

const log = createClientLogger('AvatarService');

interface ShopItemsRow {
  id: string;
  name: string;
  category?: string | null;
  cost: number;
  description?: string | null;
  icon?: string | null;
  slot?: string | null;
  rarity?: string | null;
  kind?: string | null;
  compatible_bodies?: string[] | null;
  layer_asset_path?: string | null;
  preview_url?: string | null;
  sort_order?: number | null;
  active?: boolean | null;
  unlock_type?: string | null;
}

function toItem(row: ShopItemsRow): AvatarItem {
  return {
    id: row.id,
    name: row.name,
    slot: (row.slot || null) as AvatarSlot | null,
    kind: (row.kind || 'item') as AvatarItem['kind'],
    rarity: (row.rarity || null) as AvatarRarity | null,
    cost: row.cost ?? 0,
    description: row.description ?? null,
    compatible_bodies: (row.compatible_bodies || []) as AvatarBody[],
    layer_asset_path: row.layer_asset_path ?? null,
    preview_url: row.preview_url ?? null,
    unlock_type: (row.unlock_type || 'gems') as AvatarItem['unlock_type'],
    sort_order: row.sort_order ?? 0,
  };
}

interface RpcResult {
  ok?: boolean;
  error?: string;
  config?: unknown;
}

export const AvatarService = {
  /** Active catalog (items + bases). Throws on transport failure so react-query
   *  can render a retry state — never silently empty. */
  async getCatalog(): Promise<AvatarItem[]> {
    const { data, error } = await supabase
      .from('shop_items')
      .select('*')
      .eq('active', true)
      .in('kind', ['item', 'base', 'powerup'])
      .order('sort_order', { ascending: true });
    if (error) {
      log.error('avatar_catalog_error', { error: error.message });
      throw error;
    }
    return (data || []).map(toItem);
  },

  async getMyAvatar(): Promise<{ config: AvatarConfig; url: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { config: normalizeConfig(null), url: null };
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_config, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      log.warn('my_avatar_read_failed', { error: error.message });
      return { config: normalizeConfig(null), url: null };
    }
    // Legacy rows: avatar_config may be '{}' or hold the old builder shape.
    return { config: normalizeConfig(data?.avatar_config), url: (data?.avatar_url as string) || null };
  },

  async setBody(body: AvatarBody): Promise<{ ok: boolean; config?: AvatarConfig; error?: string }> {
    const { data, error } = await supabase.rpc('set_avatar_body', { p_body: body });
    if (error) {
      log.warn('set_avatar_body_failed', { error: error.message });
      return { ok: false, error: error.message };
    }
    const res = (data || {}) as RpcResult;
    return { ok: !!res.ok, config: res.config ? normalizeConfig(res.config) : undefined, error: res.error };
  },

  async setSkin(skin: number): Promise<{ ok: boolean; config?: AvatarConfig; error?: string }> {
    const { data, error } = await supabase.rpc('set_avatar_skin', { p_skin: skin });
    if (error) {
      log.warn('set_avatar_skin_failed', { error: error.message });
      return { ok: false, error: error.message };
    }
    const res = (data || {}) as RpcResult;
    return { ok: !!res.ok, config: res.config ? normalizeConfig(res.config) : undefined, error: res.error };
  },

  /** Equip an owned/free item in its slot; itemId null unequips p_slot. */
  async equip(itemId: string | null, slot: AvatarSlot): Promise<{ ok: boolean; config?: AvatarConfig; error?: string }> {
    const { data, error } = await supabase.rpc('equip_item', { p_item_id: itemId, p_slot: slot });
    if (error) {
      log.warn('equip_item_failed', { error: error.message });
      return { ok: false, error: error.message };
    }
    const res = (data || {}) as RpcResult;
    return { ok: !!res.ok, config: res.config ? normalizeConfig(res.config) : undefined, error: res.error };
  },

  /**
   * Render the CURRENT persisted config server-side (cached by config hash).
   * The config must be saved to profiles BEFORE calling — the edge reads the
   * profile row itself, so there is exactly one source of truth.
   */
  async compose(): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: { action: 'compose-avatar' },
    });
    if (error || !data?.ok || !data?.url) {
      log.warn('compose_avatar_failed', { error: error?.message || data?.error });
      return null;
    }
    return data.url as string;
  },
};
