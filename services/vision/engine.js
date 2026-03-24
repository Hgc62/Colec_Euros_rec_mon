//const dhash = require('./engine_dhash');
//const phash = require('./engine_phash');
const gemini = require('./engine_gemini');

const ENGINE = process.env.VISION_ENGINE || 'gemini';

console.log('VISION ENGINE ACTIVO:', ENGINE);

async function identifyValue(file) {
  switch (ENGINE) {
    case 'gemini':
      return gemini.identifyValue(file);
    case 'phash':
      return phash.identifyValue(file.buffer ? file.buffer : file);
    case 'dhash':
      return dhash.identifyValue(file.buffer ? file.buffer : file);
    default:
      throw new Error('Motor de visión no soportado: ' + ENGINE);
  }
}

async function identifyNational(file, options) {
  switch (ENGINE) {
    case 'gemini':
      return gemini.identifyNational(file, options);
    case 'phash':
      return phash.identifyNational(file.buffer ? file.buffer : file, options);
    case 'dhash':
      return dhash.identifyNational(file.buffer ? file.buffer : file, options);
    default:
      throw new Error('Motor de visión no soportado: ' + ENGINE);
  }
}

module.exports = {
  identifyValue,
  identifyNational,
};