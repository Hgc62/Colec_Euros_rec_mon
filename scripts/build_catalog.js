const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..', 'public', 'images', 'monedas');
const OUTPUT = path.join(__dirname, '..', 'data', 'catalogo.json');

function getDirectories(srcPath) {
  return fs.readdirSync(srcPath).filter(file =>
    fs.statSync(path.join(srcPath, file)).isDirectory()
  );
}

function parseFileName(fileName) {
  const name = fileName.replace(/\.[^/.]+$/, '');
  const parts = name.split('-');

  let valor = parts[0] || null;
  let anio = null;
  let tipoCom = null;

  if (parts.length >= 2) {
    const maybeYear = parseInt(parts[1], 10);
    if (!isNaN(maybeYear)) {
      anio = maybeYear;
    }
  }

  if (parts.length >= 3) {
    tipoCom = parts[2];
  }

  let moneda = valor;
  if (valor === '2€' && tipoCom) {
    moneda = `2€ Com${tipoCom}`;
  }

  return { valor, moneda, anio };
}

function buildCatalog() {
  const catalog = [];
  const paises = getDirectories(BASE_DIR);

  for (const pais of paises) {
    const paisDir = path.join(BASE_DIR, pais);
    const files = fs.readdirSync(paisDir);

    for (const file of files) {
      if (!file.match(/\.(jpg|jpeg|png|webp)$/i)) continue;

      const parsed = parseFileName(file);

      catalog.push({
        tipo: 'national',
        pais,
        valor: parsed.valor,
        moneda: parsed.moneda,
        anio: parsed.anio,
        file: path.join('public', 'images', 'monedas', pais, file).replace(/\\/g, '/')
      });
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`✅ Catálogo generado: ${catalog.length} monedas`);
}

buildCatalog();