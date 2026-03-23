const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const {models} = require("../models");
const paginate = require('../helpers/paginate').paginate;
const fs = require("fs");
const path = require('path');

//const attHelper = require("../helpers/attachments");
const req = require("express/lib/request");
const res = require("express/lib/response");
const { where } = require("sequelize");
const { KeyObject } = require("crypto");

const FICHERO_LOG = `./log/Fichero_log.txt`;

//Promisificar writeFile
function writeFileP(file, data) {
    return new Promise(
        (resolve, reject) => fs.writeFile(
            file,
            data,
            (err) => err ? reject(err) : resolve()
        )
    )
};

//Promisificar appendFile
function appendFileP(file, data) {
    return new Promise(
        (resolve, reject) => fs.appendFile(
            file,
            data,
            (err) => err ? reject(err) : resolve()
        )
    )
};

let tipo_monedas = ["1c", "2c", "5c", "10c", "20c", "50c", "1€", "2€", "2€ Com1", "2€ Com2", "2€ Com3", "12€_1", "12€_2"];
let cecas_alemania = ["A", "F", "G", "J", "D"];

function tabla_coleccion(coleccion, pais, año_inicio) {
    //Crear tabla vacia
    let tabla = {};
    if (coleccion.length === 0) {
         año_max = new Date().getFullYear();
    } else {
         año_max = coleccion[0].año >= new Date().getFullYear() ?  coleccion[0].año : new Date().getFullYear();
    }
    
    for (let año = año_inicio; año <= año_max; año++) {
        if (pais === "Alemania") {
            cecas_alemania.forEach(ceca => {  
                tabla["_"+año.toString()+ceca] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            });  
        } else {
            tabla["_"+año.toString()] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        }     
    };

    //Rellenar la tabla
    for (const i in coleccion) {
        let moneda = coleccion[i];
        const año = moneda.año;
        const ceca= moneda.ceca || '';
        const tipo = moneda.moneda;
        let i_moneda = tipo_monedas.indexOf(tipo);
        if (ceca) {
            tabla["_"+año.toString()+ceca][i_moneda] += 1;
        } else {
            tabla["_"+año.toString()][i_moneda] += 1;
        }       
    };

    return (tabla);
};

function fecha_hoy () {
    let fecha = new Date();
    let dia = fecha.getDate();
    dia = dia > 9 ? dia : '0' + dia;
    let mes = fecha.getMonth()+1;
    mes = mes > 9 ? mes : '0' + mes;
    let año = fecha.getFullYear();
    let hora = fecha.getHours();
    hora = hora > 9 ? hora : '0' + hora;
    let minuto = fecha.getMinutes();
    minuto = minuto > 9 ? minuto :'0' + minuto;
    let segundo = fecha.getSeconds();
    segundo = segundo > 9 ? segundo :'0' + segundo;
    let fecha_continua = `${año}${mes}${dia}${hora}${minuto}${segundo}`;
    let fecha_guiones = `${dia}-${mes}-${año} ${hora}:${minuto}:${segundo}`;
    return([fecha_continua, fecha_guiones]);
}

function construir_seeder(coleccion) {
    const [fecha_continua, fecha_guiones] = fecha_hoy();
    const NOMBRE_FICHERO = `./seeders/${fecha_continua}-LlenadoTablaColeccion.js`;
    const FECHA = `// Seeders creado en la fecha:  ${fecha_guiones}\n`;
    const CABECERA = `                  "use strict";
                    module.exports = {
                    up: (queryInterface, Sequelize) => {
                        return queryInterface.bulkInsert("Coleccion", [\n`;

    const FIN = `                   ]);
                },

                down: (queryInterface, Sequelize) => {
                    return queryInterface.bulkDelete("Coleccion", null, {});
                },
            };`;

    let buffer = FECHA;   
    buffer += CABECERA;        
/*
    fs.writeFile(
        NOMBRE_FICHERO,
        CABECERA,
        function (err) {
            if (err) throw err;
            console.log('Cabecera añadida');
        }
    );
*/
    for (var i in coleccion) {
        var monedas = coleccion[i];
        let datos =
                    `                   {
                    coleccionistaId: ${monedas.coleccionistaId},
                    paisId: "${monedas.paisId}",
                    ceca: "${monedas.ceca}",
                    año: ${monedas.año},
                    moneda: "${monedas.moneda}",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    },\n`;
        buffer += datos;
/*                    
        fs.appendFile(
            NOMBRE_FICHERO,
            datos,
            function (err) {
                if (err) throw err;
                console.log('Dato añadido');
            }
        );
*/
    }

    buffer += FIN;
/*
    fs.writeFile(
        NOMBRE_FICHERO,
        buffer,
        function (err) {
            if (err) throw err;
            console.log('Seeders creado');
        }
    );
*/
    return ([NOMBRE_FICHERO, buffer]);
}



