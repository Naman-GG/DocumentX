import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * Firebase Admin SDK init. Two modes:
 *  - Emulator: if FIRESTORE_EMULATOR_HOST is set, the SDK auto-connects to the
 *    local emulators; only a projectId is needed (no credentials).
 *  - Production: parse the service-account JSON from FIREBASE_SERVICE_ACCOUNT.
 */
const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST

if (!getApps().length) {
  if (useEmulator) {
    initializeApp({
      projectId:
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.FIREBASE_PROJECT_ID ||
        'demo-documentx',
    })
    console.log('[firebase] Admin SDK using local emulators')
  } else {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is not set — required to verify auth tokens and read documents.'
      )
    }
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
}

export const adminAuth = getAuth()
export const adminDb = getFirestore()
export { FieldValue }
