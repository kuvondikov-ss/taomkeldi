// Rasm yuklash: tur faqat fayl imzosi (magic bytes) bo'yicha aniqlanadi, Content-Type'ga ishonilmaydi.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../lib/errors.js';

const SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

export const ALLOWED_IMAGE_TYPES = SIGNATURES.map((s) => s.mime);

export function detectImage(buffer) {
  return SIGNATURES.find((s) => s.test(buffer)) || null;
}

export function createUploadService(config, access) {
  // Restoran rasmi (logo, cover, taom). Faqat shu restoran egasi/menejeri yoki platforma admini.
  function saveRestaurantImage(actor, restaurantId, buffer) {
    access.requireRestaurantStaff(actor, restaurantId);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new AppError('UPLOAD_TYPE');
    if (buffer.length > config.uploadMaxBytes) throw new AppError('UPLOAD_TOO_LARGE');
    const kind = detectImage(buffer);
    if (!kind) throw new AppError('UPLOAD_TYPE');

    const rel = path.posix.join('restaurants', String(restaurantId), `${crypto.randomUUID()}.${kind.ext}`);
    const abs = path.join(config.uploadsDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
    return { path: `/uploads/${rel}`, mime: kind.mime, size: buffer.length };
  }

  return { saveRestaurantImage };
}
