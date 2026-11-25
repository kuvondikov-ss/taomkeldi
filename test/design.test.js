// 3-bosqich: dizayn tizimi tekshiruvlari (kontrast, logo fayllari, emoji yo'qligi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('rang juftliklari WCAG talabiga mos (yorug\' va to\'q)', () => {
  const out = execFileSync(process.execPath, ['scripts/contrast.mjs'], { encoding: 'utf8' });
  assert.match(out, /Barcha juftliklar talabga mos/);
});

test('original logo va variantlar mavjud, original o\'zgarmagan shakllarda', () => {
  const dir = 'public/brand/';
  const original = fs.readFileSync(dir + 'taomkeldi-original.svg', 'utf8');
  for (const f of ['full-light', 'full-dark', 'compact-light', 'compact-dark', 'mark', 'favicon']) {
    assert.ok(fs.existsSync(`${dir}taomkeldi-${f}.svg`), f);
  }
  // Variantlardagi har bir path geometriyasi originaldan aynan olingan.
  const originalPaths = new Set([...original.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]));
  for (const f of ['full-dark', 'compact-light', 'mark']) {
    const svg = fs.readFileSync(`${dir}taomkeldi-${f}.svg`, 'utf8');
    for (const [, d] of svg.matchAll(/ d="([^"]+)"/g)) assert.ok(originalPaths.has(d), `${f}: path o'zgargan`);
  }
  assert.ok(fs.statSync(dir + 'taomkeldi-avatar-512.png').size > 1000);
});

test('Mini App sahifalarida emoji ishlatilmagan, ranglar faqat tokenlardan', () => {
  const emoji = /\p{Extended_Pictographic}/u;
  for (const f of ['public/index.html', 'public/ui-kit.html', 'public/css/components.css', 'public/js/ui/components.js']) {
    assert.ok(!emoji.test(fs.readFileSync(f, 'utf8')), `${f} da emoji bor`);
  }
  const components = fs.readFileSync('public/css/components.css', 'utf8');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(components), 'components.css da to\'g\'ridan-to\'g\'ri rang bor — tokenlardan foydalaning');
});
