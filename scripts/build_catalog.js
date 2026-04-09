const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const MONEDAS_DIR = path.join(ROOT, 'public', 'images', 'monedas');
const OUTPUT = path.join(ROOT, 'data', 'catalogo.json');

const SUPPORTED = new Set(['1c', '2c', '5c', '10c', '20c', '50c', '1€', '2€']);

function isImageFile(file) {
  return /\.(jpg|jpeg|png|webp)$/i.test(file);
}

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.isFile() && isImageFile(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function parseCoinFilename(filename) {
  const base = path.basename(filename).replace(/\.[^.]+$/, '');
  const parts = base.split('-');

  if (parts.length === 3 && parts[0] === '2€') {
    const anio = Number(parts[1]);
    const num = Number(parts[2]);
    if (Number.isInteger(anio) && anio >= 1999 && Number.isInteger(num) && num >= 1 && num <= 3) {
      return {
        moneda: `2€ Com${num}`,
        valor: '2€',
        anio,
        num
      };
    }
    return null;
  }

  if (parts.length === 2) {
    const valor = parts[0];
    const num = Number(parts[1]);

    if (!SUPPORTED.has(valor)) return null;
    if (!Number.isInteger(num) || num < 1 || num > 9) return null;

    return {
      moneda: valor,
      valor,
      anio: null,
      num
    };
  }

  if (parts.length === 1) {
    const valor = parts[0];
    if (!SUPPORTED.has(valor)) return null;

    return {
      moneda: valor,
      valor,
      anio: null,
      num: null
    };
  }

  return null;
}

function hexToBigInt(hex) {
  return BigInt('0x' + hex);
}

function popcountBigInt(x) {
  let count = 0;
  while (x) {
    count++;
    x &= (x - 1n);
  }
  return count;
}

async function dHashFromFile(filePath) {
  const { data, info } = await sharp(filePath)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) {
    throw new Error(`Tamaño inesperado al procesar ${filePath}`);
  }

  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }

  return hash.toString(16).padStart(16, '0');
}

async function main() {
  const files = walkDir(MONEDAS_DIR);
  const catalog = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const parent = path.basename(path.dirname(file));

    if (parent === 'Reverso') {
      const parsed = parseCoinFilename(path.basename(file));
      if (!parsed || !SUPPORTED.has(parsed.valor)) continue;

      const hash = await dHashFromFile(file);

      catalog.push({
        tipo: 'reverse',
        pais: null,
        file: rel,
        valor: parsed.valor,
        moneda: parsed.moneda,
        anio: null,
        num: null,
        hash
      });
      continue;
    }

    const parsed = parseCoinFilename(path.basename(file));
    if (!parsed) continue;

    const hash = await dHashFromFile(file);

    catalog.push({
      tipo: 'national',
      pais: parent,
      file: rel,
      valor: parsed.valor,
      moneda: parsed.moneda,
      anio: parsed.anio,
      num: parsed.num,
      hash
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(catalog, null, 2), 'utf8');

  // console.log(`Catálogo generado con ${catalog.length} imágenes en: ${OUTPUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});