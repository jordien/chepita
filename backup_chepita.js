// ============================================================
// LIBRERIAS NECESARIAS
// ============================================================
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// CONFIGURACION DE LA BASE DE DATOS
// ============================================================
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'chepita7',
    port: 3306
};

// ============================================================
// CARPETA PRINCIPAL DE RESPALDOS
// ============================================================
const backupBasePath = path.join(os.homedir(), 'Desktop', 'RESPALDOS_CHEPITA');

const folders = ['DIARIOS', 'EXTRA', 'LOGS'];

folders.forEach(folder => {
    const folderPath = path.join(backupBasePath, folder);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
});

const configFile = path.join(backupBasePath, 'config.json');

// ============================================================
// FUNCION 1: Obtener fecha y hora para nombres de archivo
// ============================================================
function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
}

// ============================================================
// FUNCION 2: Escribir en el archivo de registro (LOG)
// ============================================================
function writeLog(message, tipo = 'INFO') {
    const logPath = path.join(backupBasePath, 'LOGS', `respaldo_${new Date().toISOString().slice(0,10)}.log`);
    const logMessage = `[${new Date().toLocaleString()}] [${tipo}] ${message}\n`;
    fs.appendFileSync(logPath, logMessage);
    console.log(logMessage.trim());
}

// ============================================================
// FUNCION 3: Guardar y cargar configuracion
// ============================================================
function guardarConfiguracion(confs) {
    fs.writeFileSync(configFile, JSON.stringify(confs, null, 2));
}

