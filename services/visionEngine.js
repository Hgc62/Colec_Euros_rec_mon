const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalogo.json');

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error('No existe data/catalogo.json. Ejecuta antes: node scripts/build_catalog.js');
  }
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
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

function hammingDistanceHex(a, b) {
  const x = hexToBigInt(a) ^ hexToBigInt(b);
  return popcountBigInt(x);
}

function distanceToScore(distance) {
  return Number((1 - distance / 64).toFixed(4));
}

async function getMaskedCoinBuffer(buffer) {
  const size = 256;

  const svgMask = `
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.42}" fill="white"/>
    </svg>
  `;

  return await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .composite([
      {
        input: Buffer.from(svgMask),
        blend: 'dest-in'
      }
    ])
    .png()
    .toBuffer();
}

async function detectMetalStructure(buffer) {
  const masked = await getMaskedCoinBuffer(buffer);

  const { data, info } = await sharp(masked)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;

  const centerRadius = size * 0.20;
  const innerRingRadius = size * 0.30;
  const outerRingRadius = size * 0.40;

  let center = [0, 0, 0];
  let ring = [0, 0, 0];
  let ccount = 0;
  let rcount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * width + x) * channels;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;

      if (a === 0) continue;

      if (d < centerRadius) {
        center[0] += r;
        center[1] += g;
        center[2] += b;
        ccount++;
      } else if (d >= innerRingRadius && d < outerRingRadius) {
        ring[0] += r;
        ring[1] += g;
        ring[2] += b;
        rcount++;
      }
    }
  }

  if (!ccount || !rcount) {
    throw new Error('No se pudieron calcular centro y anillo');
  }

  center = center.map(v => v / ccount);
  ring = ring.map(v => v / rcount);

  const centerYellow = center[0] - center[2];
  const ringYellow = ring[0] - ring[2];
  const yellowDiff = Math.abs(centerYellow - ringYellow);

  return {
    center,
    ring,
    centerYellow,
    ringYellow,
    yellowDiff
  };
}

async function dHashFromBuffer(buffer) {
  const image = sharp(buffer);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) {
    throw new Error('No se pudo leer el tamaño de la imagen');
  }

  const side = Math.floor(Math.min(meta.width, meta.height) * 0.85);
  const left = Math.floor((meta.width - side) / 2);
  const top = Math.floor((meta.height - side) / 2);

  const { data, info } = await sharp(buffer)
    .extract({
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: side,
      height: side
    })
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) {
    throw new Error('No se pudo normalizar la imagen');
  }

  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const leftPx = data[y * 9 + x];
      const rightPx = data[y * 9 + x + 1];
      hash = (hash << 1n) | (leftPx > rightPx ? 1n : 0n);
    }
  }

  return hash.toString(16).padStart(16, '0');
}

function topMatches(queryHash, items, topN = 5) {
  return items
    .map(item => {
      const distance = hammingDistanceHex(queryHash, item.hash);
      return {
        ...item,
        distance,
        score: distanceToScore(distance)
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topN);
}

async function identifyBimetalByHash(imageBuffer, catalog) {
  const queryHash = await dHashFromBuffer(imageBuffer);

  const candidates = catalog.filter(
    item => item.tipo === 'reverse' && ['1€', '2€'].includes(item.valor)
  );

  const matches = topMatches(queryHash, candidates, 2);

  return matches[0] || null;
}

async function identifyValue(imageBuffer) {
  const catalog = loadCatalog();
  const queryHash = await dHashFromBuffer(imageBuffer);
  const metal = await detectMetalStructure(imageBuffer);

  // console.log('BIMETAL DEBUG', {
    centerYellow: Number(metal.centerYellow.toFixed(2)),
    ringYellow: Number(metal.ringYellow.toFixed(2)),
    yellowDiff: Number(metal.yellowDiff.toFixed(2))
  });

  // 1) Primero calcula matches contra todos los reversos
  const allReverses = catalog.filter(item => item.tipo === 'reverse');
  const allMatches = topMatches(queryHash, allReverses, 5);

  const bestOverall = allMatches[0];

  // 2) Solo considera 1€/2€ si además el mejor match real es uno de ellos
  if (
    metal.yellowDiff > 12 &&
    bestOverall &&
    ['1€', '2€'].includes(bestOverall.valor)
  ) {
    const bimetalCandidates = allReverses.filter(item =>
      ['1€', '2€'].includes(item.valor)
    );

    const bimetalMatches = topMatches(queryHash, bimetalCandidates, 2);
    const bestBimetal = bimetalMatches[0];

    return {
      valor: bestBimetal?.valor ?? null,
      score: bestBimetal?.score ?? 0,
      candidatos: bimetalMatches.map(c => ({
        valor: c.valor,
        file: c.file,
        score: c.score,
        distance: c.distance
      }))
    };
  }

  // 3) Si no, excluir 1€ y 2€
  const nonBimetal = allReverses.filter(
    item => !['1€', '2€'].includes(item.valor)
  );

  const candidatos = topMatches(queryHash, nonBimetal, 5);

  return {
    valor: candidatos[0]?.valor ?? null,
    score: candidatos[0]?.score ?? 0,
    candidatos: candidatos.map(c => ({
      valor: c.valor,
      file: c.file,
      score: c.score,
      distance: c.distance
    }))
  };
}

