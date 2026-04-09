const path = require('path');

// Load ORM
const Sequelize = require('sequelize');


// Environment variable to define the URL of the data base to use.
// To use SQLite data base:
//    DATABASE_URL = sqlite:colec_euros.sqlite
// To use  Heroku Postgres data base:
//    DATABASE_URL = postgres://user:passwd@host:port/database
const fs = require('fs');



const url = process.env.DATABASE_URL || "sqlite:/data/colec_euros.sqlite";
// const dbPath = proccess.env.DB_PATH || '/data/colec_euros.sqlite';

const dbPath = process.env.DB_PATH || 'colec_euros.sqlite';
const dir = path.dirname(dbPath);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// const sequelize = new Sequelize(url);

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath
});

// Import la definición de la tabla Coleccion  de coleccion.js
//const Coleccion = sequelize.import(path.join(__dirname, 'coleccion'));
const Coleccion = require(path.join(__dirname, 'coleccion'))(sequelize, Sequelize);

// Import la definición de la tabla paises  de paises.js
//const Paises = sequelize.import(path.join(__dirname, 'paises'));
const Paises = require(path.join(__dirname, 'paises'))(sequelize, Sequelize);

// Import la definición de la tablas de usuarios de use.js 
//const Usuario = sequelize.import(path.join(__dirname,'usuario'));
const Usuario = require(path.join(__dirname, 'usuario'))(sequelize, Sequelize);

// Import the definition of the Attachments Table from attachment.js
//const Attachment = sequelize.import(path.join(__dirname,'attachment'));

// Session
//sequelize.import(path.join(__dirname,'session'));
const Session = require(path.join(__dirname, 'session'))(sequelize, Sequelize);


//Relaciones con la tabla coleccion

Coleccion.belongsTo(Usuario, {
  as: "coleccionista",
  foreignKey: "coleccionistaId",
  onDelete: "CASCADE"
});
Usuario.hasMany(Coleccion, {
  as: "monedasCol",
  foreignKey: "coleccionistaId",
});

Coleccion.belongsTo(Paises, {
  as: "pais",
  foreignKey: "paisId",
  onDelete: "CASCADE"
});

Paises.hasMany(Coleccion, {
    as: "paisCol",
    foreignKey: "paisId",
  });

module.exports = sequelize;