function calcular_valor (coleccion) {
    let valor = 0;
    for (var i in coleccion) { 
        var monedas = coleccion[i];
        switch (monedas.moneda) {
            case "1c":
                valor += 0.01;
                break;
            case "2c":
                valor += 0.02;
                break;
            case "5c":
                valor += 0.05;
                break;
            case "10c":
                valor += 0.1;
                break;    
            case "20c":
                valor += 0.2;
                break;
            case "50c":
                valor += 0.5;
                break;
            case "1€":
                valor += 1;
                break;
            case "12€_1":
            case "12€_2":
                valor += 12;
                break;
            case "2€":   
            case "2€ Com1": 
            case "2€ Com2":
            case "2€ Com3":
                valor += 2;
                break;       
        }
    }
    return (valor.toFixed(2));
};

// Autoload la moneda de la coleccion asociad a :monedaId
exports.load = async (req, res, next, monedaId) => {

    try {
        const moneda = await models.Coleccion.findByPk(monedaId);
        if (moneda) {
            req.load = {...req.load, moneda};
            next();
        } else {
            throw new Error('No existe una moneda con Id=' + monedaId);
        }
    } catch (error) {
        next(error);
    }
};

// MW que permite acciones solo si el usuario logeado es administrador o es el dueño de la moneda.
exports.adminOrColeccionistaRequired = (req, res, next) => {

    const isAdmin = !!req.loginUser.isAdmin;
    const isColeccionista = req.load.moneda.coleccionistaId === req.loginUser.id;

    if (isAdmin || isColeccionista) {
        next();
    } else {
        console.log('Operación prohibida: El usuario no es el dueño de la moneda o no es administrador.');
        res.send(403);
    }
};

// GET coleccion
exports.index =async (req, res, next) => {
    let coleccionista = '';
    if (req.load && req.load.user) {
        coleccionista = req.load.user || '';
    }
    try {
        res.render('coleccion/index', {coleccionista});
    } catch (error) {
        next(error);
    }
};

// GET /coleccion/formulario
exports.formulario = async (req, res, next) => {
    const {query} = req;
    const tipo = query.tipo || '';
    const coleccionista = query.nombre || '';
    try {
        const paises = await models.Paises.findAll();
        const usuarios = await models.Usuario.findAll();
        req.flash('info', 'Introduzca los datos para la consulta que desea realizar. No es obligatorio rellenar todos los datos');
        res.render('coleccion/formulario', {paises, usuarios, tipo, coleccionista});
    } catch (error) {
        next(error);
    }
};