function cargarConfiguracion() {
    if (fs.existsSync(configFile)) {
        return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
    return { 
        ultimaLlegada: null, 
        fechaUltimaLlegada: null,
        respaldosRealizados: [],
        horariosProgramados: null,
        fechaExtras: null,
        extrasHoy: 0,
        ultimoRespaldoExtra: null
    };
}

// ============================================================
// FUNCION 4: Verificar si ya existe un respaldo
// ============================================================
function verificarRespaldoEnRango(tipo, fecha, horaInicio, horaFin) {
    const carpeta = path.join(backupBasePath, 'DIARIOS');
    if (!fs.existsSync(carpeta)) return false;
    
    const archivos = fs.readdirSync(carpeta);
    const fechaStr = fecha.toISOString().slice(0,10);
    
    return archivos.some(archivo => {
        if (!archivo.includes(fechaStr) || !archivo.includes(tipo)) return false;
        
        const horaMatch = archivo.match(/_(\d{2})-(\d{2})-\d{2}\.sql$/);
        if (horaMatch) {
            const horaArchivo = parseInt(horaMatch[1]);
            const minutoArchivo = parseInt(horaMatch[2]);
            const minutosArchivo = horaArchivo * 60 + minutoArchivo;
            
            return minutosArchivo >= horaInicio && minutosArchivo <= horaFin;
        }
        return false;
    });
}

// ============================================================
// FUNCION 5: HACER EL RESPALDO (PARTE MAS IMPORTANTE)
// ============================================================
async function hacerRespaldo(tipo, esExtra = false) {
    const ahora = new Date();
    
    const backupFile = path.join(
        backupBasePath, 
        esExtra ? 'EXTRA' : 'DIARIOS',
        `chepita7_${tipo}_${getTimestamp()}.sql`
    );
    
    writeLog(`INICIANDO RESPALDO ${tipo}`, 'BACKUP');

    return new Promise((resolve) => {
        const connection = mysql.createConnection(dbConfig);
        
        connection.connect((err) => {
            if (err) {
                writeLog(`ERROR DE CONEXION: ${err.message}`, 'ERROR');
                resolve(false);
                return;
            }

            connection.query('SHOW TABLES', (err, tables) => {
                if (err) {
                    writeLog(`Error: ${err.message}`, 'ERROR');
                    connection.end();
                    resolve(false);
                    return;
                }

                const tableNames = tables.map(row => Object.values(row)[0]);
                let sqlContent = `-- RESPALDO CHEPITA - ${tipo}\n-- Fecha: ${new Date().toLocaleString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`;
                let tablasProcesadas = 0;
                let totalRegistros = 0;

                tableNames.forEach(tableName => {
                    connection.query(`SELECT * FROM ${tableName}`, (err, rows) => {
                        if (!err && rows) {
                            sqlContent += `TRUNCATE TABLE ${tableName};\n`;
                            
                            rows.forEach(row => {
                                const columns = Object.keys(row);
                                const values = Object.values(row).map(val => {
                                    if (val === null) return 'NULL';
                                    if (val instanceof Date) return `'${val.toISOString().slice(0,19).replace('T',' ')}'`;
                                    if (typeof val === 'string') return `'${val.replace(/'/g,"\\'")}'`;
                                    return val;
                                });
                                sqlContent += `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${values.join(',')});\n`;
                            });
                            totalRegistros += rows.length;
                            writeLog(`Tabla ${tableName}: ${rows.length} registros`, 'BACKUP');
                        }

                        tablasProcesadas++;
                        
                        if (tablasProcesadas === tableNames.length) {
                            sqlContent += `\nSET FOREIGN_KEY_CHECKS=1;\n`;
                            fs.writeFileSync(backupFile, sqlContent);
                            const sizeMB = (fs.statSync(backupFile).size / (1024*1024)).toFixed(2);
                            writeLog(`RESPALDO COMPLETADO: ${path.basename(backupFile)} (${sizeMB} MB, ${totalRegistros} registros)`, 'EXITO');
                            connection.end();
                            resolve(true);
                        }
                    });
                });
            });
        });
    });
}

// ============================================================
// FUNCION 6: ELIMINAR RESPALDOS VIEJOS AUTOMATICAMENTE
// ============================================================
function eliminarRespaldosViejos() {
    const diasAGuardar = {
        DIARIOS: 30,
        EXTRA: 3,
        LOGS: 15
    };
    
    const ahora = new Date();
    
    for (const [carpeta, dias] of Object.entries(diasAGuardar)) {
        const carpetaPath = path.join(backupBasePath, carpeta);
        if (!fs.existsSync(carpetaPath)) continue;
        
        const archivos = fs.readdirSync(carpetaPath);
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - dias);
        
        archivos.forEach(archivo => {
            const archivoPath = path.join(carpetaPath, archivo);
            const stats = fs.statSync(archivoPath);
            let fechaArchivo = stats.mtime;
            
            const fechaMatch = archivo.match(/(\d{4}-\d{2}-\d{2})/);
            if (fechaMatch) {
                fechaArchivo = new Date(fechaMatch[1]);
            }
            
            if (fechaArchivo < fechaLimite) {
                fs.unlinkSync(archivoPath);
                writeLog(`Eliminado respaldo viejo: ${archivo} (${carpeta})`, 'LIMPIEZA');
            }
        });
    }
}

// ============================================================
// FUNCION 7: CALCULAR HORARIOS SEGUN HORA DE LLEGADA
// ============================================================
function calcularHorariosInteligentes(horaLlegada, horaLlegadaMinutos) {
    const horarios = {
        apertura: { hora: horaLlegada, minuto: horaLlegadaMinutos },
        medioDia: null,
        cierre: null
    };
    
    let medioDiaMinutos = horaLlegada * 60 + horaLlegadaMinutos + (3 * 60);
    
    if (horaLlegada < 9) {
        medioDiaMinutos = 12 * 60 + 30;
    }
    else if (horaLlegada >= 14) {
        medioDiaMinutos = null;
    }
    
    if (medioDiaMinutos) {
        horarios.medioDia = {
            hora: Math.floor(medioDiaMinutos / 60),
            minuto: medioDiaMinutos % 60
        };
    }
    
    let cierreMinutos = horaLlegada * 60 + horaLlegadaMinutos + (8 * 60);
    const cierreMaximo = 17 * 60 + 30;
    
    if (cierreMinutos > cierreMaximo) {
        cierreMinutos = cierreMaximo;
    }
    
    horarios.cierre = {
        hora: Math.floor(cierreMinutos / 60),
        minuto: cierreMinutos % 60
    };
    
    return horarios;
}

