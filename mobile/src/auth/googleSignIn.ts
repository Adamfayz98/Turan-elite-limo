/**
 * Google Sign-In configuration.
 *
 * Configure GoogleSignin once at app launch with the iOS, Android, and Web
 * client IDs created in the Google Cloud Console. Reads from Expo's `extra`
 * config so we don't ship client IDs in source.
 *
 * Add to app.json extra → googleSignIn:
 *   {
 *     "iosClientId":    "NNN-xxx.apps.googleusercontent.com",
 *     "androidClientId":"NNN-xxx.apps.googleusercontent.com",
 *     "webClientId":    "NNN-xxx.apps.googleusercontent.com"
 *   }
 */
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import Constants from "expo-constants";

let configured = false;

export function configureGoogleSignIn() {
  if (configured) return;
  const extra = (Constants.expoConfig?.extra as any) || {};
  const cfg = extra.googleSignIn || {};
  if (!cfg.webClientId) {
    // Skip silently — UI will hide the Google button until configured.
    return;
  }
  GoogleSignin.configure({
    webClientId: cfg.webClientId,
    iosClientId: cfg.iosClientId,
    // androidClientId is auto-detected from google-services.json on Android;
    // we still pass it for clarity when testing with a dev client.
    offlineAccess: false,
  });
  configured = true;
}

export function isGoogleSignInConfigured(): boolean {
  const extra = (Constants.expoConfig?.extra as any) || {};
  return Boolean(extra.googleSignIn?.webClientId);
}
