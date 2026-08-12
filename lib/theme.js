'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'eluzai-dev-theme';

function readStored() {
  if (typeof window === 'undefined') return 'light';
  const t = localStorage.getItem(KEY);
  if (t === 'dark' || t === 'light') return t;
  // Default: LIGHT — dashboard berbasis mode terang; dark hanya bila user
  // memilihnya secara eksplisit (tidak mengikuti preferensi sistem).
  return 'light';
}

let current = readStored();
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

export function getTheme() {
  return current;
}

export function setTheme(next) {
  current = next === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', current === 'dark' ? 'dark' : '');
  try {
    localStorage.setItem(KEY, current);
  } catch {
    /* abaikan */
  }
  emit();
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => 'light');
}