// ============================================================
// FUNCION 8: DETECTAR CUANDO LA PERSONA ENCIENDE LA PC
// ============================================================
function detectarNuevaLlegada() {
    const ahora = new Date();
    const hoy = ahora.toISOString().slice(0,10);
    const horaActual = ahora.getHours();
    const minutoActual = ahora.getMinutes();
    
    const config = cargarConfiguracion();
    
    if (config.fechaUltimaLlegada === hoy) {
        return false;
    }
    
    writeLog(`NUEVA LLEGADA DETECTADA - ${horaActual}:${String(minutoActual).padStart(2,'0')}`, 'SISTEMA');
    
    const horarios = calcularHorariosInteligentes(horaActual, minutoActual);
    
    const nuevaConfig = {
        ultimaLlegada: `${horaActual}:${String(minutoActual).padStart(2,'0')}`,
        fechaUltimaLlegada: hoy,
        respaldosRealizados: [],
        horariosProgramados: horarios,
        fechaExtras: hoy,
        extrasHoy: 0,
        ultimoRespaldoExtra: null
    };
    guardarConfiguracion(nuevaConfig);
    
    writeLog(`Horarios calculados para hoy:`, 'SISTEMA');
    writeLog(`  Apertura: ${horarios.apertura.hora}:${String(horarios.apertura.minuto).padStart(2,'0')}`, 'SISTEMA');
    if (horarios.medioDia) {
        writeLog(`  Medio dia: ${horarios.medioDia.hora}:${String(horarios.medioDia.minuto).padStart(2,'0')}`, 'SISTEMA');
    }
    writeLog(`  Cierre: ${horarios.cierre.hora}:${String(horarios.cierre.minuto).padStart(2,'0')}`, 'SISTEMA');
    
    hacerRespaldo('APERTURA', false);
    
    return true;
}

// ============================================================
// FUNCION 9: VERIFICAR Y EJECUTAR RESPALDOS PROGRAMADOS
// ============================================================
async function verificarYEjecutarRespaldos() {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    const minutoActual = ahora.getMinutes();
    const totalMinutosActual = horaActual * 60 + minutoActual;
    
    const config = cargarConfiguracion();
    
    if (!config.horariosProgramados || config.fechaUltimaLlegada !== ahora.toISOString().slice(0,10)) {
        return;
    }
    
    const horarios = config.horariosProgramados;
    
    if (horarios.medioDia && !config.respaldosRealizados.includes('MEDIODIA')) {
        const medioDiaMinutos = horarios.medioDia.hora * 60 + horarios.medioDia.minuto;
        if (Math.abs(totalMinutosActual - medioDiaMinutos) <= 30) {
            writeLog(`EJECUTANDO RESPALDO DE MEDIO DIA (programado para ${horarios.medioDia.hora}:${String(horarios.medioDia.minuto).padStart(2,'0')})`, 'BACKUP');
            const exito = await hacerRespaldo('MEDIODIA', false);
            if (exito) {
                config.respaldosRealizados.push('MEDIODIA');
                guardarConfiguracion(config);
            }
        }
    }
    
    if (!config.respaldosRealizados.includes('CIERRE')) {
        const cierreMinutos = horarios.cierre.hora * 60 + horarios.cierre.minuto;
        if (totalMinutosActual >= cierreMinutos - 30) {
            if (!config.respaldosRealizados.includes('CIERRE')) {
                writeLog(`EJECUTANDO RESPALDO DE CIERRE (programado para ${horarios.cierre.hora}:${String(horarios.cierre.minuto).padStart(2,'0')})`, 'BACKUP');
                const exito = await hacerRespaldo('CIERRE', false);
                if (exito) {
                    config.respaldosRealizados.push('CIERRE');
                    guardarConfiguracion(config);
                }
            }
        }
    }
}

