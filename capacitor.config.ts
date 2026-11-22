import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.navi.copilot',
  appName: 'Navi Rally',
  webDir: 'dist',
  backgroundColor: '#0b0d10',
  ios: { contentInset: 'never', backgroundColor: '#0b0d10' },
  android: { backgroundColor: '#0b0d10', allowMixedContent: false },
};

export default config;