// GET /coleccion/show
exports.show = async (req, res, next) => {
    let options = {
        where: {},
        include: [],
        order: [[{ model: models.Usuario, as: 'coleccionista' }, 'nombre'], ['año'], [Sequelize.literal('CASE WHEN "moneda" = "1c" THEN 1 WHEN "moneda" = "2c" THEN 2 WHEN "moneda" = "5c" THEN 3 WHEN "moneda" = "10c" THEN 4 WHEN "moneda" = "20c" THEN 5 WHEN "moneda" = "50c" THEN 6 WHEN "moneda" = "1€" THEN 7 WHEN "moneda" = "2€" THEN 8 WHEN "moneda" = "2€ Com1" THEN 9 WHEN "moneda" = "2€ Com2" THEN 10 WHEN "moneda" = "2€ Com3" THEN 11 WHEN "moneda" = "12€_1" THEN 12 WHEN "moneda" = "12€_2" THEN 13 ELSE 14 END') ]]
        //order: [Sequelize.literal('CASE WHEN "moneda" = "1c" THEN 1 WHEN "moneda" = "2c" THEN 2 WHEN "moneda" = "5c" THEN 3 WHEN "moneda" = "10c" THEN 4 WHEN "moneda" = "20c" THEN 5 WHEN "moneda" = "50c" THEN 6 WHEN "moneda" = "1€" THEN 7 WHEN "moneda" = "2€" THEN 8 WHEN "moneda" = "2€ Com1" THEN 9 WHEN "moneda" = "2€ Com2" THEN 10 WHEN "moneda" = "2€ Com3" THEN 11 WHEN "moneda" = "12€_1" THEN 12 WHEN "moneda" = "12€_2" THEN 13 ELSE 14 END') ]
    };

    const {query} = req;
    const mi_coleccion = query.mi_coleccion || '';
    const tipo = query.tipo || '';
    const coleccionista = query.coleccionista || '';
    const pais = query.pais || '';
    const ceca = query.ceca || '';
    const valor = query.valor || '';
    const año = query.año || '';

    if (pais === "Alemania") {
        if (ceca) options.where.ceca = ceca;
    }

    if (!pais && ceca)  options.where.ceca = ceca;
    
    if ((valor) && (valor === "12€")) {
        options.where.moneda = {[Op.like]: '12€_%'}
    } else if (valor){
        options.where.moneda = valor;
    }else if (tipo){
        options.where.moneda = {[Op.like]: '2€_Com%'}
    } else {
        options.where.moneda = {[Op.notLike]: '2€_Com%'}
    }

    if (año) options.where.año = año;

    if (coleccionista) {
        options.include.push({
        model: models.Usuario,
        as: "coleccionista",
        where: {nombre: coleccionista}
        });
    } else {
        options.include.push({
        model: models.Usuario,
        as: "coleccionista"
        });   
    }

    if (pais) {
        options.include.push({
        model: models.Paises,
        as: "pais",
        where: {nombre: pais}
        });
    } else {
        options.include.push({
        model: models.Paises,
        as: "pais"
        });   
    }

    try {
        const consulta_completa = await models.Coleccion.findAll(options);
        const valor = calcular_valor (consulta_completa);
        const count =await models.Coleccion.count(options);
        if (count === 0) {
            req.flash("info", "No hay ningún resultado para la consulta.");
        }
        //Paginación
        const items_per_page = 10;
        const pageno = parseInt(req.query.pageno) || 1;
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        options.offset = items_per_page * (pageno - 1);
        options.limit = items_per_page;

        const coleccion = await models.Coleccion.findAll(options);
        res.render('coleccion/show', {coleccion, tipo, mi_coleccion, count, valor});
    } catch (error) {
        next(error);
    }
};

// GET /coleccion/new
exports.new = async (req, res, next) => {
    const {query} = req;
    const tipo = query.tipo || '';
    try {
        const paises = await models.Paises.findAll();
        const usuarios = await models.Usuario.findAll();
        req.flash('info', 'Los campos no pueden estar vacíos, salvo el campo CECA si el pais no es Alemania.');
        res.render('coleccion/new', {paises, usuarios, tipo});
    } catch (error) {
        next(error);
    }
};

/*
// GET /coleccion/series/:monedaId(\\d+)/edit
exports.edit_series = async (req, res, next) => {

    const {moneda} = req.load;

    try {

        //res.render('monedas/show', {pais});
    } catch (error) {
        next(error);
    }
};
*/

// POST /coleccion    create

