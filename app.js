require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
//var logger = require('morgan');
var session = require('express-session');
var SequelizeStore = require('connect-session-sequelize')(session.Store);
var partials = require('express-partials');
var flash = require('express-flash');
var methodOverride = require('method-override');
var redirectToHTTPS = require('express-http-to-https').redirectToHTTPS;
const passport = require('passport');
var indexRouter = require('./routes/index');



var app = express();

// Habilitar trust proxy para Render
app.enable('trust proxy');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//Para identificar monedas
var apiIdentifyRouter = require('./routes/api_identify');
app.use('/api', apiIdentifyRouter);

//Para Render
//if (process.env.RENDER !== 'true') {
if (process.env.RENDER === 'true') {
  app.use(redirectToHTTPS([/localhost:(\d{4})/], [], 301));
}
// La siguiente instrucción la quito para render
//Redirect HTTP tp HTTPS
// No redirige si el hostname es localhost:port (port=3000,5000)
// app.use(redirectToHTTPS([/localhost:(\d{4})/], [], 301));

app.use(partials());
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
//app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

var sequelize = require("./models");
var sessionStore = new SequelizeStore({
  db: sequelize,
  table: "Session",
  checkExpirationInterval: 15*60*1000,
  expiration: 4*60*60*1000
});
app.use(session({
  secret: "Coleccion Euros",
  store: sessionStore,
  resave: false,
  saveUninitialized: true
}));
app.use(methodOverride('_method', {methods: ["POST", "GET"]}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(flash());
app.use(passport.initialize( {
  userProperty: 'loginUser' // defaults to 'user' if omitted
}));
app.use(passport.session());

app.use(function(req, res, next) {

  // To use req.loginUser in the views
  res.locals.loginUser = req.loginUser && {
      id: req.loginUser.id,
      displayName: req.loginUser.displayName,
      isAdmin: req.loginUser.isAdmin
  };
  next();
});

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