/*
async function identifyValue(imageBuffer) {
  const catalog = loadCatalog();
  const queryHash = await dHashFromBuffer(imageBuffer);

  const reversos = catalog.filter(item => item.tipo === 'reverse');
  const candidatos = topMatches(queryHash, reversos, 5);

  return {
    valor: candidatos[0]?.valor ?? null,
    score: candidatos[0]?.score ?? 0,
    candidatos: candidatos.map(c => ({
      valor: c.valor,
      file: c.file,
      score: c.score,
      distance: c.distance
    }))
  };
}

*/

async function identifyNational(imageBuffer, options = {}) {
  const catalog = loadCatalog();
  const queryHash = await dHashFromBuffer(imageBuffer);


  let nacionales = catalog.filter(item => item.tipo === 'national');

  if (options.valor) {
    nacionales = nacionales.filter(item => item.valor === options.valor);
  }

  if (options.pais) {
    nacionales = nacionales.filter(item => item.pais === options.pais);
  }

  const candidatos = topMatches(queryHash, nacionales, 5);
  const best = candidatos[0] || null;

  if (!best) {
    return {
      pais: null,
      moneda: null,
      anio: null,
      needsYear: false,
      needsCeca: false,
      score: 0,
      candidatos: []
    };
  }

  return {
    pais: best.pais,
    moneda: best.moneda,
    anio: best.anio,
    needsYear: best.anio == null,
    needsCeca: best.pais === 'Alemania',
    score: best.score,
    candidatos: candidatos.map(c => ({
      pais: c.pais,
      moneda: c.moneda,
      anio: c.anio,
      file: c.file,
      score: c.score,
      distance: c.distance
    }))
  };
}

async function detectBimetal(buffer) {
  const size = 200;

  const { data } = await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const centerRadius = size * 0.25;
  const outerRadius = size * 0.45;
  const innerRingRadius = size * 0.32;

  const cx = size / 2;
  const cy = size / 2;

  let center = [0, 0, 0];
  let ring = [0, 0, 0];
  let ccount = 0;
  let rcount = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 3;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (d < centerRadius) {
        center[0] += r;
        center[1] += g;
        center[2] += b;
        ccount++;
      } else if (d >= innerRingRadius && d < outerRadius) {
        ring[0] += r;
        ring[1] += g;
        ring[2] += b;
        rcount++;
      }
    }
  }

  center = center.map(v => v / ccount);
  ring = ring.map(v => v / rcount);

  const centerYellow = center[0] - center[2];
  const ringYellow = ring[0] - ring[2];

  return centerYellow > ringYellow ? '2€' : '1€';
}

/*
async function detectBimetal(buffer) {
  const size = 200;

  const { data, info } = await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const centerRadius = size * 0.25;
  const outerRadius = size * 0.45;
  const cx = size / 2;
  const cy = size / 2;

  let center = [0,0,0];
  let outer = [0,0,0];
  let ccount = 0;
  let ocount = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx*dx + dy*dy);

      const idx = (y * size + x) * 3;

      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];

      if (d < centerRadius) {
        center[0]+=r; center[1]+=g; center[2]+=b;
        ccount++;
      } 
      else if (d < outerRadius) {
        outer[0]+=r; outer[1]+=g; outer[2]+=b;
        ocount++;
      }
    }
  }

  center = center.map(v=>v/ccount);
  outer = outer.map(v=>v/ocount);

  const centerYellow = center[0] - center[2];
  const outerYellow = outer[0] - outer[2];

  if (centerYellow > outerYellow) return "2€";
  if (centerYellow < outerYellow) return "1€";

  return null;
}
*/

async function detectColorGroup(buffer) {
  const size = 200;

  const { data } = await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d <= radius) {
        const idx = (y * size + x) * 3;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        sumR += r;
        sumG += g;
        sumB += b;
        count++;
      }
    }
  }

  const r = sumR / count;
  const g = sumG / count;
  const b = sumB / count;

  const rg = r - g;
  const rb = r - b;
  const gb = g - b;

  /*
  console.log('COLOR GROUP DEBUG', {
    r: Number(r.toFixed(2)),
    g: Number(g.toFixed(2)),
    b: Number(b.toFixed(2)),
    rg: Number(rg.toFixed(2)),
    rb: Number(rb.toFixed(2)),
    gb: Number(gb.toFixed(2))
  });
*/

  if (rg > 18 && rb > 30) {
    return 'copper';
  }

  if (rb > 20 && gb > 5) {
    return 'gold';
  }

  return 'bimetal';

/*
  const r = sumR / count;
  const g = sumG / count;
  const b = sumB / count;

  // Métricas simples
  const yellow = r - b;
  const copper = r - g;

  // Ajustables según pruebas
  if (r > g && g > b && copper > 18) {
    return 'copper';
  }

  if (r > g && g >= b && yellow > 8) {
    return 'gold';
  }

  return 'bimetal';
*/
}




module.exports = {
  identifyValue,
  identifyNational
};