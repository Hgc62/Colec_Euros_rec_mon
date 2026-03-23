const express = require('express');
const router = express.Router();
const sessionController = require('./session_controller');

// IMPORTANTE: aquí tienes que usar tus controllers reales
const coleccionController = require('../controllers/coleccion');
//const monedasController = require('../controllers/monedas');

// Página principal