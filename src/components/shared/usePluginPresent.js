import { useEffect, useState } from 'react';
import { plugin } from '@/lib/phone';

// Whether a native plugin is attached — the bridge arrives a moment after the
// page boots, so this watches for it instead of checking once.
export function usePluginPresent(name) {
  const [present, setPresent] = useState(() => !!plugin(name));
  useEffect(() => {
    if (present) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (plugin(name)) { setPresent(true); clearInterval(t); }
      else if (tries > 40) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [name, present]);
  return present;
}
