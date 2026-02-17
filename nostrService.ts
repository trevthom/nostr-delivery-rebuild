import { RelayPool, signEvent, npubToHex, encryptForSelf, decryptForSelf, KIND_PROFILE, KIND_SETTINGS } from './nostr';
import type { UserProfile, AppSettings } from './types';

export async function publishProfile(pool: RelayPool, privHex: string, p: UserProfile): Promise<void> {
  try {
    const ev = await signEvent(privHex, KIND_PROFILE, JSON.stringify(p), [['d', p.npub]]);
    const ok = await pool.publish(ev);
    if (!ok) {
      console.warn('Profile publish not confirmed, retrying...');
      const ev2 = await signEvent(privHex, KIND_PROFILE, JSON.stringify(p), [['d', p.npub]]);
      await pool.publish(ev2);
    }
  } catch (e) { console.error('publish profile:', e); }
}

export async function loadProfile(pool: RelayPool, npub: string): Promise<UserProfile> {
  try {
    const evs = await pool.query({ kinds: [KIND_PROFILE], '#d': [npub], limit: 10 });
    if (evs.length > 0) {
      evs.sort((a, b) => b.created_at - a.created_at);
      return JSON.parse(evs[0].content);
    }
  } catch {}
  return { npub, reputation: 0, completed_deliveries: 0, verified_identity: false };
}

export async function publishSettings(pool: RelayPool, hex: string, npub: string, settings: AppSettings): Promise<void> {
  const encrypted = await encryptForSelf(hex, JSON.stringify(settings));
  const ev = await signEvent(hex, KIND_SETTINGS, encrypted, [['d', npub]]);
  const ok = await pool.publish(ev);
  if (!ok) {
    console.warn('Settings publish not confirmed by relays, retrying...');
    const ev2 = await signEvent(hex, KIND_SETTINGS, encrypted, [['d', npub]]);
    const ok2 = await pool.publish(ev2);
    if (!ok2) console.error('Settings publish retry also failed');
  }
}

export async function loadSettings(pool: RelayPool, npub: string, hex: string): Promise<AppSettings | null> {
  const pubHex = npubToHex(npub);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const evs = await pool.query({ kinds: [KIND_SETTINGS], '#d': [npub], authors: [pubHex], limit: 10 });
      if (evs.length > 0) {
        evs.sort((a, b) => b.created_at - a.created_at);
        const decrypted = await decryptForSelf(hex, evs[0].content);
        return JSON.parse(decrypted) as AppSettings;
      }
    } catch (e) { console.error('load settings attempt', attempt + 1, ':', e); }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}
