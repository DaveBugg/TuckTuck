// Генератор логотипов TuckTuck.
//
// Ассеты держим генерируемыми, а не бинарниками «откуда-то»: поправить оттенок
// или толщину линии — это правка одной строки и повторный запуск, а не поиск
// исходника в чужом редакторе. Цвета взяты из палитры интерфейса, поэтому
// логотип с ним не спорит.
//
//   node scripts/gen-logo.mjs
//
// Знак — пульс: название читается как «тук-тук», а панель следит за здоровьем
// ресурсов. Линия достаточно толстая, чтобы не пропасть на фавиконке в 16px.

import sharp from "sharp";
import { writeFileSync } from "node:fs";

const INDIGO_HI = "#4a5da0"; // плашка сверху
const INDIGO_LO = "#38477a"; // плашка снизу
const PRIMARY = "#405189"; // текст на светлом фоне
const ACCENT = "#0ab39c"; // «живой» цвет пульса, он же акцент интерфейса
const FONT = "Segoe UI, Helvetica Neue, Arial, sans-serif";

/**
 * Значок в квадрате 100x100: плашка со скруглением + линия пульса.
 *
 * stroke задаётся снаружи: на 16px линия толщиной 11 сминается в пунктир, и
 * мелким размерам нужна заметно толще. Масштабировать один рисунок мало —
 * тонкие штрихи не переживают уменьшение.
 */
function markSvg({ radius = 26, bg = true, stroke = 11 } = {}) {
  return `
    ${
      bg
        ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0" stop-color="${INDIGO_HI}"/>
             <stop offset="1" stop-color="${INDIGO_LO}"/>
           </linearGradient></defs>
           <rect width="100" height="100" rx="${radius}" fill="url(#g)"/>`
        : ""
    }
    <path d="M16 54 H34 L43 33 L55 71 L63 54 H84"
          fill="none" stroke="${ACCENT}" stroke-width="${stroke}"
          stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * Горизонтальный логотип 187x32: значок + «Tuck» + «Tuck» акцентом.
 *
 * Размеры подобраны так, чтобы содержимое занимало почти всю ширину холста:
 * в сайдбаре картинка выравнивается по левому краю, и лишняя прозрачная
 * полоса справа выглядела бы как случайный отступ.
 */
function wordmarkSvg(onDark) {
  const first = onDark ? "#ffffff" : PRIMARY;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="187" height="32" viewBox="0 0 187 32">
    <g transform="translate(0,0) scale(0.32)">${markSvg({ radius: 26 })}</g>
    <text x="42" y="25" font-family="${FONT}" font-size="26" font-weight="700"
          letter-spacing="-0.8" fill="${first}">Tuck<tspan fill="${ACCENT}">Tuck</tspan></text>
  </svg>`;
}

const iconSvg = (size, radius, stroke = 11) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${markSvg({ radius, stroke })}</svg>`;

/** Рендер через увеличенный холст: сглаживание мелкого текста заметно лучше. */
async function render(svg, w, h, out, scale = 4) {
  await sharp(Buffer.from(svg), { density: 72 * scale })
    .resize(w, h, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ${out} — ${w}x${h}`);
}

/**
 * ICO собираем руками: sharp его не пишет, а тянуть зависимость ради одного
 * файла незачем. Формат простой — заголовок, таблица картинок, следом сами
 * PNG (Vista и новее это понимают).
 */
async function writeIco(out, sizes) {
  const pngs = [];
  for (const s of sizes) {
    pngs.push(
      await sharp(Buffer.from(iconSvg(s, s >= 64 ? 26 : 20, s <= 16 ? 15 : s <= 32 ? 12 : 11)), {
        density: 72 * 4,
      })
        .resize(s, s, { fit: "fill" })
        .png({ compressionLevel: 9 })
        .toBuffer()
    );
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // тип 1 = icon
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + sizes.length * 16;
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); // 0 означает 256
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2); // палитра не используется
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // цветовых плоскостей
    e.writeUInt16LE(32, 6); // бит на пиксель
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    entries.push(e);
  });

  writeFileSync(out, Buffer.concat([header, ...entries, ...pngs]));
  console.log(`  ${out} — ${sizes.join("/")}`);
}

// Генерируем ровно то, что используется: знак и фавиконку. Раньше сюда же
// клались варианты текстового логотипа, но их никто не подключал, и в
// репозитории они лежали мёртвым грузом. Понадобятся — wordmarkSvg на месте,
// добавить строку render.
await render(iconSvg(100, 26), 80, 80, "public/images/logo-sm.png");
// Фавиконка app-роутера Next — по его соглашению отдельным файлом в src/app.
await writeIco("src/app/favicon.ico", [16, 32, 48, 64, 128, 256]);
