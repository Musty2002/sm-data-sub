import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const CHECKED_KEY = 'install_referrer_checked';
const PENDING_KEY = 'pending_referral_code';

function extractRefCode(referrer: string): string | null {
  if (!referrer) return null;
  try {
    // Referrer looks like: "ref=RDSABC123&utm_source=..." (may be URL-encoded)
    const decoded = decodeURIComponent(referrer);
    const params = new URLSearchParams(decoded.replace(/^\?/, ''));
    const code = params.get('ref') || params.get('referral') || params.get('referral_code');
    if (code) return code.trim().toUpperCase();
    // Fallback: bare code in the referrer string
    const match = decoded.match(/RDS[A-Z0-9]{6}/i);
    return match ? match[0].toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Reads the Google Play install referrer once after a fresh install and stores
 * the referral code so the signup flow can apply it automatically.
 */
export function useInstallReferrer() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    (async () => {
      try {
        if (localStorage.getItem(CHECKED_KEY)) return;
        // Don't overwrite a code the user already picked up from a web link
        if (localStorage.getItem(PENDING_KEY)) {
          localStorage.setItem(CHECKED_KEY, '1');
          return;
        }

        const { InstallReferrer } = await import('@capgo/capacitor-install-referrer');
        const result = await InstallReferrer.getReferrer();
        if (cancelled) return;

        const code = extractRefCode(result?.referrer || '');
        if (code) {
          localStorage.setItem(PENDING_KEY, code);
          console.log('Install referrer applied referral code:', code);
        }
        localStorage.setItem(CHECKED_KEY, '1');
      } catch (err) {
        console.warn('Install referrer unavailable:', err);
        try { localStorage.setItem(CHECKED_KEY, '1'); } catch { /* ignore */ }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
