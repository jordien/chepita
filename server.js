/**
 * ============================================================================
 * @file server.js
 * @description Servidor principal del Sistema de Gestión Comercial "Chepita"
 * @version 2.0 - Con sistema de autenticación de trabajadores por email
 * ============================================================================
 * 
 * 📌 PROCEDIMIENTOS ALMACENADOS UTILIZADOS EN ESTE SERVIDOR:
 * ============================================================================
 * 
 * 1. sp_listar_categorias      → GET /api/categorias           → Lista todas las categorías
 * 2. sp_listar_consumos        → GET /api/consumos             → Lista todos los consumos internos
 * 3. sp_productos_bajo_stock   → GET /api/productos/bajo-stock → Lista productos con stock < 10
 * 
 * ============================================================================
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const db = mysql.createConnection({
    host: '127.0.0.1', 
    user: 'root',
    password: '',
    database: 'chepita7',
    port: 3306
});

db.connect(err => {
    if (err) return console.error('Error de conexion:', err.message);
    console.log('✅ Conexion exitosa a la base de datos chepita7');
    
    // Crear tablas necesarias
    crearTablaTokens();
    crearTablaRecuperacionTokens();
    agregarColumnasIntentos(); // NUEVA FUNCIÓN
});

// ================= CONFIGURACIÓN DE GMAIL =================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'isabelchepita678@gmail.com',
        pass: 'cazx kvss xagg zepm'
    }
});

// Almacenamiento temporal de tokens
const resetTokens = {};

// Clave secreta para JWT
const SECRET_KEY = 'chepita_secret_key_2025';

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'PAG.html'));
});

// ================= FUNCIONES AUXILIARES =================

function crearTablaTokens() {
    const sql = `
        CREATE TABLE IF NOT EXISTS trabajador_registro_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_trabajador INT NOT NULL,
            token VARCHAR(255) NOT NULL,
            expira_en DATETIME NOT NULL,
            usado TINYINT DEFAULT 0,
            FOREIGN KEY (id_trabajador) REFERENCES trabajadores(Id_Trabajador)
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error('Error creando tabla de tokens:', err);
        else console.log('✅ Tabla trabajador_registro_tokens verificada');
    });
}

function crearTablaRecuperacionTokens() {
    const sql = `
        CREATE TABLE IF NOT EXISTS trabajador_recuperacion_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_trabajador INT NOT NULL,
            token VARCHAR(255) NOT NULL,
            expira_en DATETIME NOT NULL,
            usado TINYINT DEFAULT 0,
            FOREIGN KEY (id_trabajador) REFERENCES trabajadores(Id_Trabajador)
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error('Error creando tabla de recuperación:', err);
        else console.log('✅ Tabla trabajador_recuperacion_tokens verificada');
    });
}

// NUEVA FUNCIÓN: Agregar columnas de intentos fallidos si no existen
function agregarColumnasIntentos() {
    db.query(`SHOW COLUMNS FROM trabajadores LIKE 'intentos_fallidos'`, (err, results) => {
        if (err) {
            console.error('Error verificando columna intentos_fallidos:', err);
            return;
        }
        if (results.length === 0) {
            console.log('📌 Agregando columna intentos_fallidos...');
            db.query(`ALTER TABLE trabajadores ADD COLUMN intentos_fallidos INT DEFAULT 0`, (err) => {
                if (err) console.error('Error agregando intentos_fallidos:', err);
                else console.log('✅ Columna intentos_fallidos agregada');
            });
        }
    });
    
    db.query(`SHOW COLUMNS FROM trabajadores LIKE 'bloqueado_hasta'`, (err, results) => {
        if (err) {
            console.error('Error verificando columna bloqueado_hasta:', err);
            return;
        }
        if (results.length === 0) {
            console.log('📌 Agregando columna bloqueado_hasta...');
            db.query(`ALTER TABLE trabajadores ADD COLUMN bloqueado_hasta DATETIME DEFAULT NULL`, (err) => {
                if (err) console.error('Error agregando bloqueado_hasta:', err);
                else console.log('✅ Columna bloqueado_hasta agregada');
            });
        }
    });
}

// ================= LOGIN DE TRABAJADORES CON INTENTOS Y BLOQUEO =================

app.post('/api/trabajadores/login', async (req, res) => {
    const { nombre_usuario, password } = req.body;
    
    // Buscar por nombre_usuario, email o NombreCompleto
    const sql = `SELECT * FROM trabajadores WHERE (nombre_usuario = ? OR email = ? OR NombreCompleto = ?) AND Activo = 1`;
    
    db.query(sql, [nombre_usuario, nombre_usuario, nombre_usuario], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
        
        const trabajador = results[0];
        
        // ========== VERIFICAR BLOQUEO TEMPORAL ==========
        if (trabajador.bloqueado_hasta && new Date(trabajador.bloqueado_hasta) > new Date()) {
            const minutosRestantes = Math.ceil((new Date(trabajador.bloqueado_hasta) - new Date()) / 60000);
            return res.status(401).json({ 
                success: false, 
                message: `⚠️ Demasiados intentos fallidos. Cuenta bloqueada por ${minutosRestantes} minutos.` 
            });
        }
        
        let passwordValida = false;
        
        // MÉTODO 1: Verificar con MD5
        const md5pass = crypto.createHash('md5').update(password).digest('hex');
        
        if (trabajador.password_hash === md5pass) {
            passwordValida = true;
            console.log(`✅ Login MD5 exitoso para: ${trabajador.NombreCompleto}`);
        }
        
        // MÉTODO 2: Verificar con bcrypt
        if (!passwordValida && trabajador.password_hash && trabajador.password_hash.startsWith('$2b$')) {
            try {
                passwordValida = await bcrypt.compare(password, trabajador.password_hash);
                if (passwordValida) console.log(`✅ Login bcrypt exitoso para: ${trabajador.NombreCompleto}`);
            } catch(e) { 
                passwordValida = false; 
            }
        }
        
        // MÉTODO 3: Contraseña temporal '1234'
        if (!passwordValida && password === '1234') {
            passwordValida = true;
            console.log(`⚠️ Login con contraseña temporal 1234 para: ${trabajador.NombreCompleto}`);
        }
        
        // ========== SI LA CONTRASEÑA ES CORRECTA ==========
        if (passwordValida) {
            // Reiniciar intentos fallidos
            db.query(`UPDATE trabajadores SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE Id_Trabajador = ?`, 
                [trabajador.Id_Trabajador]);
            
            // Generar token JWT
            const token = jwt.sign(
                { id: trabajador.Id_Trabajador, nombre: trabajador.NombreCompleto, rol: 'trabajador' },
                SECRET_KEY,
                { expiresIn: '8h' }
            );
            
            return res.json({
                success: true,
                token: token,
                trabajador: {
                    id: trabajador.Id_Trabajador,
                    nombre: trabajador.NombreCompleto,
                    debe_cambiar_password: (trabajador.debe_cambiar_password === 1),
                    email: trabajador.email,
                    usuario: trabajador.nombre_usuario
                }
            });
        }
        
        // ========== CONTRASEÑA INCORRECTA: AUMENTAR INTENTOS ==========
        const nuevosIntentos = (trabajador.intentos_fallidos || 0) + 1;
        
        if (nuevosIntentos >= 5) {
            // Bloquear por 15 minutos después de 5 intentos fallidos
            const bloqueadoHasta = new Date();
            bloqueadoHasta.setMinutes(bloqueadoHasta.getMinutes() + 15);
            
            db.query(`UPDATE trabajadores SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE Id_Trabajador = ?`, 
                [nuevosIntentos, bloqueadoHasta, trabajador.Id_Trabajador]);
                
            return res.status(401).json({ 
                success: false, 
                message: "❌ Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos." 
            });
        } else {
            db.query(`UPDATE trabajadores SET intentos_fallidos = ? WHERE Id_Trabajador = ?`, 
                [nuevosIntentos, trabajador.Id_Trabajador]);
                
            const intentosRestantes = 5 - nuevosIntentos;
            return res.status(401).json({ 
                success: false, 
                message: `❌ Contraseña incorrecta. Le quedan ${intentosRestantes} intento${intentosRestantes !== 1 ? 's' : ''}.` 
            });
        }
    });
});

// Endpoint para verificar estado de cuenta (intentos restantes)
app.get('/api/trabajadores/estado-cuenta/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`SELECT intentos_fallidos, bloqueado_hasta FROM trabajadores WHERE Id_Trabajador = ?`, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) return res.status(404).json({ error: "Trabajador no encontrado" });
        
        const trabajador = results[0];
        const estaBloqueado = trabajador.bloqueado_hasta && new Date(trabajador.bloqueado_hasta) > new Date();
        const intentosRestantes = Math.max(0, 5 - (trabajador.intentos_fallidos || 0));
        
        res.json({
            intentos_fallidos: trabajador.intentos_fallidos || 0,
            intentos_restantes: intentosRestantes,
            bloqueado: estaBloqueado,
            bloqueado_hasta: trabajador.bloqueado_hasta
        });
    });
});

// ================= CAMBIAR CONTRASEÑA DE TRABAJADOR =================

app.post('/api/trabajadores/cambiar-password', async (req, res) => {
    const { id_trabajador, nueva_password } = req.body;
    
    if (!nueva_password || nueva_password.length < 4) {
        return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 4 caracteres" });
    }
    
    const hashedPassword = await bcrypt.hash(nueva_password, 10);
    
    const sql = `UPDATE trabajadores SET password_hash = ?, debe_cambiar_password = 0 WHERE Id_Trabajador = ?`;
    db.query(sql, [hashedPassword, id_trabajador], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Error al actualizar contraseña" });
        res.json({ success: true, message: "Contraseña actualizada correctamente" });
    });
});

// ================= AGREGAR TRABAJADOR =================

app.post('/api/trabajadores', async (req, res) => {
    const { NombreCompleto, Celular, Salario, Activo, email } = req.body;
    
    if (!NombreCompleto || NombreCompleto.trim() === '') {
        return res.status(400).json({ error: 'El nombre completo es requerido' });
    }
    if (!Celular || Celular.trim() === '') {
        return res.status(400).json({ error: 'El número de celular es requerido' });
    }
    if (!email || email.trim() === '') {
        return res.status(400).json({ error: 'El correo electrónico es requerido' });
    }
    
    // Verificar email único
    db.query(`SELECT * FROM trabajadores WHERE email = ?`, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length > 0) {
            return res.status(400).json({ error: 'Ya existe un trabajador con ese correo electrónico' });
        }
        
        // Generar nombre de usuario único
        let nombreUsuario = NombreCompleto.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
        
        const verificarUsuario = (usuario, callback) => {
            db.query(`SELECT * FROM trabajadores WHERE nombre_usuario = ?`, [usuario], (err, results) => {
                if (err) return callback(err);
                if (results.length > 0) {
                    verificarUsuario(usuario + Math.floor(Math.random() * 100), callback);
                } else {
                    callback(null, usuario);
                }
            });
        };
        
        verificarUsuario(nombreUsuario, async (err, usuarioFinal) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            // Usar MD5 para la contraseña temporal
            const md5pass = crypto.createHash('md5').update('1234').digest('hex');
            
            const sql = `INSERT INTO trabajadores (NombreCompleto, Celular, Salario, Activo, email, nombre_usuario, password_hash, debe_cambiar_password) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`;
            
            db.query(sql, [NombreCompleto, Celular, Salario || null, Activo !== undefined ? Activo : 1, email, usuarioFinal, md5pass], (err, result) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                const idTrabajador = result.insertId;
                const token = crypto.randomBytes(32).toString('hex');
                const expiraEn = new Date();
                expiraEn.setHours(expiraEn.getHours() + 48);
                
                db.query(`INSERT INTO trabajador_registro_tokens (id_trabajador, token, expira_en) VALUES (?, ?, ?)`, [idTrabajador, token, expiraEn]);
                
                const registroLink = `http://localhost:3000/registro-trabajador.html?token=${token}`;
                
                const mailOptions = {
                    from: 'Tienda Chepita <isabelchepita678@gmail.com>',
                    to: email,
                    subject: '🎉 Bienvenido a Chepita - Configura tu cuenta',
                    html: `
                        <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                            <h2 style="color: #A63C89;">🎉 ¡Bienvenido a Chepita, ${NombreCompleto}!</h2>
                            <p>Has sido registrado en nuestro sistema de gestión.</p>
                            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                <p><strong>📧 Tu correo:</strong> ${email}</p>
                                <p><strong>👤 Tu usuario:</strong> ${usuarioFinal}</p>
                                <p><strong>🔑 Contraseña temporal:</strong> 1234</p>
                            </div>
                            <div style="text-align: center; margin: 25px 0;">
                                <a href="${registroLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Configurar mi cuenta</a>
                            </div>
                            <p style="color: #666;">Este enlace es válido por 48 horas.</p>
                            <hr>
                            <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestión Comercial</p>
                        </div>
                    `
                };
                
                transporter.sendMail(mailOptions, (error) => {
                    if (error) {
                        console.error("Error al enviar email:", error);
                        return res.json({ message: "Trabajador agregado, pero no se pudo enviar el email. Verifica la configuración de Gmail.", Id_Trabajador: idTrabajador });
                    }
                    res.json({ message: "Trabajador agregado. Se ha enviado un email para configurar su contraseña.", Id_Trabajador: idTrabajador });
                });
            });
        });
    });
});

// ================= VERIFICAR TOKEN DE REGISTRO =================

app.get('/api/verificar-token-registro/:token', (req, res) => {
    const { token } = req.params;
    
    const sql = `
        SELECT tr.id_trabajador, t.NombreCompleto, t.email, t.nombre_usuario
        FROM trabajador_registro_tokens tr
        JOIN trabajadores t ON tr.id_trabajador = t.Id_Trabajador
        WHERE tr.token = ? AND tr.usado = 0 AND tr.expira_en > NOW()
    `;
    
    db.query(sql, [token], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.status(400).json({ valido: false, message: "El enlace ha expirado o ya fue usado" });
        }
        
        res.json({
            valido: true,
            id_trabajador: results[0].id_trabajador,
            nombre: results[0].NombreCompleto,
            email: results[0].email,
            usuario: results[0].nombre_usuario
        });
    });
});

// ================= COMPLETAR REGISTRO =================

app.post('/api/completar-registro-trabajador', async (req, res) => {
    const { token, nueva_password } = req.body;
    
    if (!nueva_password || nueva_password.length < 4) {
        return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 4 caracteres" });
    }
    
    const sqlVerificar = `
        SELECT id_trabajador FROM trabajador_registro_tokens
        WHERE token = ? AND usado = 0 AND expira_en > NOW()
    `;
    
    db.query(sqlVerificar, [token], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Error en el servidor" });
        if (results.length === 0) {
            return res.status(400).json({ success: false, message: "El enlace ha expirado o ya fue usado" });
        }
        
        const idTrabajador = results[0].id_trabajador;
        const hashedPassword = await bcrypt.hash(nueva_password, 10);
        
        db.beginTransaction((err) => {
            if (err) return res.status(500).json({ success: false, message: "Error en transacción" });
            
            db.query(`UPDATE trabajadores SET password_hash = ?, debe_cambiar_password = 0 WHERE Id_Trabajador = ?`,
                [hashedPassword, idTrabajador], (err) => {
                if (err) {
                    return db.rollback(() => res.status(500).json({ success: false, message: "Error actualizando contraseña" }));
                }
                
                db.query(`UPDATE trabajador_registro_tokens SET usado = 1 WHERE token = ?`, [token], (err) => {
                    if (err) {
                        return db.rollback(() => res.status(500).json({ success: false, message: "Error actualizando token" }));
                    }
                    
                    db.commit((err) => {
                        if (err) return res.status(500).json({ success: false, message: "Error completando registro" });
                        res.json({ success: true, message: "¡Contraseña configurada correctamente! Ya puedes iniciar sesión." });
                    });
                });
            });
        });
    });
});

// ================= ACTUALIZAR TRABAJADOR =================

app.put('/api/trabajadores/:id', (req, res) => {
    const { id } = req.params;
    const { NombreCompleto, Celular, Salario, Activo, email } = req.body;
    
    const sql = `UPDATE trabajadores SET NombreCompleto = ?, Celular = ?, Salario = ?, Activo = ?, email = ? WHERE Id_Trabajador = ?`;
    db.query(sql, [NombreCompleto, Celular, Salario, Activo, email, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Trabajador no encontrado" });
        res.json({ message: "Trabajador actualizado" });
    });
});

// ================= OBTENER TRABAJADORES =================

app.get('/api/trabajadores', (req, res) => {
    db.query(`SELECT Id_Trabajador, NombreCompleto, Celular, Salario, Activo, email, nombre_usuario, debe_cambiar_password FROM trabajadores ORDER BY NombreCompleto`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.get('/api/trabajadores/activos', (req, res) => {
    db.query(`SELECT Id_Trabajador, NombreCompleto, Celular, nombre_usuario FROM trabajadores WHERE Activo = 1 ORDER BY NombreCompleto`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.post('/api/trabajadores/verificar', (req, res) => {
    const { Id_Trabajador, Codigo } = req.body;
    
    db.query(`SELECT * FROM trabajadores WHERE Id_Trabajador = ? AND Celular = ? AND Activo = 1`, [Id_Trabajador, Codigo], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length > 0) {
            res.json({ success: true, trabajador: results[0] });
        } else {
            res.json({ success: false, message: 'Código incorrecto o trabajador inactivo' });
        }
    });
});

app.delete('/api/trabajadores/:id', (req, res) => {
    const { id } = req.params;
    db.query(`UPDATE trabajadores SET Activo = 0 WHERE Id_Trabajador = ?`, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Trabajador no encontrado" });
        res.json({ message: "Trabajador desactivado" });
    });
});

// ================= VERIFICAR SESIÓN CON JWT =================

function verificarTokenTrabajador(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ autenticado: false, message: "Token no proporcionado" });
    }
    
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).json({ autenticado: false, message: "Token inválido o expirado" });
        }
        req.usuario = decoded;
        next();
    });
}

app.get('/api/verificar-sesion-trabajador', verificarTokenTrabajador, (req, res) => {
    res.json({ autenticado: true, usuario: req.usuario });
});

// ================= ADMINISTRADOR Y SEGURIDAD =================

app.post('/api/admin/login', (req, res) => {
    const { usuario, password } = req.body;
    const sql = 'SELECT * FROM usuarios_admin WHERE usuario = ? AND password = MD5(?)';
    
    db.query(sql, [usuario, password], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length > 0) {
            const token = jwt.sign(
                { usuario: results[0].usuario, rol: 'admin' },
                SECRET_KEY,
                { expiresIn: '8h' }
            );
            res.json({ success: true, token: token, user: results[0].usuario });
        } else {
            res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
    });
});

app.post('/api/admin/recuperar-pregunta', (req, res) => {
    const { usuario, respuesta } = req.body;
    const sql = 'SELECT password FROM usuarios_admin WHERE usuario = ? AND respuesta_seguridad = MD5(?)';
    
    db.query(sql, [usuario, respuesta], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length > 0) {
            res.json({ success: true, password: results[0].password });
        } else {
            res.status(401).json({ success: false, message: "La respuesta es incorrecta" });
        }
    });
});

app.post('/api/admin/recuperar-email', (req, res) => {
    const { email } = req.body;
    const sql = 'SELECT usuario FROM usuarios_admin WHERE email = ?';

    db.query(sql, [email], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.json({ success: false, message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." });
        }

        const { usuario } = results[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 3600000;

        resetTokens[token] = { email, expiresAt };
        const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;

        const mailOptions = {
            from: 'Tienda Chepita <isabelchepita678@gmail.com>',
            to: email,
            subject: 'Recuperación de Contraseña - Tienda Chepita',
            html: `
                <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #A63C89;">🔐 Recuperación de Contraseña</h2>
                    <p>Hola <strong>${usuario}</strong>,</p>
                    <p>Hemos recibido una solicitud para restablecer tu contraseña. Para crear una nueva, haz clic en el siguiente botón:</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Restablecer Contraseña</a>
                    </div>
                    <p style="color: #666; font-size: 12px;">Este enlace es válido por 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.</p>
                    <hr>
                    <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestión Comercial</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error al enviar email:", error);
                return res.status(500).json({ error: "No se pudo enviar el correo." });
            }
            res.json({ success: true, message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." });
        });
    });
});

app.post('/api/admin/reset-password', (req, res) => {
    const { token, nuevaPassword } = req.body;

    if (!nuevaPassword || nuevaPassword.length < 4) {
        return res.status(400).json({ success: false, message: "La nueva contraseña debe tener al menos 4 caracteres." });
    }

    const tokenData = resetTokens[token];
    if (!tokenData || Date.now() > tokenData.expiresAt) {
        return res.status(400).json({ success: false, message: "El enlace ha expirado o es inválido." });
    }

    const { email } = tokenData;

    const sqlActualizar = 'UPDATE usuarios_admin SET password = MD5(?), password_plain = ? WHERE email = ?';
    db.query(sqlActualizar, [nuevaPassword, nuevaPassword, email], (err, result) => {
        if (err) {
            console.error('Error al actualizar:', err);
            return res.status(500).json({ success: false, message: "Error interno del servidor." });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Usuario no encontrado." });
        }

        delete resetTokens[token];
        console.log(`✅ Contraseña actualizada para: ${email}`);
        res.json({ success: true, message: "¡Contraseña actualizada correctamente! Ya puedes iniciar sesión." });
    });
});

app.post('/api/admin/cambiar-password', (req, res) => {
    const { usuario, passwordActual, nuevaPassword } = req.body;
    
    if (!nuevaPassword || nuevaPassword.length < 4) {
        return res.status(400).json({ success: false, message: "La nueva contraseña debe tener al menos 4 caracteres" });
    }
    
    const sqlVerificar = 'SELECT * FROM usuarios_admin WHERE usuario = ? AND password = MD5(?)';
    
    db.query(sqlVerificar, [usuario, passwordActual], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Error en el servidor" });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Contraseña actual incorrecta" });
        }
        
        const sqlActualizar = 'UPDATE usuarios_admin SET password = MD5(?), password_plain = ? WHERE usuario = ?';
        db.query(sqlActualizar, [nuevaPassword, nuevaPassword, usuario], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "Error al actualizar" });
            res.json({ success: true, message: "Contraseña actualizada correctamente" });
        });
    });
});

// ================= CATEGORIAS =================

app.get('/api/categorias', (req, res) => {
    console.log('📁 [PROCEDIMIENTO] sp_listar_categorias - Ejecutando consulta...');
    db.query(`CALL sp_listar_categorias()`, (err, results) => {
        if (err) {
            console.error('❌ [PROCEDIMIENTO] Error en sp_listar_categorias:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        const categorias = results[0];
        console.log(`✅ [PROCEDIMIENTO] sp_listar_categorias - ${categorias.length} categorías encontradas`);
        res.json(categorias); 
    });
});

app.post('/api/categorias', (req, res) => {
    const { Nombre } = req.body;
    
    if (!Nombre || Nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre de la categoria es requerido' });
    }
    
    db.query(`INSERT INTO categoria (Nombre) VALUES (?)`, [Nombre.trim()], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Ya existe una categoria con ese nombre' });
            }
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json({ message: "Categoria creada", Id_Categoria: result.insertId });
    });
});

app.delete('/api/categorias/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`UPDATE producto SET Id_Categoria = NULL WHERE Id_Categoria = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        
        db.query(`DELETE FROM categoria WHERE Id_Categoria = ?`, [id], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            if (result.affectedRows === 0) return res.status(404).json({ error: "Categoria no encontrada" });
            res.json({ message: "Categoria eliminada correctamente" });
        });
    });
});

// ================= PRODUCTOS =================

app.get('/api/productos', (req, res) => {
    const sql = `
        SELECT 
            p.Id_Producto, 
            p.Nombre, 
            p.Precio, 
            p.Marca,
            COALESCE(c.Nombre, 'Sin Categoria') AS Nombre_Categoria, 
            COALESCE(e.Nombre_Estado, 'Disponible') AS Nombre_Estado,
            COALESCE(SUM(s.Cantidad), 0) AS Stock
        FROM producto p
        LEFT JOIN categoria c ON p.Id_Categoria = c.Id_Categoria
        LEFT JOIN estado e ON p.Id_Estado = e.Id_Estado
        LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto
        GROUP BY p.Id_Producto, p.Nombre, p.Precio, p.Marca, c.Nombre, e.Nombre_Estado
        ORDER BY p.Id_Producto DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error en GET /api/productos:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const resultadosLimpios = results.map(producto => {
            if (producto.Nombre_Estado && /[0-9]/.test(producto.Nombre_Estado)) {
                producto.Nombre_Estado = 'Disponible';
            }
            return producto;
        });
        
        console.log(`📦 Productos enviados: ${resultadosLimpios.length}`);
        res.json(resultadosLimpios);
    });
});

app.get('/api/producto-proveedor/:id', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT prov.Nombre AS Nombre_Proveedor
        FROM abastecimiento a
        LEFT JOIN proveedores prov ON a.Id_Proveedor = prov.Id_Proveedor
        WHERE a.Id_Producto = ?
        LIMIT 1
    `;
    
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results[0] || { Nombre_Proveedor: null });
    });
});

app.post('/api/productos', (req, res) => {
    const { Nombre, Stock, Precio, Marca, Id_Proveedor, Id_Categoria } = req.body;

    if (!Nombre || Nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }
    if (Stock < 1 || Stock > 9999) {
        return res.status(400).json({ error: 'Stock debe estar entre 1 y 9999' });
    }
    if (Precio < 1 || Precio > 10000) {
        return res.status(400).json({ error: 'Precio debe estar entre C$1 y C$10000' });
    }
    if (!Id_Proveedor) {
        return res.status(400).json({ error: 'Debe seleccionar un proveedor existente' });
    }
    
    db.query(`SELECT Id_Proveedor FROM proveedores WHERE Id_Proveedor = ?`, [Id_Proveedor], (err, provResults) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (provResults.length === 0) {
            return res.status(400).json({ error: 'El proveedor seleccionado no existe en la base de datos' });
        }
        
        const sqlProd = `INSERT INTO producto (Nombre, Precio, Marca, Id_Categoria, Id_Estado) VALUES (?, ?, ?, ?, 1)`;
        
        db.query(sqlProd, [Nombre, Precio, Marca || null, Id_Categoria || null], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const idProducto = result.insertId;

            const sqlStock = `INSERT INTO stock (Id_Inventario, Id_Producto, Cantidad, FechaEntrada) VALUES (1, ?, ?, CURDATE())`;
            db.query(sqlStock, [idProducto, Stock], (err2) => {
                if (err2) return res.status(500).json({ error: err2.sqlMessage });
                
                const sqlAbast = `INSERT INTO abastecimiento (Id_Producto, Id_Proveedor, Precio_Compra, FechaEntrada, Cantidad_Entrada) VALUES (?, ?, ?, CURDATE(), ?)`;
                db.query(sqlAbast, [idProducto, Id_Proveedor, Precio, Stock], (err3) => {
                    if (err3) return res.status(500).json({ error: err3.sqlMessage });
                    res.json({ message: "Producto agregado", Id_Producto: idProducto });
                });
            });
        });
    });
});

app.put('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const { Nombre, Precio, Marca, Id_Estado } = req.body;

    if (!Nombre || Nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }
    if (Precio < 1 || Precio > 10000) {
        return res.status(400).json({ error: 'Precio debe estar entre C$1 y C$10000' });
    }

    const sql = `UPDATE producto SET Nombre = ?, Precio = ?, Marca = ?, Id_Estado = ? WHERE Id_Producto = ?`;
    db.query(sql, [Nombre, Precio, Marca || null, Id_Estado, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ message: "Producto actualizado correctamente" });
    });
});

app.patch('/api/productos/:id/stock', (req, res) => {
    const { id } = req.params;
    const { stock } = req.body;

    if (stock < 1 || stock > 9999) {
        return res.status(400).json({ error: "El stock debe estar entre 1 y 9999 unidades" });
    }

    db.query(`SELECT * FROM stock WHERE Id_Producto = ?`, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        
        if (results.length > 0) {
            db.query(`UPDATE stock SET Cantidad = ?, FechaEntrada = CURDATE() WHERE Id_Producto = ?`, [stock, id], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                res.json({ message: "Stock actualizado", stock: stock });
            });
        } else {
            db.query(`INSERT INTO stock (Id_Inventario, Id_Producto, Cantidad, FechaEntrada) VALUES (1, ?, ?, CURDATE())`, [id, stock], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                res.json({ message: "Registro de stock creado", stock: stock });
            });
        }
    });
});

app.delete('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const tablasRelacionadas = ['orden', 'stock', 'abastecimiento', 'consumo_interno', 'merma', 'premio'];
    
    async function eliminarDependencias() {
        for (const tabla of tablasRelacionadas) {
            await new Promise((resolve, reject) => {
                db.query(`DELETE FROM ${tabla} WHERE Id_Producto = ?`, [id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }

    eliminarDependencias()
        .then(() => {
            db.query(`DELETE FROM producto WHERE Id_Producto = ?`, [id], (err, result) => {
                if (err) return res.status(500).json({ error: "Error al borrar producto: " + err.sqlMessage });
                if (result.affectedRows === 0) return res.status(404).json({ error: "Producto no encontrado" });
                res.json({ message: "Producto y registros relacionados eliminados correctamente" });
            });
        })
        .catch(err => {
            res.status(500).json({ error: "Error limpiando dependencias: " + err.message });
        });
});

// ================= PRODUCTOS CON BAJO STOCK =================

app.get('/api/productos/bajo-stock', (req, res) => {
    console.log('⚠️ [PROCEDIMIENTO] sp_productos_bajo_stock - Ejecutando consulta...');
    db.query(`CALL sp_productos_bajo_stock()`, (err, results) => {
        if (err) {
            console.error('❌ [PROCEDIMIENTO] Error en sp_productos_bajo_stock:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        const productos = results[0];
        console.log(`✅ [PROCEDIMIENTO] sp_productos_bajo_stock - ${productos.length} productos con bajo stock`);
        res.json(productos);
    });
});

// ================= PROVEEDORES =================

app.get('/api/proveedores', (req, res) => {
    console.log('GET /api/proveedores - Solicitado');
    
    const sql = `SELECT Id_Proveedor, Nombre, Empresa, Num_celular, Operador FROM proveedores ORDER BY Nombre`;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error en consulta proveedores:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`✅ Proveedores encontrados: ${results.length}`);
        res.json(results);
    });
});

app.post('/api/proveedores', (req, res) => {
    console.log('POST /api/proveedores - Body:', req.body);
    const { Nombre, Empresa, Num_celular, Operador } = req.body;
    
    if (!Nombre || Nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre del proveedor es requerido' });
    }
    if (!Empresa || Empresa.trim() === '') {
        return res.status(400).json({ error: 'La empresa es requerida' });
    }
    if (!Num_celular || Num_celular.trim() === '') {
        return res.status(400).json({ error: 'El número de teléfono es requerido' });
    }
    
    db.query(`SELECT * FROM proveedores WHERE Num_celular = ?`, [Num_celular], (err, results) => {
        if (err) {
            console.error('Error verificando duplicado:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        if (results.length > 0) {
            return res.status(400).json({ error: 'Ya existe un proveedor con ese número de teléfono' });
        }
        
        db.query(`INSERT INTO proveedores (Nombre, Empresa, Num_celular, Operador) VALUES (?, ?, ?, ?)`, 
            [Nombre.trim(), Empresa.trim(), Num_celular.trim(), Operador || null], 
            (err, result) => {
                if (err) {
                    console.error('Error insertando proveedor:', err);
                    return res.status(500).json({ error: err.sqlMessage });
                }
                console.log('POST /api/proveedores - Proveedor creado ID:', result.insertId);
                res.json({ message: "Proveedor creado exitosamente", Id_Proveedor: result.insertId });
            }
        );
    });
});

app.put('/api/proveedores/:id', (req, res) => {
    const { id } = req.params;
    const { Nombre, Empresa, Num_celular, Operador } = req.body;
    
    console.log(`PUT /api/proveedores/${id} - Body:`, req.body);
    
    if (!Nombre || Nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre del proveedor es requerido' });
    }
    if (!Empresa || Empresa.trim() === '') {
        return res.status(400).json({ error: 'La empresa es requerida' });
    }
    if (!Num_celular || Num_celular.trim() === '') {
        return res.status(400).json({ error: 'El número de teléfono es requerido' });
    }
    
    db.query(`SELECT * FROM proveedores WHERE Num_celular = ? AND Id_Proveedor != ?`, [Num_celular, id], (err, results) => {
        if (err) {
            console.error('Error verificando duplicado:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        if (results.length > 0) {
            return res.status(400).json({ error: 'Ya existe otro proveedor con ese número de teléfono' });
        }
        
        db.query(`UPDATE proveedores SET Nombre = ?, Empresa = ?, Num_celular = ?, Operador = ? WHERE Id_Proveedor = ?`, 
            [Nombre.trim(), Empresa.trim(), Num_celular.trim(), Operador || null, id], 
            (err, result) => {
                if (err) {
                    console.error('Error actualizando proveedor:', err);
                    return res.status(500).json({ error: err.sqlMessage });
                }
                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: "Proveedor no encontrado" });
                }
                console.log(`PUT /api/proveedores/${id} - Proveedor actualizado`);
                res.json({ message: "Proveedor actualizado correctamente" });
            }
        );
    });
});

app.delete('/api/proveedores/:id', (req, res) => {
    const { id } = req.params;
    
    console.log(`DELETE /api/proveedores/${id} - Solicitado`);
    
    db.query(`SELECT * FROM abastecimiento WHERE Id_Proveedor = ?`, [id], (err, results) => {
        if (err) {
            console.error('Error verificando dependencias:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        if (results.length > 0) {
            return res.status(400).json({ error: 'No se puede eliminar el proveedor porque tiene productos asociados' });
        }
        
        db.query(`DELETE FROM proveedores WHERE Id_Proveedor = ?`, [id], (err, result) => {
            if (err) {
                console.error('Error eliminando proveedor:', err);
                return res.status(500).json({ error: err.sqlMessage });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Proveedor no encontrado" });
            }
            console.log(`DELETE /api/proveedores/${id} - Proveedor eliminado`);
            res.json({ message: "Proveedor eliminado correctamente" });
        });
    });
});

// ================= CONSUMOS INTERNOS =================

app.get('/api/consumos', (req, res) => {
    console.log(' [PROCEDIMIENTO] sp_listar_consumos - Ejecutando consulta...');
    db.query(`CALL sp_listar_consumos()`, (err, results) => {
        if (err) {
            console.error('❌ [PROCEDIMIENTO] Error en sp_listar_consumos:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        const consumos = results[0];
        console.log(`✅ [PROCEDIMIENTO] sp_listar_consumos - ${consumos.length} consumos encontrados`);
        res.json(consumos);
    });
});

app.post('/api/consumos', (req, res) => {
    const { Id_Producto, Cantidad, Fecha } = req.body;
    
    if (!Id_Producto) {
        return res.status(400).json({ error: 'El producto es requerido' });
    }
    if (!Cantidad || Cantidad < 1) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }
    if (!Fecha) {
        return res.status(400).json({ error: 'La fecha es requerida' });
    }
    
    db.query(`SELECT Id_Producto FROM producto WHERE Id_Producto = ?`, [Id_Producto], (err, prodResults) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (prodResults.length === 0) {
            return res.status(400).json({ error: 'El producto no existe' });
        }
        
        db.query(`SELECT COALESCE(SUM(Cantidad), 0) AS stock_total FROM stock WHERE Id_Producto = ?`, [Id_Producto], (err, stockResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const stockActual = stockResults[0].stock_total;
            if (stockActual < Cantidad) {
                return res.status(400).json({ error: `Stock insuficiente. Stock actual: ${stockActual} unidades` });
            }
            
            const sql = `INSERT INTO consumo_interno (Id_Producto, Cantidad, Fecha) VALUES (?, ?, ?)`;
            db.query(sql, [Id_Producto, Cantidad, Fecha], (err, result) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                const nuevoStock = stockActual - Cantidad;
                db.query(`UPDATE stock SET Cantidad = ? WHERE Id_Producto = ?`, [nuevoStock, Id_Producto], (err) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });
                    res.json({ message: "Consumo registrado exitosamente", Id_Consumo_Interno: result.insertId });
                });
            });
        });
    });
});

app.put('/api/consumos/:id', (req, res) => {
    const { id } = req.params;
    const { Cantidad, Fecha } = req.body;
    
    if (!Cantidad || Cantidad < 1) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }
    if (!Fecha) {
        return res.status(400).json({ error: 'La fecha es requerida' });
    }
    
    db.query(`SELECT Id_Producto, Cantidad FROM consumo_interno WHERE Id_Consumo_Interno = ?`, [id], (err, consumoResult) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (consumoResult.length === 0) {
            return res.status(404).json({ error: 'Consumo no encontrado' });
        }
        
        const consumoAnterior = consumoResult[0];
        const diferencia = Cantidad - consumoAnterior.Cantidad;
        
        db.query(`SELECT COALESCE(SUM(Cantidad), 0) AS stock_total FROM stock WHERE Id_Producto = ?`, [consumoAnterior.Id_Producto], (err, stockResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const stockActual = stockResults[0].stock_total;
            if (diferencia > 0 && stockActual < diferencia) {
                return res.status(400).json({ error: `Stock insuficiente. Faltan: ${diferencia} unidades` });
            }
            
            const nuevoStock = stockActual - diferencia;
            db.query(`UPDATE stock SET Cantidad = ? WHERE Id_Producto = ?`, [nuevoStock, consumoAnterior.Id_Producto], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                db.query(`UPDATE consumo_interno SET Cantidad = ?, Fecha = ? WHERE Id_Consumo_Interno = ?`, [Cantidad, Fecha, id], (err) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });
                    res.json({ message: "Consumo actualizado correctamente" });
                });
            });
        });
    });
});

app.delete('/api/consumos/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`SELECT Id_Producto, Cantidad FROM consumo_interno WHERE Id_Consumo_Interno = ?`, [id], (err, consumoResult) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (consumoResult.length === 0) {
            return res.status(404).json({ error: 'Consumo no encontrado' });
        }
        
        const consumo = consumoResult[0];
        
        db.query(`SELECT COALESCE(SUM(Cantidad), 0) AS stock_total FROM stock WHERE Id_Producto = ?`, [consumo.Id_Producto], (err, stockResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const nuevoStock = stockResults[0].stock_total + consumo.Cantidad;
            
            db.query(`UPDATE stock SET Cantidad = ? WHERE Id_Producto = ?`, [nuevoStock, consumo.Id_Producto], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                db.query(`DELETE FROM consumo_interno WHERE Id_Consumo_Interno = ?`, [id], (err) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });
                    res.json({ message: "Consumo eliminado correctamente" });
                });
            });
        });
    });
});

// ================= PERDIDAS =================

app.get('/api/perdidas', (req, res) => {
    const sql = `
        SELECT m.Id_Perdida, m.Id_Producto, m.Cantidad, p.Nombre AS Nombre_Producto, pe.Fecha, m.Motivo
        FROM merma m
        LEFT JOIN perdida pe ON m.Id_Perdida = pe.Id_Perdida
        LEFT JOIN producto p ON m.Id_Producto = p.Id_Producto
        ORDER BY pe.Fecha DESC, m.Id_Perdida DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.post('/api/perdidas', (req, res) => {
    const { Id_Producto, Cantidad, Fecha, Motivo } = req.body;
    
    if (!Id_Producto) {
        return res.status(400).json({ error: 'El producto es requerido' });
    }
    if (!Cantidad || Cantidad < 1) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }
    if (!Fecha) {
        return res.status(400).json({ error: 'La fecha es requerida' });
    }
    if (!Motivo || Motivo.trim() === '') {
        return res.status(400).json({ error: 'El motivo es requerido' });
    }
    
    db.query(`SELECT Id_Producto FROM producto WHERE Id_Producto = ?`, [Id_Producto], (err, prodResults) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (prodResults.length === 0) {
            return res.status(400).json({ error: 'El producto no existe' });
        }
        
        db.query(`SELECT COALESCE(SUM(Cantidad), 0) AS stock_total FROM stock WHERE Id_Producto = ?`, [Id_Producto], (err, stockResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const stockActual = stockResults[0].stock_total;
            if (stockActual < Cantidad) {
                return res.status(400).json({ error: `Stock insuficiente. Stock actual: ${stockActual} unidades` });
            }
            
            db.query(`INSERT INTO perdida (Fecha) VALUES (?)`, [Fecha], (err, resultPerdida) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                const idPerdida = resultPerdida.insertId;
                
                db.query(`INSERT INTO merma (Id_Perdida, Id_Producto, Cantidad, Motivo) VALUES (?, ?, ?, ?)`, 
                    [idPerdida, Id_Producto, Cantidad, Motivo], (err) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });
                    
                    const nuevoStock = stockActual - Cantidad;
                    db.query(`UPDATE stock SET Cantidad = ? WHERE Id_Producto = ?`, [nuevoStock, Id_Producto], (err) => {
                        if (err) return res.status(500).json({ error: err.sqlMessage });
                        res.json({ message: "Perdida registrada exitosamente", Id_Perdida: idPerdida });
                    });
                });
            });
        });
    });
});

app.put('/api/perdidas/:id', (req, res) => {
    const { id } = req.params;
    const { Cantidad, Motivo } = req.body;
    
    if (!Cantidad || Cantidad < 1) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }
    if (!Motivo || Motivo.trim() === '') {
        return res.status(400).json({ error: 'El motivo es requerido' });
    }
    
    db.query(`SELECT Id_Producto, Cantidad FROM merma WHERE Id_Perdida = ?`, [id], (err, mermaResult) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (mermaResult.length === 0) {
            return res.status(404).json({ error: 'Perdida no encontrada' });
        }
        
        const perdidaAnterior = mermaResult[0];
        const diferencia = Cantidad - perdidaAnterior.Cantidad;
        
        db.query(`SELECT COALESCE(SUM(Cantidad), 0) AS stock_total FROM stock WHERE Id_Producto = ?`, [perdidaAnterior.Id_Producto], (err, stockResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const stockActual = stockResults[0].stock_total;
            if (diferencia > 0 && stockActual < diferencia) {
                return res.status(400).json({ error: `Stock insuficiente. Faltan: ${diferencia} unidades` });
            }
            
            const nuevoStock = stockActual - diferencia;
            db.query(`UPDATE stock SET Cantidad = ? WHERE Id_Producto = ?`, [nuevoStock, perdidaAnterior.Id_Producto], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                db.query(`UPDATE merma SET Cantidad = ?, Motivo = ? WHERE Id_Perdida = ?`, [Cantidad, Motivo, id], (err) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });
                    res.json({ message: "Perdida actualizada correctamente" });
                });
            });
        });
    });
});

app.delete('/api/perdidas/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`SELECT Id_Producto, Cantidad FROM merma WHERE Id_Perdida = ?`, [id], (err, mermaResult) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (mermaResult.length === 0) {
            return res.status(404).json({ error: 'Perdida no encontrada' });
        }
        
        const perdida = mermaResult[0];
        
        db.query(`SELECT COALESCE(SUM(Cantidad), 0) AS stock_total FROM stock WHERE Id_Producto = ?`, [perdida.Id_Producto], (err, stockResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const nuevoStock = stockResults[0].stock_total + perdida.Cantidad;
            
            db.query(`UPDATE stock SET Cantidad = ? WHERE Id_Producto = ?`, [nuevoStock, perdida.Id_Producto], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                db.query(`DELETE FROM merma WHERE Id_Perdida = ?`, [id], (err) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });
                    
                    db.query(`DELETE FROM perdida WHERE Id_Perdida = ?`, [id], (err) => {
                        if (err) return res.status(500).json({ error: err.sqlMessage });
                        res.json({ message: "Perdida eliminada correctamente" });
                    });
                });
            });
        });
    });
});

// ================= RECUPERACIÓN DE CONTRASEÑA PARA TRABAJADORES =================

app.post('/api/trabajadores/recuperar-password', (req, res) => {
    const { email } = req.body;
    
    if (!email || email.trim() === '') {
        return res.status(400).json({ success: false, message: 'Por favor, ingrese su correo electrónico' });
    }
    
    db.query(`SELECT Id_Trabajador, NombreCompleto, email FROM trabajadores WHERE email = ? AND Activo = 1`, [email], (err, results) => {
        if (err) {
            console.error('Error en recuperación:', err);
            return res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
        
        if (results.length === 0) {
            return res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
        }
        
        const trabajador = results[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expiraEn = new Date();
        expiraEn.setHours(expiraEn.getHours() + 1);
        
        db.query(`INSERT INTO trabajador_recuperacion_tokens (id_trabajador, token, expira_en) VALUES (?, ?, ?)`, 
            [trabajador.Id_Trabajador, token, expiraEn], (err) => {
            if (err) {
                console.error('Error guardando token:', err);
                return res.status(500).json({ success: false, message: 'Error en el servidor' });
            }
            
            const resetLink = `http://localhost:3000/trabajador-reset-password.html?token=${token}`;
            
            const mailOptions = {
                from: 'Tienda Chepita <isabelchepita678@gmail.com>',
                to: trabajador.email,
                subject: '🔐 Recuperación de Contraseña - Tienda Chepita',
                html: `
                    <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                        <h2 style="color: #A63C89;">🔐 Recuperación de Contraseña</h2>
                        <p>Hola <strong>${trabajador.NombreCompleto}</strong>,</p>
                        <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
                        <p>Para crear una nueva contraseña, haz clic en el siguiente botón:</p>
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Restablecer Contraseña</a>
                        </div>
                        <p style="color: #666; font-size: 12px;">Este enlace es válido por 1 hora.</p>
                        <hr>
                        <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestión Comercial</p>
                    </div>
                `
            };
            
            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.error('Error al enviar email:', error);
                    return res.status(500).json({ success: false, message: 'Error al enviar el correo.' });
                }
                res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
            });
        });
    });
});

app.get('/api/trabajadores/verificar-token-recuperacion/:token', (req, res) => {
    const { token } = req.params;
    
    const sql = `
        SELECT tr.id_trabajador, t.NombreCompleto, t.email
        FROM trabajador_recuperacion_tokens tr
        JOIN trabajadores t ON tr.id_trabajador = t.Id_Trabajador
        WHERE tr.token = ? AND tr.usado = 0 AND tr.expira_en > NOW()
    `;
    
    db.query(sql, [token], (err, results) => {
        if (err) {
            console.error('Error verificando token:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        if (results.length === 0) {
            return res.status(400).json({ valido: false, message: 'El enlace ha expirado o ya fue usado' });
        }
        
        res.json({
            valido: true,
            id_trabajador: results[0].id_trabajador,
            nombre: results[0].NombreCompleto,
            email: results[0].email
        });
    });
});

app.post('/api/trabajadores/restablecer-password', async (req, res) => {
    const { token, nueva_password } = req.body;
    
    if (!nueva_password || nueva_password.length < 4) {
        return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 4 caracteres' });
    }
    
    const sqlVerificar = `
        SELECT id_trabajador FROM trabajador_recuperacion_tokens
        WHERE token = ? AND usado = 0 AND expira_en > NOW()
    `;
    
    db.query(sqlVerificar, [token], async (err, results) => {
        if (err) {
            console.error('Error verificando token:', err);
            return res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
        if (results.length === 0) {
            return res.status(400).json({ success: false, message: 'El enlace ha expirado o ya fue usado' });
        }
        
        const idTrabajador = results[0].id_trabajador;
        const hashedPassword = await bcrypt.hash(nueva_password, 10);
        
        db.beginTransaction((err) => {
            if (err) {
                console.error('Error iniciando transacción:', err);
                return res.status(500).json({ success: false, message: 'Error en el servidor' });
            }
            
            db.query(`UPDATE trabajadores SET password_hash = ?, debe_cambiar_password = 0 WHERE Id_Trabajador = ?`,
                [hashedPassword, idTrabajador], (err) => {
                if (err) {
                    console.error('Error actualizando contraseña:', err);
                    return db.rollback(() => res.status(500).json({ success: false, message: 'Error actualizando contraseña' }));
                }
                
                db.query(`UPDATE trabajador_recuperacion_tokens SET usado = 1 WHERE token = ?`, [token], (err) => {
                    if (err) {
                        console.error('Error actualizando token:', err);
                        return db.rollback(() => res.status(500).json({ success: false, message: 'Error actualizando token' }));
                    }
                    
                    db.commit((err) => {
                        if (err) {
                            console.error('Error commit:', err);
                            return res.status(500).json({ success: false, message: 'Error completando operación' });
                        }
                        res.json({ success: true, message: '¡Contraseña restablecida correctamente! Ahora puedes iniciar sesión.' });
                    });
                });
            });
        });
    });
});

// ================= VENTAS/COMPRAS =================

app.get('/api/ventas', (req, res) => {
    const sql = `
        SELECT 
            c.Num_Factura as NumFactura,
            c.Fecha, 
            c.Monto,
            COALESCE(cl.Nombre, 'Cliente no registrado') AS Nombre_Cliente,
            COALESCE(cl.Apellido, '') AS Apellido,
            COALESCE(ca.Nombre_Canal, 'No especificado') AS Nombre_Canal,
            COALESCE(mp.Nombre_Metodo, 'No especificado') AS Nombre_Metodo,
            COALESCE(p.Nombre, 'Producto no disponible') AS Producto,
            COALESCE(o.CantidadVendida, 0) AS CantidadVendida,
            COALESCE(o.PrecioUnitario, 0) AS PrecioUnitario,
            COALESCE(o.Subtotal, 0) AS Subtotal,
            c.Id_Vendedor,
            t.NombreCompleto AS Nombre_Vendedor
        FROM compra c
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        LEFT JOIN canal ca ON c.Id_Canal = ca.Id_Canal
        LEFT JOIN metododepago mp ON c.Id_Metodo = mp.Id_Metodo
        LEFT JOIN orden o ON c.Num_Factura = o.NumFactura
        LEFT JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN trabajadores t ON c.Id_Vendedor = t.Id_Trabajador
        ORDER BY c.Fecha DESC, c.Num_Factura DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error en GET /api/ventas:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        console.log(`GET /api/ventas - Enviando ${results.length} registros`);
        res.json(results);
    });
});

app.get('/api/canales', (req, res) => {
    db.query(`SELECT * FROM canal`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.get('/api/metodos-pago', (req, res) => {
    db.query(`SELECT * FROM metododepago`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.post('/api/compras', (req, res) => {
    const { Num_Factura, Id_cliente, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto, Cajero } = req.body;
    
    const sql = `INSERT INTO compra (Num_Factura, Id_cliente, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto, Cajero) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [Num_Factura, Id_cliente, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto, Cajero || null], (err, result) => {
        if (err) {
            console.error('Error en POST /api/compras:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json({ message: "Compra guardada", Num_Factura: Num_Factura });
    });
});

app.post('/api/ordenes', (req, res) => {
    const { Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario } = req.body;
    
    const sql = `INSERT INTO orden (Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sql, [Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        
        db.query(`UPDATE stock SET Cantidad = Cantidad - ? WHERE Id_Producto = ?`, [CantidadVendida, Id_Producto], (err2) => {
            if (err2) return res.status(500).json({ error: err2.sqlMessage });
            res.json({ message: "Orden guardada" });
        });
    });
});

// ================= ESTADÍSTICAS =================

app.get('/api/puntos-vendedores', (req, res) => {
    const { year, month } = req.query;
    
    let fechaFiltro = '';
    let params = [];
    
    if (year && month) {
        fechaFiltro = 'WHERE YEAR(c.Fecha) = ? AND MONTH(c.Fecha) = ?';
        params = [parseInt(year), parseInt(month)];
    } else if (year) {
        fechaFiltro = 'WHERE YEAR(c.Fecha) = ?';
        params = [parseInt(year)];
    } else if (month) {
        fechaFiltro = 'WHERE MONTH(c.Fecha) = ?';
        params = [parseInt(month)];
    }
    
    const sql = `
        SELECT 
            t.Id_Trabajador as id_trabajador,
            t.NombreCompleto as nombre_completo,
            COUNT(c.Num_Factura) as total_ventas,
            COUNT(DISTINCT DATE(c.Fecha)) as dias_activos,
            ROUND(COUNT(c.Num_Factura) / NULLIF(COUNT(DISTINCT DATE(c.Fecha)), 0), 2) as promedio_diario,
            ROUND(
                (COUNT(c.Num_Factura) * 0.4) + 
                (COUNT(DISTINCT DATE(c.Fecha)) * 0.3) + 
                (ROUND(COUNT(c.Num_Factura) / NULLIF(COUNT(DISTINCT DATE(c.Fecha)), 0), 2) * 0.3), 
                2
            ) as puntaje_total,
            SUM(c.Monto) as total_ventas_cordobas
        FROM compra c
        INNER JOIN trabajadores t ON c.Id_Vendedor = t.Id_Trabajador
        ${fechaFiltro}
        GROUP BY t.Id_Trabajador, t.NombreCompleto
        ORDER BY puntaje_total DESC
    `;
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error en /api/puntos-vendedores:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const formattedResults = results.map(r => ({
            id_trabajador: r.id_trabajador,
            nombre_completo: r.nombre_completo,
            total_ventas: r.total_ventas,
            dias_activos: r.dias_activos,
            promedio_diario: r.promedio_diario,
            puntaje_total: r.puntaje_total,
            total_ventas_cordobas: r.total_ventas_cordobas
        }));
        
        res.json(formattedResults);
    });
});

app.get('/api/estadisticas-ventas', (req, res) => {
    const { periodo = 'mes' } = req.query;
    
    let fechaInicio = new Date();
    switch(periodo) {
        case 'dia': fechaInicio.setDate(fechaInicio.getDate() - 1); break;
        case 'semana': fechaInicio.setDate(fechaInicio.getDate() - 7); break;
        case 'mes': fechaInicio.setDate(fechaInicio.getDate() - 30); break;
        case 'año': fechaInicio.setFullYear(fechaInicio.getFullYear() - 1); break;
        default: fechaInicio.setDate(fechaInicio.getDate() - 30);
    }
    const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
    
    const sqlVentasDiarias = `
        SELECT DAY(Fecha) as dia, SUM(Monto) as total
        FROM compra
        WHERE YEAR(Fecha) = YEAR(CURDATE()) AND MONTH(Fecha) = MONTH(CURDATE())
        GROUP BY DAY(Fecha)
        ORDER BY dia
    `;
    
    const sqlVentasCategoria = `
        SELECT c.Nombre as categoria, SUM(o.CantidadVendida * o.PrecioUnitario) as total
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        JOIN categoria c ON p.Id_Categoria = c.Id_Categoria
        JOIN compra co ON o.NumFactura = co.Num_Factura
        WHERE co.Fecha >= ?
        GROUP BY c.Id_Categoria
        ORDER BY total DESC
    `;
    
    const sqlResumen = `
        SELECT 
            SUM(CASE WHEN DATE(Fecha) = CURDATE() THEN Monto ELSE 0 END) as total_hoy,
            COUNT(CASE WHEN DATE(Fecha) = CURDATE() THEN 1 END) as ventas_hoy,
            SUM(CASE WHEN YEAR(Fecha) = YEAR(CURDATE()) AND MONTH(Fecha) = MONTH(CURDATE()) THEN Monto ELSE 0 END) as total_mes,
            COUNT(CASE WHEN YEAR(Fecha) = YEAR(CURDATE()) AND MONTH(Fecha) = MONTH(CURDATE()) THEN 1 END) as ventas_mes,
            SUM(CASE WHEN YEAR(Fecha) = YEAR(CURDATE()) THEN Monto ELSE 0 END) as total_año,
            COUNT(CASE WHEN YEAR(Fecha) = YEAR(CURDATE()) THEN 1 END) as ventas_año,
            SUM(CASE WHEN Fecha >= ? THEN Monto ELSE 0 END) as total_periodo,
            COUNT(CASE WHEN Fecha >= ? THEN 1 END) as cantidad_periodo
        FROM compra
    `;
    
    const sqlMasVendido = `
        SELECT p.Nombre, SUM(o.CantidadVendida) as total
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE c.Fecha >= ?
        GROUP BY p.Id_Producto
        ORDER BY total DESC
        LIMIT 1
    `;
    
    const sqlMenosVendido = `
        SELECT p.Nombre, SUM(o.CantidadVendida) as total
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE c.Fecha >= ?
        GROUP BY p.Id_Producto
        HAVING total > 0
        ORDER BY total ASC
        LIMIT 1
    `;
    
    const sqlMejorCliente = `
        SELECT CONCAT(cl.Nombre, ' ', cl.Apellido) as nombre, SUM(c.Monto) as total
        FROM compra c
        JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        WHERE c.Fecha >= ?
        GROUP BY cl.Id_cliente
        ORDER BY total DESC
        LIMIT 1
    `;
    
    Promise.all([
        db.promise().query(sqlVentasDiarias),
        db.promise().query(sqlVentasCategoria, [fechaInicioStr]),
        db.promise().query(sqlResumen, [fechaInicioStr, fechaInicioStr]),
        db.promise().query(sqlMasVendido, [fechaInicioStr]),
        db.promise().query(sqlMenosVendido, [fechaInicioStr]),
        db.promise().query(sqlMejorCliente, [fechaInicioStr])
    ]).then(([ventasDiarias, ventasCategoria, resumen, masVendido, menosVendido, mejorCliente]) => {
        const labelsDias = ventasDiarias[0].map(v => v.dia);
        const dataDias = ventasDiarias[0].map(v => parseFloat(v.total) || 0);
        const categorias = ventasCategoria[0].map(v => v.categoria);
        const totalesCategorias = ventasCategoria[0].map(v => parseFloat(v.total) || 0);
        
        res.json({
            labels_dias: labelsDias,
            data_dias: dataDias,
            categorias: categorias,
            totales_categorias: totalesCategorias,
            total_hoy: parseFloat(resumen[0][0]?.total_hoy) || 0,
            ventas_hoy: parseInt(resumen[0][0]?.ventas_hoy) || 0,
            total_mes: parseFloat(resumen[0][0]?.total_mes) || 0,
            ventas_mes: parseInt(resumen[0][0]?.ventas_mes) || 0,
            total_año: parseFloat(resumen[0][0]?.total_año) || 0,
            ventas_año: parseInt(resumen[0][0]?.ventas_año) || 0,
            total_ventas: parseFloat(resumen[0][0]?.total_periodo) || 0,
            cantidad_ventas: parseInt(resumen[0][0]?.cantidad_periodo) || 0,
            producto_mas_vendido: masVendido[0][0]?.Nombre || 'Sin ventas',
            cantidad_mas_vendido: masVendido[0][0]?.total || 0,
            producto_menos_vendido: menosVendido[0][0]?.Nombre || 'Sin ventas',
            cantidad_menos_vendido: menosVendido[0][0]?.total || 0,
            mejor_cliente: mejorCliente[0][0]?.nombre || 'Sin cliente',
            total_cliente: parseFloat(mejorCliente[0][0]?.total) || 0
        });
    }).catch(err => {
        console.error('Error en /api/estadisticas-ventas:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/inventario-detalle', (req, res) => {
    const sql = `
        SELECT 
            p.Id_Producto, 
            p.Nombre, 
            p.Precio, 
            p.Marca, 
            COALESCE(e.Nombre_Estado, 'Disponible') as Estado, 
            COALESCE(c.Nombre, 'Sin Categoria') as Categoria, 
            COALESCE(SUM(s.Cantidad), 0) as Stock, 
            COALESCE(SUM(o.CantidadVendida), 0) as TotalVendido, 
            COALESCE(SUM(o.CantidadVendida * o.PrecioUnitario), 0) as TotalVentas 
        FROM producto p 
        LEFT JOIN categoria c ON p.Id_Categoria = c.Id_Categoria 
        LEFT JOIN estado e ON p.Id_Estado = e.Id_Estado 
        LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto 
        LEFT JOIN orden o ON p.Id_Producto = o.Id_Producto 
        GROUP BY p.Id_Producto, p.Nombre, p.Precio, p.Marca, e.Nombre_Estado, c.Nombre
        ORDER BY p.Nombre
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error en /api/inventario-detalle:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const disponibles = [];
        const agotados = [];
        const bajoStock = [];
        const descontinuados = [];
        const sinVentas = [];
        
        results.forEach(p => {
            const producto = {
                nombre: p.Nombre,
                categoria: p.Categoria,
                marca: p.Marca,
                cantidad: p.Stock,
                precio: p.Precio,
                total_vendido: p.TotalVendido,
                total_ventas: p.TotalVentas
            };
            
            if (p.Estado === 'Descontinuado') {
                descontinuados.push(producto);
            } else if (p.Stock === 0) {
                agotados.push(producto);
            } else if (p.Stock <= 10) {
                bajoStock.push(producto);
            } else {
                disponibles.push(producto);
            }
            
            if (p.TotalVendido === 0 && p.Estado !== 'Descontinuado') {
                sinVentas.push(producto);
            }
        });
        
        res.json({
            productos_disponibles: disponibles,
            productos_agotados: agotados,
            productos_bajo_stock: bajoStock,
            productos_descontinuados: descontinuados,
            productos_sin_ventas: sinVentas,
            total_disponibles: disponibles.length,
            total_agotados: agotados.length,
            total_bajo_stock: bajoStock.length,
            total_descontinuados: descontinuados.length
        });
    });
});

app.get('/api/perdidas-estadisticas', (req, res) => {
    const { periodo = 'mes' } = req.query;
    
    let fechaInicio = new Date();
    switch(periodo) {
        case 'dia': fechaInicio.setDate(fechaInicio.getDate() - 1); break;
        case 'semana': fechaInicio.setDate(fechaInicio.getDate() - 7); break;
        case 'mes': fechaInicio.setDate(fechaInicio.getDate() - 30); break;
        case 'año': fechaInicio.setFullYear(fechaInicio.getFullYear() - 1); break;
        default: fechaInicio.setDate(fechaInicio.getDate() - 30);
    }
    const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
    
    const sqlPerdidas = `
        SELECT 
            pr.Nombre, 
            pr.Precio, 
            pr.Marca, 
            COALESCE(c.Nombre, 'Sin Categoria') as Categoria,
            SUM(m.Cantidad) as cantidad,
            SUM(m.Cantidad * pr.Precio) as valor
        FROM merma m
        JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
        JOIN producto pr ON m.Id_Producto = pr.Id_Producto
        LEFT JOIN categoria c ON pr.Id_Categoria = c.Id_Categoria
        WHERE pd.Fecha >= ?
        GROUP BY m.Id_Producto
        ORDER BY cantidad DESC
    `;
    
    const sqlConsumo = `
        SELECT 
            pr.Nombre, 
            pr.Precio, 
            pr.Marca, 
            COALESCE(c.Nombre, 'Sin Categoria') as Categoria,
            SUM(ci.Cantidad) as cantidad,
            SUM(ci.Cantidad * pr.Precio) as valor
        FROM consumo_interno ci
        JOIN producto pr ON ci.Id_Producto = pr.Id_Producto
        LEFT JOIN categoria c ON pr.Id_Categoria = c.Id_Categoria
        WHERE ci.Fecha >= ?
        GROUP BY ci.Id_Producto
        ORDER BY cantidad DESC
    `;
    
    const sqlTotales = `
        SELECT 
            (SELECT COALESCE(SUM(m.Cantidad * pr.Precio), 0) FROM merma m JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida JOIN producto pr ON m.Id_Producto = pr.Id_Producto WHERE pd.Fecha >= ?) as total_perdidas,
            (SELECT COALESCE(SUM(m.Cantidad), 0) FROM merma m JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida WHERE pd.Fecha >= ?) as unidades_perdidas,
            (SELECT COALESCE(SUM(ci.Cantidad * pr.Precio), 0) FROM consumo_interno ci JOIN producto pr ON ci.Id_Producto = pr.Id_Producto WHERE ci.Fecha >= ?) as total_consumo,
            (SELECT COALESCE(SUM(ci.Cantidad), 0) FROM consumo_interno ci WHERE ci.Fecha >= ?) as unidades_consumo
    `;
    
    Promise.all([
        db.promise().query(sqlPerdidas, [fechaInicioStr]),
        db.promise().query(sqlConsumo, [fechaInicioStr]),
        db.promise().query(sqlTotales, [fechaInicioStr, fechaInicioStr, fechaInicioStr, fechaInicioStr])
    ]).then(([productosPerdidas, productosConsumo, totales]) => {
        const productosConPerdidas = productosPerdidas[0].map(p => ({
            nombre: p.Nombre,
            categoria: p.Categoria,
            marca: p.Marca,
            precio: parseFloat(p.Precio) || 0,
            cantidad: parseInt(p.cantidad) || 0,
            valor_total: parseFloat(p.valor) || 0
        }));
        
        const productosConsumoPropio = productosConsumo[0].map(p => ({
            nombre: p.Nombre,
            categoria: p.Categoria,
            marca: p.Marca,
            precio: parseFloat(p.Precio) || 0,
            cantidad: parseInt(p.cantidad) || 0,
            valor_total: parseFloat(p.valor) || 0
        }));
        
        const productosMasPerdidas = [...productosConPerdidas].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
        const productosMasConsumo = [...productosConsumoPropio].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
        
        res.json({
            productos_con_perdidas: productosConPerdidas,
            productos_consumo_propio: productosConsumoPropio,
            productos_mas_perdidas: productosMasPerdidas,
            produtos_mas_consumo: productosMasConsumo,
            total_perdidas: parseFloat(totales[0][0]?.total_perdidas) || 0,
            total_unidades_perdidas: parseInt(totales[0][0]?.unidades_perdidas) || 0,
            total_consumo_propio: parseFloat(totales[0][0]?.total_consumo) || 0,
            total_unidades_consumo: parseInt(totales[0][0]?.unidades_consumo) || 0,
            perdidas_por_categoria: [],
            consumo_por_categoria: [],
            perdidas_mensuales: [],
            consumo_mensual: []
        });
    }).catch(err => {
        console.error('Error en /api/perdidas-estadisticas:', err);
        res.status(500).json({ error: err.message });
    });
});

// ================= OTROS ENDPOINTS =================

app.get('/api/productos-con-proveedores', (req, res) => {
    const sql = `
        SELECT p.Id_Producto, p.Nombre, prov.Nombre AS Nombre_Proveedor
        FROM producto p
        LEFT JOIN abastecimiento a ON p.Id_Producto = a.Id_Producto
        LEFT JOIN proveedores prov ON a.Id_Proveedor = prov.Id_Proveedor
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.get('/api/inventario', (req, res) => {
    const sql = `
        SELECT p.Id_Producto, p.Nombre AS Producto, COALESCE(SUM(s.Cantidad), 0) AS Cantidad
        FROM producto p
        LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto
        GROUP BY p.Id_Producto
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.get('/api/clientes', (req, res) => {
    db.query(`SELECT Id_cliente, Nombre, Apellido, Num_Celular FROM clientes`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.post('/api/clientes', (req, res) => {
    const { Nombre, Apellido, Num_Celular } = req.body;
    
    if (!Nombre || !Apellido) {
        return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
    }
    
    const sql = `INSERT INTO clientes (Nombre, Apellido, Num_Celular) VALUES (?, ?, ?)`;
    db.query(sql, [Nombre, Apellido, Num_Celular || null], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ message: "Cliente agregado", Id_cliente: result.insertId });
    });
});

app.get('/api/estadisticas', (req, res) => {
    const sql = `
        SELECT 
            (SELECT COUNT(*) FROM producto) AS total_productos,
            (SELECT COUNT(*) FROM categoria) AS total_categorias,
            (SELECT COALESCE(SUM(Cantidad), 0) FROM stock) AS stock_total
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results[0]);
    });
});

// ================= CREAR PROCEDIMIENTOS ALMACENADOS =================

function crearProcedimientosSiNoExisten() {
    db.query(`SHOW PROCEDURE STATUS WHERE Name = 'sp_listar_categorias'`, (err, results) => {
        if (err) console.error('Error verificando procedimiento:', err);
        if (results && results.length === 0) {
            console.log('📌 [PROCEDIMIENTO] Creando sp_listar_categorias...');
            db.query(`
                CREATE PROCEDURE sp_listar_categorias()
                BEGIN
                    SELECT Id_Categoria, Nombre FROM categoria ORDER BY Nombre;
                END
            `, (err) => {
                if (err) console.error('❌ Error creando sp_listar_categorias:', err);
                else console.log('✅ [PROCEDIMIENTO] sp_listar_categorias creado exitosamente');
            });
        } else {
            console.log('✅ [PROCEDIMIENTO] sp_listar_categorias ya existe');
        }
    });

    db.query(`SHOW PROCEDURE STATUS WHERE Name = 'sp_listar_consumos'`, (err, results) => {
        if (err) console.error('Error verificando procedimiento:', err);
        if (results && results.length === 0) {
            console.log('📌 [PROCEDIMIENTO] Creando sp_listar_consumos...');
            db.query(`
                CREATE PROCEDURE sp_listar_consumos()
                BEGIN
                    SELECT 
                        ci.Id_Consumo_Interno,
                        p.Nombre AS Nombre_Producto,
                        ci.Cantidad,
                        ci.Fecha,
                        p.Precio
                    FROM consumo_interno ci
                    JOIN producto p ON ci.Id_Producto = p.Id_Producto
                    ORDER BY ci.Fecha DESC;
                END
            `, (err) => {
                if (err) console.error('❌ Error creando sp_listar_consumos:', err);
                else console.log('✅ [PROCEDIMIENTO] sp_listar_consumos creado exitosamente');
            });
        } else {
            console.log('✅ [PROCEDIMIENTO] sp_listar_consumos ya existe');
        }
    });

    db.query(`SHOW PROCEDURE STATUS WHERE Name = 'sp_productos_bajo_stock'`, (err, results) => {
        if (err) console.error('Error verificando procedimiento:', err);
        if (results && results.length === 0) {
            console.log('📌 [PROCEDIMIENTO] Creando sp_productos_bajo_stock...');
            db.query(`
                CREATE PROCEDURE sp_productos_bajo_stock()
                BEGIN
                    SELECT 
                        p.Id_Producto,
                        p.Nombre,
                        p.Precio,
                        COALESCE(SUM(s.Cantidad), 0) AS Stock
                    FROM producto p
                    LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto
                    GROUP BY p.Id_Producto
                    HAVING Stock < 10
                    ORDER BY Stock ASC;
                END
            `, (err) => {
                if (err) console.error('❌ Error creando sp_productos_bajo_stock:', err);
                else console.log('✅ [PROCEDIMIENTO] sp_productos_bajo_stock creado exitosamente');
            });
        } else {
            console.log('✅ [PROCEDIMIENTO] sp_productos_bajo_stock ya existe');
        }
    });
}

// ================= VERIFICAR ESTRUCTURA TABLA =================

function verificarEstructuraTabla() {
    db.query(`SHOW COLUMNS FROM compra LIKE 'Id_Vendedor'`, (err, results) => {
        if (err) {
            console.error('Error verificando columna Id_Vendedor:', err);
            return;
        }
        if (results.length === 0) {
            console.log('⚠️ Agregando columna Id_Vendedor a tabla compra...');
            db.query(`ALTER TABLE compra ADD COLUMN Id_Vendedor INT NULL, ADD FOREIGN KEY (Id_Vendedor) REFERENCES trabajadores(Id_Trabajador)`, (err) => {
                if (err) console.error('Error agregando columna Id_Vendedor:', err);
                else console.log('✅ Columna Id_Vendedor agregada correctamente');
            });
        } else {
            console.log('✅ Columna Id_Vendedor ya existe en tabla compra');
        }
    });
}

// ================= VERIFICACIÓN DE SESIÓN =================

app.get('/menu_admin.html', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'menu_admin.html'));
});

app.get(['/menu_admin.html', '/menu_caja.html', '/inventario.html', '/proveedor.html', '/historial.html', '/evaluar_trabajador.html', '/personal.html'], (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.get('/api/verificar-sesion', (req, res) => {
    const token = req.headers['x-auth-token'];
    if (!token) {
        return res.status(401).json({ autenticado: false, mensaje: 'No hay sesión activa' });
    }
    res.json({ autenticado: true });
});

// ================= INICIO DEL SERVIDOR =================

setTimeout(() => {
    crearProcedimientosSiNoExisten();
    verificarEstructuraTabla();
}, 2000);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     🚀 SERVIDOR TIENDA CHEPITA - CORRIENDO 🚀            
    ╠══════════════════════════════════════════════════════════╣
    ║  📡 Puerto: ${PORT}                                         
    ║  🌐 URL: http://localhost:${PORT}                      
    ║  📧 Sistema de emails activado                           
    ║  🔐 Autenticación de trabajadores activada (MD5 + bcrypt)
    ║  🔐 Recuperación de contraseña por email activada        
    ║  🔒 5 intentos de login - Bloqueo 15 minutos             
    ╚══════════════════════════════════════════════════════════╝
    `);
});