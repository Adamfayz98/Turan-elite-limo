/**
 * Refer-a-Friend: pending referral code storage.
 *
 * When a friend opens https://turanelitelimo.com/r/REF-XXXXXX on their phone,
 * the universal/app link routes into the app (app/r/[code].tsx), which saves
 * the code here. The signup flows (email + Apple + Google) read it so the new
 * account is attributed to the referrer, then clear it after a successful auth.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CODE_KEY = "pending_ref_code";
const NAME_KEY = "pending_ref_name";

export async function savePendingReferral(code: string, referrerName?: string | null) {
  try {
    await AsyncStorage.setItem(CODE_KEY, code.toUpperCase());
    if (referrerName) await AsyncStorage.setItem(NAME_KEY, referrerName);
    else await AsyncStorage.removeItem(NAME_KEY);
  } catch {}
}

export async function getPendingReferral(): Promise<{ code: string; referrerName: string | null } | null> {
  try {
    const code = await AsyncStorage.getItem(CODE_KEY);
    if (!code) return null;
    const referrerName = await AsyncStorage.getItem(NAME_KEY);
    return { code, referrerName };
  } catch {
    return null;
  }
}

export async function clearPendingReferral() {
  try {
    await AsyncStorage.multiRemove([CODE_KEY, NAME_KEY]);
  } catch {}
}