exports.create = async (req, res, next) => {
    const mi_coleccion = '';

    let { coleccionista, pais, ceca, valor, año, tipo } = req.body;

    if (pais === "Alemania"
        ? (coleccionista && pais && valor && año && ceca)
        : (coleccionista && pais && valor && año)) {

        // 🔧 NORMALIZACIÓN DE PAÍSES
        const normalizarPais = (nombre) => {
            const map = {
                'Mónaco': 'Monaco',
                'Bélgica': 'Belgica',
                'San Marino': 'San_Marino',
                'Países Bajos': 'Holanda',
                'Paises Bajos': 'Holanda'
            };
            return map[nombre] || nombre;
        };

        const paisNormalizado = normalizarPais(pais);

        let options = {
            where: {},
            include: []
        };

        if (pais === "Alemania" && ceca) {
            options.where.ceca = ceca;
        } else {
            options.where.ceca = '';
            ceca = '';
        }

        options.where.moneda = valor;
        options.where.año = año;

        options.include.push({
            model: models.Usuario,
            as: "coleccionista",
            where: { nombre: coleccionista }
        });

        options.include.push({
            model: models.Paises,
            as: "pais",
            where: { nombre: paisNormalizado }
        });

        try {
            // 🔍 Buscar usuario
            const usuario = await models.Usuario.findOne({
                where: { nombre: coleccionista }
            });

            if (!usuario) {
                req.flash('error', `No existe el coleccionista "${coleccionista}".`);
                return res.redirect('/identify');
            }

            const id_coleccionista = usuario.id;

            // 🔍 Buscar país
            const pais_db = await models.Paises.findOne({
                where: { nombre: paisNormalizado }
            });

            if (!pais_db) {
                req.flash('error', `No existe el país "${pais}" en la base de datos.`);
                return res.redirect('/identify');
            }

            const id_pais = pais_db.id;

            // 🔍 Comprobar si ya existe
            const moneda_existente = await models.Coleccion.findOne(options);

            if (!moneda_existente) {

                const moneda = await models.Coleccion.create({
                    ceca: ceca,
                    año: Number(año),
                    moneda: valor,
                    coleccionistaId: id_coleccionista,
                    paisId: id_pais
                });

                req.flash('success', 'Moneda creada correctamente.');

                // 📝 LOG
                try {
                    const [_, fecha_guiones] = fecha_hoy();
                    const log = `CREAR: FECHA: ${fecha_guiones}, USUARIO: ${req.loginUser.displayName}, COLECCIONISTA: ${moneda.coleccionistaId}, PAIS: ${moneda.paisId}, AÑO: ${moneda.año}, MONEDA: ${moneda.moneda}, CECA: ${moneda.ceca}\n`;
                    await appendFileP(FICHERO_LOG, log);
                } catch (error) {
                    req.flash('error', 'Error al escribir el log.');
                }

                // Mostrar solo la moneda recién creada, como antes
                const coleccion = await models.Coleccion.findAll(options);
                const count = 0;

                return res.render('coleccion/show', { coleccion, tipo, mi_coleccion, count, valor });

                
            } else {
                req.flash('error', 'La moneda ya existe.');
                return res.redirect('/identify');
            }

        } catch (error) {
            if (error instanceof Sequelize.ValidationError) {
                req.flash('error', 'Hay errores de validación.');
                error.errors.forEach(({ message }) => req.flash('error', message));
                return res.redirect('/identify');
            } else {
                req.flash('error', 'Error al crear una nueva moneda.');
                return next(error);
            }
        }

    } else {
        req.flash('error', 'Los campos no pueden estar vacíos, salvo CECA si el país no es Alemania.');
        return res.redirect('/identify');
    }
};



