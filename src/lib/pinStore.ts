import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Account-bound PIN storage.
 * PIN hashes live in the database (table: user_pins) so they follow the account
 * across devices instead of being stuck on one phone.
 */

const LEGACY_KEYS = ['user_pin_hash', 'transaction_pin_hash'];

type PinCache = {
  userId: string | null;
  appPinHash: string | null;
  transactionPinHash: string | null;
  loaded: boolean;
};

const cache: PinCache = {
  userId: null,
  appPinHash: null,
  transactionPinHash: null,
  loaded: false,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.error('pinStore listener error', e);
    }
  });
}

export function subscribePinStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function hashPin(pin: string): Promise<string> {
  const saltedPin = pin + 'sm_data_salt_2024';

  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(saltedPin);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('crypto.subtle unavailable, using fallback hash');
  }

  let hash = 0;
  for (let i = 0; i < saltedPin.length; i++) {
    const char = saltedPin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return 'fallback_' + Math.abs(hash).toString(16).padStart(8, '0');
}

/** Wipe any device-bound PIN left over from older app versions. */
function clearLegacyLocalPins() {
  LEGACY_KEYS.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch (e) {
      /* ignore */
    }
  });
}

export function resetPinCache() {
  cache.userId = null;
  cache.appPinHash = null;
  cache.transactionPinHash = null;
  cache.loaded = false;
  clearLegacyLocalPins();
  emit();
}

/** Load the signed-in user's PIN hashes from the database. */
export async function loadPinsForUser(userId?: string | null): Promise<void> {
  clearLegacyLocalPins();

  let uid = userId ?? null;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? null;
  }

  if (!uid) {
    resetPinCache();
    return;
  }

  // Different account than the cached one -> drop old values immediately
  if (cache.userId && cache.userId !== uid) {
    cache.appPinHash = null;
    cache.transactionPinHash = null;
    cache.loaded = false;
    emit();
  }

  cache.userId = uid;

  const { data, error } = await supabase
    .from('user_pins')
    .select('app_pin_hash, transaction_pin_hash')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) {
    console.error('loadPinsForUser error:', error);
    return;
  }

  cache.appPinHash = data?.app_pin_hash ?? null;
  cache.transactionPinHash = data?.transaction_pin_hash ?? null;
  cache.loaded = true;
  emit();
}

export function pinsLoaded(): boolean {
  return cache.loaded;
}

export function isPinSetup(): boolean {
  return !!cache.appPinHash;
}

export function isTransactionPinSetup(): boolean {
  return !!cache.transactionPinHash;
}

async function upsertPins(fields: { app_pin_hash?: string | null; transaction_pin_hash?: string | null }) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in');

  const { error } = await supabase
    .from('user_pins')
    .upsert({ user_id: uid, ...fields }, { onConflict: 'user_id' });

  if (error) throw error;

  cache.userId = uid;
  if ('app_pin_hash' in fields) cache.appPinHash = fields.app_pin_hash ?? null;
  if ('transaction_pin_hash' in fields) cache.transactionPinHash = fields.transaction_pin_hash ?? null;
  cache.loaded = true;
  emit();
}

export async function saveAppPin(pin: string): Promise<void> {
  await upsertPins({ app_pin_hash: await hashPin(pin) });
}

export async function saveTransactionPin(pin: string): Promise<void> {
  await upsertPins({ transaction_pin_hash: await hashPin(pin) });
}

export async function clearStoredPin(): Promise<void> {
  await upsertPins({ app_pin_hash: null });
}

export async function clearTransactionPin(): Promise<void> {
  await upsertPins({ transaction_pin_hash: null });
}

export async function verifyStoredPin(pin: string): Promise<boolean> {
  if (!cache.loaded) await loadPinsForUser();
  if (!cache.appPinHash) return false;
  return cache.appPinHash === (await hashPin(pin));
}

export async function verifyTransactionPin(pin: string): Promise<boolean> {
  if (!cache.loaded) await loadPinsForUser();
  if (!cache.transactionPinHash) return false;
  return cache.transactionPinHash === (await hashPin(pin));
}

/** React helper: live PIN status for the signed-in account. */
export function usePinStatus() {
  const [state, setState] = useState({
    loaded: cache.loaded,
    hasAppPin: isPinSetup(),
    hasTransactionPin: isTransactionPinSetup(),
  });

  useEffect(() => {
    const sync = () =>
      setState({
        loaded: cache.loaded,
        hasAppPin: isPinSetup(),
        hasTransactionPin: isTransactionPinSetup(),
      });
    const unsub = subscribePinStore(sync);
    if (!cache.loaded) {
      loadPinsForUser().catch((e) => console.error(e));
    }
    sync();
    return () => {
      unsub();
    };
  }, []);

  return { ...state, refresh: () => loadPinsForUser() };
}
