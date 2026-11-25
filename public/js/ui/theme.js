// Mavzu: Telegram ichida — Telegram'ning colorScheme'i; tashqarida — tizim sozlamasi.
// Qo'lda tanlov (faqat sinov sahifasi uchun): setTheme('light' | 'dark' | 'auto').
export function applyTelegramTheme() {
  const tg = window.Telegram?.WebApp;
  if (!tg?.initData) return null;
  const sync = () => {
    document.documentElement.dataset.theme = tg.colorScheme === 'dark' ? 'dark' : 'light';
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    try {
      tg.setHeaderColor?.(bg);
      tg.setBackgroundColor?.(bg);
      tg.setBottomBarColor?.(bg);
    } catch { /* eski Telegram versiyalari */ }
  };
  sync();
  tg.onEvent?.('themeChanged', sync);
  return tg;
}

export function setTheme(mode) {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}