/*
exports.create = async (req, res, next) => {
    const mi_coleccion = '';
        
    let {coleccionista, pais, ceca, valor, año, tipo} = req.body;
    //if ((coleccionista && pais && valor && año) && (pais === "Alemania" && ceca) ){
    if (pais === "Alemania" ? (coleccionista && pais && valor && año && ceca) : (coleccionista && pais && valor && año)){
        
        let options = {
            where: {},
            include: []
        };
    
        if ((ceca) && pais === "Alemania") { 
            options.where.ceca = ceca;
        } else {
            options.where.ceca = '';
            ceca = '';
        };

        options.where.moneda = valor;

        options.where.año = año;
        
        options.include.push({
            model: models.Usuario,
            as: "coleccionista",
            where: {nombre: coleccionista}
        });

        options.include.push({
            model: models.Paises,
            as: "pais",
            where: {nombre: pais}
        });
        
        try {
            let usuario_moneda = await models.Usuario.findAll ({where: {nombre: coleccionista}});
            const id_coleccionista = usuario_moneda[0].id;

            let pais_moneda = await models.Paises.findAll({where: {nombre: pais}});
            const id_pais = pais_moneda[0].id;

            const moneda_nueva = await models.Coleccion.findAll(options);
            if (!moneda_nueva[0]) {
                        
                const moneda = await models.Coleccion.create({
                    ceca: ceca,
                    año: Number(año),
                    moneda: valor,
                    coleccionistaId: id_coleccionista,
                    paisId: id_pais
                });

                const coleccion = await models.Coleccion.findAll(options);
                const count = 0;
                req.flash('success', 'Moneda creada correctamente.');  
                try {
                    // Escribir en fichero de log
                    const [fecha_continua, fecha_guiones] = fecha_hoy();
                    const log = `CREAR: FECHA: ${fecha_guiones}, USUARIO: ${req.loginUser.displayName}, COLECCIONISTA: ${moneda.coleccionistaId}, PAIS: ${moneda.paisId}, AÑO: ${moneda.año}, MONEDA: ${moneda.moneda}, CECA: ${moneda.ceca}\n`;
                    await appendFileP(FICHERO_LOG, log);
                } catch (error) {
                    req.flash('error', 'Error al escribir el log.');
                }      
                res.render('coleccion/show', {coleccion, tipo, mi_coleccion, count, valor});

            } else {
                //Mensaje flash de que la moneda ya existe
                req.flash('error', 'La moneda ya existe.');
                if (tipo) {   
                    res.redirect('/coleccion/new?tipo=conmemorativa');
                } else {
                    res.redirect('/coleccion/new');
                }
            }

        } catch (error) {
            if (error instanceof Sequelize.ValidationError) {
                req.flash('error', 'Hay errores de validación.');
                error.errors.forEach(({message}) => req.flash('error', message));
                if (tipo) {   
                    res.redirect('/coleccion/new?tipo=conmemorativa');
                } else {
                    res.redirect('/coleccion/new');
                }
            } else {
                req.flash('error', 'Error al crear una nueva moneda.');
                next(error)
            }                        
        } 
            
    } else {
        // ¿Mensaje flash de que no pueden ser campos vacíos salvo CECA si no es Alemania?
        req.flash('error', 'Los campos no pueden estar vacíos, salvo el campo CECA si el pais no es Alemania.');
        if (tipo) {   
            res.redirect('/coleccion/new?tipo=conmemorativa');
        } else {
            res.redirect('/coleccion/new');
        } 
    }

};
*/
        /*
// PUT /coleccion/series/:monedaId(\\d+)
exports.update_series = async (req, res, next) => {

    const {moneda} = req.load;

    try {

        //res.render('monedas/show', {pais});
    } catch (error) {
        next(error);
    }
};
*/