// ============================================================
// FUNCION 10: RESPALDOS EXTRA CADA HORA (VERSION MEJORADA)
// ============================================================
async function verificarRespaldoExtra() {
    const ahora = new Date();
    const hoy = ahora.toISOString().slice(0,10);
    const minutoActual = ahora.getMinutes();
    const config = cargarConfiguracion();
    
    // REINICIAR CONTADOR SI ES UN NUEVO DIA
    if (config.fechaExtras !== hoy) {
        config.fechaExtras = hoy;
        config.extrasHoy = 0;
        config.ultimoRespaldoExtra = null;
        guardarConfiguracion(config);
        writeLog(`NUEVO DIA - Contador de respaldos extras reiniciado`, 'SISTEMA');
    }
    
    const extrasHoy = config.extrasHoy || 0;
    
    // LIMITE DE 8 RESPALDOS EXTRAS POR DIA
    if (extrasHoy >= 8) {
        return;
    }
    
    // VERIFICAR QUE HAYA PASADO AL MENOS 1 HORA DESDE EL ULTIMO
    const ultimoRespaldoExtra = config.ultimoRespaldoExtra;
    if (ultimoRespaldoExtra) {
        const diferenciaHoras = (ahora - new Date(ultimoRespaldoExtra)) / (1000 * 60 * 60);
        if (diferenciaHoras < 1) {
            return;
        }
    }
    
    // RESPALDAR EN LOS PRIMEROS 5 MINUTOS DE CADA HORA
    if (minutoActual >= 0 && minutoActual <= 5) {
        writeLog(`EJECUTANDO RESPALDO EXTRA (respaldo de seguridad de las ${ahora.getHours()}:00)`, 'BACKUP');
        const exito = await hacerRespaldo(`EXTRA_${getTimestamp()}`, true);
        if (exito) {
            config.extrasHoy = extrasHoy + 1;
            config.ultimoRespaldoExtra = ahora.toISOString();
            if (!config.respaldosRealizados) config.respaldosRealizados = [];
            config.respaldosRealizados.push('EXTRA');
            guardarConfiguracion(config);
            writeLog(`RESPALDO EXTRA COMPLETADO. Totales hoy: ${config.extrasHoy} de 8`, 'BACKUP');
        }
    }
}

// ============================================================
// FUNCION 11: MONITOR PRINCIPAL
// ============================================================
function iniciarMonitor() {
    writeLog(`========================================`, 'SISTEMA');
    writeLog(`SISTEMA DE RESPALDOS AUTOMATICO ACTIVADO`, 'SISTEMA');
    writeLog(`Carpeta de respaldos: ${backupBasePath}`, 'SISTEMA');
    writeLog(`Revisando cada minuto si es necesario respaldar...`, 'SISTEMA');
    writeLog(`Respaldos extra: cada hora en punto, maximo 8 por dia`, 'SISTEMA');
    writeLog(`Respaldos extras se guardan por 3 dias y se eliminan solos`, 'SISTEMA');
    writeLog(`========================================`, 'SISTEMA');
    
    eliminarRespaldosViejos();
    detectarNuevaLlegada();
    
    setInterval(async () => {
        await verificarYEjecutarRespaldos();
        await verificarRespaldoExtra();
    }, 60 * 1000);
    
    setInterval(() => {
        eliminarRespaldosViejos();
    }, 24 * 60 * 60 * 1000);
}

// ============================================================
// EJECUCION PRINCIPAL
// ============================================================
console.log(`
============================================================================
     SISTEMA DE RESPALDO AUTOMATICO ADAPTABLE - MERCADO CHEPITA
============================================================================
     - Detecta automaticamente cuando enciendes la PC
     - Calcula horarios segun tu hora de llegada real
     - Hace respaldos de apertura, medio dia y cierre
     - Respaldos extra cada hora (maximo 8 por dia)
     - Respaldos extras se eliminan solos despues de 3 dias
     - Contador de respaldos extras se reinicia cada dia
     - Todo automatico en segundo plano
============================================================================
`);

iniciarMonitor();

process.stdin.resume();