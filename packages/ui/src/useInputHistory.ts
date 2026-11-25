import { useCallback, useState } from 'react';

const MAX_HISTORY = 20;

function readStorage(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeStorage(key: string, list: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Ignore storage quota / restricted context errors
  }
}

export function useInputHistory(storageKey: string) {
  const [items, setItems] = useState<string[]>(() => readStorage(storageKey));

  const push = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setItems((prev) => {
        const next = [trimmed, ...prev.filter((v) => v !== trimmed)].slice(0, MAX_HISTORY);
        writeStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const remove = useCallback(
    (value: string) => {
      setItems((prev) => {
        const next = prev.filter((v) => v !== value);
        writeStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    setItems([]);
    writeStorage(storageKey, []);
  }, [storageKey]);

  return { items, push, remove, clear };
}
