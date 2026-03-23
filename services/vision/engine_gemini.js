const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const CATALOG_PATH = path.join(__dirname, '..', '..', 'data', 'catalogo.json');

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error('No existe data/catalogo.json');
  }
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function buildInlineData(file) {
  return {
    inlineData: {
      mimeType: file.mimetype || 'image/jpeg',
      data: file.buffer.toString('base64'),
    },
  };
}

function extractText(response) {
  if (typeof response.text === 'string') return response.text;

  if (response.candidates?.[0]?.content?.parts) {
    return response.candidates[0].content.parts
      .map(p => p.text || '')
      .join('');
  }

  return '';
}

function parseJson(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

function normalizePais(pais) {
  if (!pais) return null;

  const map = {
    'san marino': 'San_Marino',
    'san_marino': 'San_Marino',
    'vaticano': 'Vaticano',
    'monaco': 'Monaco',
    'belgica': 'Belgica',
    'bélgica': 'Belgica',
    'holanda': 'Holanda',
    'paises bajos': 'Holanda',
    'países bajos': 'Holanda',
    'luxemburgo': 'Luxemburgo',
    'alemania': 'Alemania',
    'españa': 'España',
    'francia': 'Francia',
    'italia': 'Italia',
    'grecia': 'Grecia',
    'irlanda': 'Irlanda',
    'austria': 'Austria',
    'finlandia': 'Finlandia',
    'estonia': 'Estonia',
    'letonia': 'Letonia',
    'lituania': 'Lituania',
    'eslovaquia': 'Eslovaquia',
    'eslovenia': 'Eslovenia',
    'portugal': 'Portugal',
    'malta': 'Malta',
    'chipre': 'Chipre',
    'andorra': 'Andorra',
    'croacia': 'Croacia',
    'luxemburgo ': 'Luxemburgo',
  };

  const key = String(pais).trim().toLowerCase();
  return map[key] || pais;
}

function filtrarCatalogo(catalog, result) {
  let items = catalog.filter(item => item.tipo === 'national');

  if (result.valor) {
    items = items.filter(item => item.valor === result.valor);
  }

  const paisNormalizado = normalizePais(result.pais);
  if (paisNormalizado) {
    items = items.filter(item => item.pais === paisNormalizado);
  }

  if (result.valor === '2€') {
    if (result.tipo2e === 'normal') {
      items = items.filter(item => item.moneda === '2€');
    } else if (result.tipo2e === 'conmemorativa') {
      items = items.filter(item => item.moneda && item.moneda.startsWith('2€ Com'));

      if (result.anio) {
        items = items.filter(item => item.anio === result.anio);
      }
    }
  }

  return items.slice(0, 5).map(item => ({
    pais: item.pais,
    valor: item.valor,
    moneda: item.moneda,
    anio: item.anio,
    file: item.file
  }));
}

async function identifyValue(file) {
  const prompt = `
Analiza la imagen de una moneda euro.

Devuelve SOLO JSON válido con esta estructura:
{
  "valor": "1c|2c|5c|10c|20c|50c|1€|2€|12€|desconocido",
  "confianza": number
}

Reglas:
- Devuelve solo uno de esos valores.
- Si no puedes identificarlo, usa "desconocido".
- confianza debe ser un número entre 0 y 1.
- No escribas explicaciones fuera del JSON.
`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          buildInlineData(file),
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const text = extractText(response);
  return parseJson(text);
}

async function identifyNational(file, options = {}) {
  const valor = options.valor || null;

  if (!valor) {
    throw new Error('identifyNational requiere valor');
  }

  const prompt = `
Analiza la imagen de la CARA NACIONAL de una moneda euro.

El valor de la moneda YA lo conozco: ${valor}

La moneda puede estar rotada (0°, 90°, 180° o 270°).
Debes analizarla correctamente aunque esté girada.

Tu objetivo principal es identificar el PAÍS de la moneda.

Devuelve SOLO JSON válido con esta estructura:

{
  "valor": string,
  "pais": string | null,
  "tipo2e": "normal" | "conmemorativa" | null,
  "anio": number | null,
  "ceca": "A" | "D" | "F" | "G" | "J" | null,
  "descripcion": string | null,
  "confianza": number
}

REGLAS GENERALES

1. El dato MÁS IMPORTANTE es el país.
2. El campo "valor" debe devolver exactamente el valor proporcionado: ${valor}.
3. Usa el diseño, símbolos, monumentos, personajes o texto visible para identificar el país.
4. Si no estás seguro del país, devuelve null.

IDENTIFICACIÓN DEL PAÍS

Puedes usar para identificar el país:
- monumentos
- personajes históricos
- escudos nacionales
- animales o símbolos nacionales
- texto visible
- estilo del diseño

Ejemplos comunes:
Alemania → Puerta de Brandeburgo, águila alemana
España → retrato del rey Felipe VI o Juan Carlos
Francia → árbol estilizado o Marianne
Italia → hombre de Vitruvio
Irlanda → arpa
Finlandia → cisnes o león
Bélgica → retrato del rey
Holanda → retrato del rey con texto "Willem-Alexander"
Luxemburgo → Gran Duque
Grecia → búho o escenas mitológicas

MONEDAS QUE NO SON DE 2€
- Identifica principalmente el país.
- tipo2e debe ser null.
- El año normalmente no es necesario.
- Si el año no se ve claramente devuelve null.

MONEDAS DE 2€
Primero determina si la moneda es:
- "normal"
- "conmemorativa"

2€ NORMAL
- diseño fijo del país
- no conmemora eventos
- identifica el país

2€ CONMEMORATIVA
- diseño distinto al normal del país
- conmemora eventos históricos

Para monedas conmemorativas:
- identifica el país
- si el año se ve claramente devuélvelo
- si no se ve claramente devuelve null

CECA (solo Alemania)
Si la moneda es alemana puede aparecer una letra de ceca:
A = Berlín
D = Múnich
F = Stuttgart
G = Karlsruhe
J = Hamburgo
Devuelve la letra solo si se ve claramente.

DESCRIPCIÓN
Describe brevemente el diseño principal.
Ejemplos:
"Puerta de Brandeburgo"
"Rey Felipe VI"
"Arpa irlandesa"
"Hombre de Vitruvio"
Si no es claro devuelve null.

CONFIDENCIA
confianza debe ser un número entre 0 y 1.
No devuelvas siempre 1.
Escala:
0.95-1.00 → identificación muy segura
0.80-0.95 → bastante probable
0.60-0.80 → posible
<0.60 → dudoso

IMPORTANTE
Devuelve SOLO el JSON.
No escribas explicaciones fuera del JSON.
Si identificas el país, asegúrate de que el diseño sea coherente con las monedas euro conocidas de ese país.
`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          buildInlineData(file),
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const text = extractText(response);
  const result = parseJson(text);

  // Garantizar valor
  result.valor = valor;

  // Normalizar país para casar con el catálogo local
  result.pais = normalizePais(result.pais);

  // Añadir catálogo local como apoyo visual
  const catalog = loadCatalog();
  result.candidatos_catalogo = filtrarCatalogo(catalog, result);

  return result;
}

module.exports = {
  identifyValue,
  identifyNational
};