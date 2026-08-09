'use client';

import Icon from './Icon';
import { useTheme, setTheme } from '@/lib/theme';

export default function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="icon-btn"
      aria-label={dark ? 'Mode terang' : 'Mode gelap'}
      title={dark ? 'Mode terang' : 'Mode gelap'}
    >
      {dark ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
    </button>
  );
}
