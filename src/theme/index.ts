import { useColorScheme } from 'react-native';
import { useAppStore } from '../store/useAppStore';
const light = {
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  text: '#17233B',
  muted: '#64748B',
  line: '#E2E8F0',
  primary: '#4058D6',
  accent: '#008F86',
  soft: '#EBEFFE',
  danger: '#C53A4B',
  warning: '#9B680B',
};
const dark = {
  bg: '#101725',
  surface: '#1A2435',
  text: '#F1F5FB',
  muted: '#A2AFC3',
  line: '#2D3A50',
  primary: '#9CAEFF',
  accent: '#5ED6C6',
  soft: '#263452',
  danger: '#FF8795',
  warning: '#EEC675',
};
export function useTheme() {
  const system = useColorScheme();
  const mode = useAppStore(s => s.settings.theme);
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  return { ...(isDark ? dark : light), isDark };
}
