const express = require('express');
const multer = require('multer');
const engine = require('../services/vision/engine');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/identify/value', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Falta la imagen' });
    }

    const result = await engine.identifyValue(req.file);
    return res.json(result);
  } catch (error) {
    console.error('API value ERROR:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Error interno en identificación de valor'
    });
  }
});

router.post('/identify/national', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Falta la imagen' });
    }

    const valor = req.body.valor || null;
    const pais = req.body.pais || null;

    const result = await engine.identifyNational(req.file, { valor, pais });
    return res.json(result);
  } catch (error) {
    console.error('API national ERROR:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Error interno en identificación nacional'
    });
  }
});

module.exports = router;