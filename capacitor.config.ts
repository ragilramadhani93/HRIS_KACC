import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration — wraps the SmartHRIS web app (dist/) into a
 * native Android/iOS application for employees.
 *
 * Local workflow:
 *   npm run build        # build the web app into dist/
 *   npm run cap:add:android   # one-time: scaffold the android/ project
 *   npm run cap:sync     # copy dist/ into the native projects
 *   npm run cap:open:android  # open in Android Studio, then build the APK
 */
const config: CapacitorConfig = {
  appId: 'id.kacc.smarthris',
  appName: 'SmartHRIS Karyawan',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