// DELETE /coleccion/:monedaId(\\d+)
exports.destroy = async (req, res, next) => {

    const {moneda} = req.load;

    try {
        await req.load.moneda.destroy();
        req.flash('success', 'Moneda borrada correctamente.');
        //res.redirect('/coleccion');
        //res.redirect('/goback')
        try {
            // Escribir en fichero de log
            const [fecha_continua, fecha_guiones] = fecha_hoy();
            const log = `BORRAR: FECHA: ${fecha_guiones}, USUARIO: ${req.loginUser.displayName}, COLECCIONISTA: ${moneda.coleccionistaId}, PAIS: ${moneda.paisId}, AÑO: ${moneda.año}, MONEDA: ${moneda.moneda}, CECA: ${moneda.ceca}\n`;
            await appendFileP(FICHERO_LOG, log);
        } catch (error) {
            req.flash('error', 'Error al escribir el log.');
        }
    } catch (error) {
        req.flash('error', 'Error al borrar la moneda.' + error.message); 
        next(error); 
    } finally {
        res.redirect('/coleccion');
    }
};
/*
// DELETE /coleccion/:monedaId(\\d+)
exports.destroy = async (req, res, next) => {

    const {moneda} = req.load;

    try {
        await req.load.moneda.destroy();
        // Escribir en fichero de log
        const [fecha_continua, fecha_guiones] = fecha_hoy();
        const log = `BORRAR: FECHA: ${fecha_guiones}, USUARIO: ${req.loginUser.displayName}, COLECCIONISTA: ${moneda.coleccionistaId}, PAIS: ${moneda.paisId}, AÑO: ${moneda.año}, MONEDA: ${moneda.moneda}, CECA: ${moneda.ceca}\n`;
        await appendFileP(FICHERO_LOG, log);

        req.flash('success', 'Moneda borrada correctamente.');
        res.redirect('/coleccion');
        //res.redirect('/goback')
    } catch (error) {
        req.flash('error', 'Error al borrar la moneda.' + error.message); 
        next(error); 
    }
};

*/

// GET /coleccion/seeders
// Este seeders lo pongo para adaptar al funcionamiento de Render. 
// Render no mantiene los ficheros creados y voy a hacer que una vez creado directamente lo descargo y ya lo guardo como quiera.

exports.seeders = async (req, res, next) => {
  try {
    const coleccion = await models.Coleccion.findAll();

    const [NOMBRE_FICHERO, buffer] = construir_seeder(coleccion);

    const fileName = path.basename(NOMBRE_FICHERO);

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.send(buffer);
  } catch (error) {
    next(error);
  }
};


/*
// Este lo cambio para poner uno que se adapte a render, ya que render no mantiene los ficheros creados.
// GET /coleccion/seeders
exports.seeders = async (req, res, next) => {
    try {
        const coleccion = await models.Coleccion.findAll();
        const [NOMBRE_FICHERO, buffer]  = construir_seeder(coleccion);
        await writeFileP(NOMBRE_FICHERO, buffer);
        req.flash('success', 'Seeders creado.');
        res.redirect('/');
         // res.download(NOMBRE_FICHERO);
    } catch (error) {
        next(error);
    }
};
*/

// GET coleccion/tabla
exports.tabla =async (req, res, next) => {
    
    try {
        const paises = await models.Paises.findAll();
        const usuarios = await models.Usuario.findAll();
        req.flash('info', 'Introduzca los datos para la consulta que desea realizar.El campo "pais"es obligatorio');
        res.render('coleccion/form_tabla', {paises, usuarios});
    } catch (error) {
        next(error);
    }
};

// GET coleccion/tabla/show
exports.tabla_show =async (req, res, next) => {
    let options = {
        where: {},
        order: [
            ['año', 'DESC']
          ],
        include: []
    };
    const {query} = req;
    const coleccionista = query.coleccionista || '';
    const pais = query.pais || '';

    // Es necesario indicar un pais.
    if (!pais) {
        req.flash('error', 'Es necesario indicar un pais.');
        return res.redirect('/coleccion/tabla');;
    }

    if (coleccionista) {
        options.include.push({
        model: models.Usuario,
        as: "coleccionista",
        where: {nombre: coleccionista}
        });
    } else {
        options.include.push({
        model: models.Usuario,
        as: "coleccionista"
        });   
    }

    if (pais) {
        options.include.push({
        model: models.Paises,
        as: "pais",
        where: {nombre: pais}
        });
    } else {
        options.include.push({
        model: models.Paises,
        as: "pais"
        });   
    }

    try {
        const datos_pais = await models.Paises.findOne({where:{nombre: pais}});
        const año_inicio = datos_pais.año_inicio;
        const coleccion = await models.Coleccion.findAll(options);
        const tabla = tabla_coleccion(coleccion, pais, año_inicio);
        const valor = calcular_valor (coleccion);
        const count =await models.Coleccion.count(options);
        res.render('coleccion/tabla', {tabla, pais, año_inicio,count, valor});
    } catch (error) {
        next(error);
    }
};