var express = require('express');
var router = express.Router();

const monedasController = require('../controllers/monedas');
const coleccionController = require('../controllers/coleccion');
const userController = require('../controllers/user');
const sessionController = require('../controllers/session');
const multer = require('multer');
const upload = multer();
const { models } = require('../models');

// Routes for the resource /login

// autologout
router.all('*',sessionController.checkLoginExpires);

// login form
router.get('/login', sessionController.new);

// create login session
router.post('/login',
    sessionController.create,
    sessionController.createLoginExpires);

// logout - close login session
router.delete('/login', sessionController.destroy);

// History: Restoration routes.

// Redirection to the saved restoration route.
function redirectBack(req, res, next) {
  const url = req.session.backURL || "/";
  delete req.session.backURL;
  res.redirect(url);
}

router.get('/goback', redirectBack);

// Save the route that will be the current restoration route.
function saveBack(req, res, next) {
  req.session.backURL = req.url;
  next();
}

// Restoration routes are GET routes that do not end in:
//   /new, /edit, /play, /check, /login or /:id.
router.get(
  [
      '/',
      '/monedas',
      '/coleccion/tabla',
      '/coleccion',
      '/users',
      '/users/:id(\\d+)/coleccion',
      '/monedas/:paisId(\\d+)'
  ],
  saveBack);


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

// Autoload para usar :paisId
router.param('paisId', monedasController.load);

// Autoload para usar :userId
router.param('userId', userController.load);

// Autoload para usar :monedaId
router.param('monedaId', coleccionController.load);

/* Rutas que muestran las monedas por paises */
router.get('/monedas',                              monedasController.index);
router.get('/monedas/:paisId(\\d+)',                monedasController.show);
router.get('/monedas/:paisId(\\d+)/series',         monedasController.show_series);
router.get('/monedas/:paisId(\\d+)/conmemorativas', monedasController.show_conme);

/* Rutas que muestran la colección de las series */
router.get('/coleccion',                    sessionController.loginRequired, coleccionController.index);
router.get('/coleccion/formulario',         sessionController.loginRequired, coleccionController.formulario);
router.get('/coleccion/show',               sessionController.loginRequired, coleccionController.show);
router.get('/coleccion/new',                sessionController.loginRequired, coleccionController.new);
router.post(
  '/coleccion',
  sessionController.loginRequired,
  sessionController.adminOrMyselfByNameRequired,
  coleccionController.create
);
//router.post('/coleccion',                   sessionController.loginRequired, coleccionController.create);
router.delete('/coleccion/:monedaId(\\d+)', sessionController.loginRequired, coleccionController.adminOrColeccionistaRequired, coleccionController.destroy);
router.get('/coleccion/seeders',            sessionController.loginRequired, sessionController.adminRequired, coleccionController.seeders);
router.get('/coleccion/tabla',              sessionController.loginRequired, coleccionController.tabla);
router.get('/coleccion/tabla/show',         coleccionController.tabla_show);

//Rutas para el recurso users
router.get('/users', sessionController.loginRequired, userController.index);
router.get('/users/:userId(\\d+)', sessionController.loginRequired, userController.show);
router.get('/users/new', sessionController.loginRequired, sessionController.adminRequired, userController.new);
router.post('/users', sessionController.loginRequired, sessionController.adminRequired, userController.create);
router.get('/users/:userId(\\d+)/edit', sessionController.loginRequired, sessionController.adminOrMyselfRequired, userController.edit);
router.put('/users/:userId(\\d+)', sessionController.loginRequired, sessionController.adminOrMyselfRequired, userController.update);
router.delete('/users/:userId(\\d+)', sessionController.loginRequired, sessionController.adminRequired, userController.destroy);
router.get('/users/:userId(\\d+)/coleccion', sessionController.loginRequired, coleccionController.index);


// Página de reconocimiento
router.get('/identify', sessionController.loginRequired, function(req, res, next) {
  res.render('identify');
});

// Confirmar moneda reconocida

router.post(
  '/identify/confirm',
  sessionController.loginRequired,
  upload.none(),
  async function(req, res, next) {
    try {
      console.log('ENTRA EN /identify/confirm');
      console.log('BODY:', req.body);

      const {
        pais,
        valor,
        tipo2e,
        anio,
        ceca,
        monedaDetectada
      } = req.body;

      let moneda = valor;
      let tipo = '';

      if (valor === '2€' && tipo2e === 'conmemorativa') {
        tipo = 'conmemorativa';

        // IMPORTANTE:
        // No fijar Com1 por defecto.
        // Solo usar monedaDetectada si ya viene explícita y válida.
        if (monedaDetectada && /^2€ Com[123]$/.test(monedaDetectada)) {
          moneda = monedaDetectada;
        } else {
          moneda = null;
        }
      }

      const usuarios = await models.Usuario.findAll({
        order: [['nombre', 'ASC']]
      });

      return res.json({
        ok: true,
        monedaConfirmada: {
          pais,
          valor,
          moneda,
          anio: anio || null,
          ceca: ceca || null,
          tipo
        },
        loginUser: {
          id: req.loginUser.id,
          displayName: req.loginUser.displayName,
          isAdmin: req.loginUser.isAdmin
        },
        usuarios: usuarios.map(u => ({
          id: u.id,
          nombre: u.nombre
        }))
      });

    } catch (error) {
      console.error('ERROR EN /identify/confirm:', error);

      return res.status(500).json({
        ok: false,
        error: error.message || 'Error interno en confirmación'
      });
    }
  }
);



module.exports = router;
