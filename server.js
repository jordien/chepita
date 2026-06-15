/**
 * ============================================================================
 * @file server.js
 * @description Servidor de CAJA LOCAL del Sistema de Gestión Comercial "Chepita"
 * @version 3.0 - Conectado a BASE DE DATOS RAILWAY (compartida con APP)
 * ============================================================================
 * 
 * 📌 Este servidor se ejecuta en la CAJA LOCAL y se conecta a la base de datos
 *    centralizada en Railway, compartiendo datos con la aplicación web.
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
const qrcode = require('qrcode');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ================= CONEXIÓN A MYSQL - RAILWAY (compartida con APP) =================
const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'acela.proxy.rlwy.net',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || 'MFaPbrOIWcBNrrvrxBNcfClvNNtFIoSt',
    database: process.env.MYSQLDATABASE || 'railway',
    port: process.env.MYSQLPORT || 49485
});

db.connect(err => {
    if (err) return console.error('❌ Error de conexion a Railway:', err.message);
    console.log('✅ CAJA LOCAL - Conectada exitosamente a la base de datos RAILWAY');
    console.log('✅ Datos sincronizados con la aplicación web');
    
    crearTablaTokens();
    crearTablaRecuperacionTokens();
    agregarColumnasIntentos();
    crearTablaQRVendedores();
});

// ================= CONFIGURACIÓN DE GMAIL =================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'isabelchepita678@gmail.com',
        pass: 'cazx kvss xagg zepm'
    }
});

const resetTokens = {};
const SECRET_KEY = 'chepita_secret_key_2025';

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

// ================= LOGIN DE TRABAJADORES =================

app.post('/api/trabajadores/login', async (req, res) => {
    const { nombre_usuario, password } = req.body;
    
    const sql = `SELECT * FROM trabajadores WHERE (nombre_usuario = ? OR email = ? OR NombreCompleto = ?) AND Activo = 1`;
    
    db.query(sql, [nombre_usuario, nombre_usuario, nombre_usuario], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
        
        const trabajador = results[0];
        
        if (trabajador.bloqueado_hasta && new Date(trabajador.bloqueado_hasta) > new Date()) {
            const minutosRestantes = Math.ceil((new Date(trabajador.bloqueado_hasta) - new Date()) / 60000);
            return res.status(401).json({ 
                success: false, 
                message: `Demasiados intentos fallidos. Cuenta bloqueada por ${minutosRestantes} minutos.` 
            });
        }
        
        let passwordValida = false;
        const md5pass = crypto.createHash('md5').update(password).digest('hex');
        
        if (trabajador.password_hash === md5pass) {
            passwordValida = true;
            console.log(`✅ Login MD5 exitoso para: ${trabajador.NombreCompleto}`);
        }
        
        if (!passwordValida && trabajador.password_hash && trabajador.password_hash.startsWith('$2b$')) {
            try {
                passwordValida = await bcrypt.compare(password, trabajador.password_hash);
                if (passwordValida) console.log(`✅ Login bcrypt exitoso para: ${trabajador.NombreCompleto}`);
            } catch(e) { 
                passwordValida = false; 
            }
        }
        
        if (!passwordValida && password === '1234') {
            passwordValida = true;
            console.log(`⚠️ Login con contraseña temporal 1234 para: ${trabajador.NombreCompleto}`);
        }
        
        if (passwordValida) {
            db.query(`UPDATE trabajadores SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE Id_Trabajador = ?`, 
                [trabajador.Id_Trabajador]);
            
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
        
        const nuevosIntentos = (trabajador.intentos_fallidos || 0) + 1;
        
        if (nuevosIntentos >= 5) {
            const bloqueadoHasta = new Date();
            bloqueadoHasta.setMinutes(bloqueadoHasta.getMinutes() + 15);
            
            db.query(`UPDATE trabajadores SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE Id_Trabajador = ?`, 
                [nuevosIntentos, bloqueadoHasta, trabajador.Id_Trabajador]);
                
            return res.status(401).json({ 
                success: false, 
                message: "Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos." 
            });
        } else {
            db.query(`UPDATE trabajadores SET intentos_fallidos = ? WHERE Id_Trabajador = ?`, 
                [nuevosIntentos, trabajador.Id_Trabajador]);
                
            const intentosRestantes = 5 - nuevosIntentos;
            return res.status(401).json({ 
                success: false, 
                message: `Contraseña incorrecta. Le quedan ${intentosRestantes} intento${intentosRestantes !== 1 ? 's' : ''}.` 
            });
        }
    });
});

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
    
    db.query(`SELECT * FROM trabajadores WHERE email = ?`, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length > 0) {
            return res.status(400).json({ error: 'Ya existe un trabajador con ese correo electrónico' });
        }
        
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

// ================= ADMINISTRADOR =================

app.post('/api/admin/login', async (req, res) => {
    const { usuario, password } = req.body;
    
    db.query(`SELECT * FROM usuarios_admin WHERE usuario = ?`, [usuario], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
        
        const admin = results[0];
        
        if (admin.bloqueado_hasta && new Date(admin.bloqueado_hasta) > new Date()) {
            const minutosRestantes = Math.ceil((new Date(admin.bloqueado_hasta) - new Date()) / 60000);
            return res.status(401).json({ 
                success: false, 
                message: `Cuenta bloqueada por ${minutosRestantes} minutos. Demasiados intentos fallidos.` 
            });
        }
        
        let passwordValida = false;
        
        if (admin.password && admin.password.startsWith('$2b$')) {
            passwordValida = await bcrypt.compare(password, admin.password);
        }
        else if (admin.password && admin.password.length === 32) {
            const md5pass = crypto.createHash('md5').update(password).digest('hex');
            if (admin.password === md5pass) {
                passwordValida = true;
                const bcryptHash = await bcrypt.hash(password, 10);
                db.query(`UPDATE usuarios_admin SET password = ? WHERE id = ?`, [bcryptHash, admin.id]);
                console.log(`✅ Contraseña de ${admin.usuario} migrada a bcrypt`);
            }
        }
        
        if (passwordValida) {
            db.query(`UPDATE usuarios_admin SET 
                intentos_fallidos = 0, 
                bloqueado_hasta = NULL,
                ultimo_login = NOW() 
                WHERE id = ?`, [admin.id]);
            
            const token = jwt.sign(
                { id: admin.id, usuario: admin.usuario, rol: 'admin' },
                SECRET_KEY,
                { expiresIn: '4h' }
            );
            
            return res.json({ success: true, token: token, user: admin.usuario });
        }
        
        const nuevosIntentos = (admin.intentos_fallidos || 0) + 1;
        
        if (nuevosIntentos >= 5) {
            const bloqueadoHasta = new Date();
            bloqueadoHasta.setMinutes(bloqueadoHasta.getMinutes() + 30);
            
            db.query(`UPDATE usuarios_admin SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?`, 
                [nuevosIntentos, bloqueadoHasta, admin.id]);
                
            return res.status(401).json({ 
                success: false, 
                message: "Demasiados intentos fallidos. Cuenta bloqueada por 30 minutos." 
            });
        } else {
            db.query(`UPDATE usuarios_admin SET intentos_fallidos = ? WHERE id = ?`, 
                [nuevosIntentos, admin.id]);
                
            const intentosRestantes = 5 - nuevosIntentos;
            return res.status(401).json({ 
                success: false, 
                message: `Contraseña incorrecta. Le quedan ${intentosRestantes} intento(s).` 
            });
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
                    <h2 style="color: #A63C89;">Recuperación de Contraseña</h2>
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

app.get('/api/admin/verificar-token-recuperacion/:token', (req, res) => {
    const { token } = req.params;
    
    const tokenData = resetTokens[token];
    if (!tokenData || Date.now() > tokenData.expiresAt) {
        return res.status(400).json({ valido: false, message: 'El enlace ha expirado o ya fue usado' });
    }
    
    res.json({
        valido: true
    });
});

app.post('/api/admin/reset-password', (req, res) => {
    const { token, nuevaPassword } = req.body;

    if (!nuevaPassword || nuevaPassword.length < 8) {
        return res.status(400).json({ success: false, message: "La nueva contraseña debe tener al menos 8 caracteres." });
    }

    const tokenData = resetTokens[token];
    if (!tokenData || Date.now() > tokenData.expiresAt) {
        return res.status(400).json({ success: false, message: "El enlace ha expirado o es inválido." });
    }

    const { email } = tokenData;
    const hashedPassword = bcrypt.hashSync(nuevaPassword, 10);
    
    const sqlActualizar = 'UPDATE usuarios_admin SET password = ? WHERE email = ?';
    db.query(sqlActualizar, [hashedPassword, email], (err, result) => {
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

app.post('/api/admin/cambiar-password', async (req, res) => {
    const { usuario, passwordActual, nuevaPassword } = req.body;
    
    if (!nuevaPassword || nuevaPassword.length < 8) {
        return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 8 caracteres" });
    }
    if (!/[A-Z]/.test(nuevaPassword)) {
        return res.status(400).json({ success: false, message: "La contraseña debe contener al menos una mayúscula" });
    }
    if (!/[0-9]/.test(nuevaPassword)) {
        return res.status(400).json({ success: false, message: "La contraseña debe contener al menos un número" });
    }
    
    db.query(`SELECT * FROM usuarios_admin WHERE usuario = ?`, [usuario], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Error en el servidor" });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Usuario no encontrado" });
        }
        
        const admin = results[0];
        let passwordActualValida = false;
        
        if (admin.password && admin.password.startsWith('$2b$')) {
            passwordActualValida = await bcrypt.compare(passwordActual, admin.password);
        } else {
            const md5pass = crypto.createHash('md5').update(passwordActual).digest('hex');
            passwordActualValida = (admin.password === md5pass);
        }
        
        if (!passwordActualValida) {
            return res.status(401).json({ success: false, message: "Contraseña actual incorrecta" });
        }
        
        let esIgual = false;
        if (admin.password && admin.password.startsWith('$2b$')) {
            esIgual = await bcrypt.compare(nuevaPassword, admin.password);
        } else {
            const md5pass = crypto.createHash('md5').update(nuevaPassword).digest('hex');
            esIgual = (admin.password === md5pass);
        }
        
        if (esIgual) {
            return res.status(400).json({ success: false, message: "La nueva contraseña no puede ser igual a la anterior" });
        }
        
        const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
        
        db.query(`UPDATE usuarios_admin SET password = ? WHERE usuario = ?`, [hashedPassword, usuario], (err, result) => {
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
    const sql = `SELECT Id_Proveedor, Nombre, Empresa, Num_celular, Operador, Numero_Empresa, Operador_Empresa, Direccion_Empresa, Fecha_Agregacion FROM proveedores ORDER BY Nombre`;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error en consulta proveedores:', err);
            return res.status(500).json({ error: err.message });
        }
        
        res.json(results);
    });
});

app.post('/api/proveedores', (req, res) => {
    const { Nombre, Empresa, Num_celular, Operador, Numero_Empresa, Operador_Empresa, Direccion_Empresa } = req.body;
    
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
        
        db.query(`INSERT INTO proveedores (Nombre, Empresa, Num_celular, Operador, Numero_Empresa, Operador_Empresa, Direccion_Empresa) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [Nombre.trim(), Empresa.trim(), Num_celular.trim(), Operador || null, Numero_Empresa || null, Operador_Empresa || null, Direccion_Empresa || null], 
            (err, result) => {
                if (err) {
                    console.error('Error insertando proveedor:', err);
                    return res.status(500).json({ error: err.sqlMessage });
                }
                res.json({ message: "Proveedor creado exitosamente", Id_Proveedor: result.insertId });
            }
        );
    });
});

app.put('/api/proveedores/:id', (req, res) => {
    const { id } = req.params;
    const { Nombre, Empresa, Num_celular, Operador, Numero_Empresa, Operador_Empresa, Direccion_Empresa } = req.body;
    
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
        
        db.query(`UPDATE proveedores SET Nombre = ?, Empresa = ?, Num_celular = ?, Operador = ?, Numero_Empresa = ?, Operador_Empresa = ?, Direccion_Empresa = ? WHERE Id_Proveedor = ?`, 
            [Nombre.trim(), Empresa.trim(), Num_celular.trim(), Operador || null, Numero_Empresa || null, Operador_Empresa || null, Direccion_Empresa || null, id], 
            (err, result) => {
                if (err) {
                    console.error('Error actualizando proveedor:', err);
                    return res.status(500).json({ error: err.sqlMessage });
                }
                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: "Proveedor no encontrado" });
                }
                res.json({ message: "Proveedor actualizado correctamente" });
            }
        );
    });
});

app.delete('/api/proveedores/:id', (req, res) => {
    const { id } = req.params;
    
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
                subject: 'Recuperación de Contraseña - Tienda Chepita',
                html: `
                    <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                        <h2 style="color: #A63C89;">Recuperación de Contraseña</h2>
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
            p.Nombre AS Producto,
            o.CantidadVendida,
            o.PrecioUnitario,
            o.Subtotal,
            c.Id_Vendedor,
            c.Id_cliente,
            t.NombreCompleto AS Nombre_Vendedor,
            o.NumFactura AS Orden_NumFactura
        FROM compra c
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        LEFT JOIN canal ca ON c.Id_Canal = ca.Id_Canal
        LEFT JOIN metododepago mp ON c.Id_Metodo = mp.Id_Metodo
        LEFT JOIN orden o ON c.Num_Factura = o.NumFactura
        LEFT JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN trabajadores t ON c.Id_Vendedor = t.Id_Trabajador
        ORDER BY c.Fecha DESC, c.Num_Factura DESC, o.NumFactura ASC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('❌ Error en GET /api/ventas:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        
        const comprasConOrdenes = results.filter(r => r.Producto !== null);
        
        res.json(comprasConOrdenes);
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
    
    console.log('💳 POST /api/compras recibido:', { Num_Factura, Id_cliente, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto });
    
    if (!Num_Factura) {
        console.error('❌ Falta Num_Factura');
        return res.status(400).json({ error: 'Num_Factura es obligatoria' });
    }
    
    if (!Id_Vendedor || isNaN(Id_Vendedor)) {
        console.error('❌ Id_Vendedor inválido:', Id_Vendedor);
        return res.status(400).json({ error: 'Id_Vendedor es obligatorio y debe ser un número' });
    }
    
   if (Id_Canal !== null && Id_Canal !== undefined && Id_Canal !== '') {
        if (isNaN(Id_Canal)) {
            console.error('❌ Id_Canal inválido:', Id_Canal);
            return res.status(400).json({ error: 'Id_Canal debe ser un número' });
        }
    }
    
    if (!Id_Metodo || isNaN(Id_Metodo)) {
        console.error('❌ Id_Metodo inválido:', Id_Metodo);
        return res.status(400).json({ error: 'Id_Metodo es obligatorio y debe ser un número' });
    }
    
    if (!Fecha) {
        console.error('❌ Falta Fecha');
        return res.status(400).json({ error: 'Fecha es obligatoria' });
    }
    
    if (Monto === undefined || isNaN(Monto) || parseFloat(Monto) <= 0) {
        console.error('❌ Monto inválido:', Monto);
        return res.status(400).json({ error: 'Monto debe ser un número mayor a 0' });
    }
    
    console.log('✅ Validación de datos completada');
    
    const sql = `INSERT INTO compra (Num_Factura, Id_cliente, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto, Cajero) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [Num_Factura, Id_cliente || null, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto, Cajero || null], (err, result) => {
        if (err) {
            console.error('❌ Error al insertar compra:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'La factura #' + Num_Factura + ' ya existe en el sistema' });
            }
            return res.status(500).json({ error: 'Error al guardar compra: ' + err.message });
        }
        
        console.log('✅ Compra insertada - ID:', result.insertId, '| Factura #:', Num_Factura);
        res.json({ 
            message: "Compra guardada exitosamente", 
            Num_Factura: Num_Factura, 
            compraId: result.insertId,
            monto: Monto
        });
    });
});

app.post('/api/ordenes', (req, res) => {
    const { Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario } = req.body;
    
    console.log('📝 POST /api/ordenes recibido:', { Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario });
    
    if (!Id_Producto) {
        console.error('❌ Falta Id_Producto');
        return res.status(400).json({ error: 'Id_Producto es obligatorio' });
    }
    
    if (!NumFactura) {
        console.error('❌ Falta NumFactura');
        return res.status(400).json({ error: 'NumFactura es obligatorio' });
    }
    
    if (!CantidadVendida || isNaN(CantidadVendida) || parseInt(CantidadVendida) <= 0) {
        console.error('❌ CantidadVendida inválida:', CantidadVendida);
        return res.status(400).json({ error: 'CantidadVendida debe ser un número mayor a 0' });
    }
    
    if (Subtotal === undefined || isNaN(Subtotal) || parseFloat(Subtotal) < 0) {
        console.error('❌ Subtotal inválido:', Subtotal);
        return res.status(400).json({ error: 'Subtotal es obligatorio y debe ser un número válido' });
    }
    
    if (!Fecha) {
        console.error('❌ Falta Fecha');
        return res.status(400).json({ error: 'Fecha es obligatoria' });
    }
    
    if (PrecioUnitario === undefined || isNaN(PrecioUnitario) || parseFloat(PrecioUnitario) <= 0) {
        console.error('❌ PrecioUnitario inválido:', PrecioUnitario);
        return res.status(400).json({ error: 'PrecioUnitario debe ser un número mayor a 0' });
    }
    
    const checkProductoSql = 'SELECT Id_Producto FROM producto WHERE Id_Producto = ?';
    db.query(checkProductoSql, [Id_Producto], (err, results) => {
        if (err) {
            console.error('❌ Error al verificar producto:', err);
            return res.status(500).json({ error: 'Error al verificar producto: ' + err.message });
        }
        
        if (!results || results.length === 0) {
            console.error('❌ Producto no existe:', Id_Producto);
            return res.status(400).json({ error: 'El producto #' + Id_Producto + ' no existe en la base de datos' });
        }
        
        console.log('✅ Producto verificado:', Id_Producto);
        
        const insertSql = `INSERT INTO orden (Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario) 
                          VALUES (?, ?, ?, ?, ?, ?)`;
        
        db.query(insertSql, [Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario], (err, result) => {
            if (err) {
                console.error('❌ Error al insertar orden:', err);
                return res.status(500).json({ error: 'Error al guardar orden: ' + err.message });
            }
            
            console.log('✅ Orden insertada - ID:', result.insertId);
            
            const updateStockSql = `UPDATE stock SET Cantidad = Cantidad - ? WHERE Id_Producto = ?`;
            
            db.query(updateStockSql, [CantidadVendida, Id_Producto], (err2, result2) => {
                if (err2) {
                    console.error('⚠️  Advertencia: Error al actualizar stock:', err2);
                    return res.status(500).json({ error: 'Orden guardada pero error al actualizar stock: ' + err2.message });
                }
                
                console.log(`✅ Stock actualizado - Producto: ${Id_Producto}, Cantidad reducida: ${CantidadVendida}`);
                res.json({ 
                    message: "Orden guardada exitosamente", 
                    orderId: result.insertId,
                    producto: Id_Producto,
                    factura: NumFactura,
                    cantidad: CantidadVendida
                });
            });
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

// ================= NUEVOS ENDPOINTS PARA MODALES =================

app.get('/api/ventas-detalle', (req, res) => {
    const { periodo = 'dia' } = req.query;
    
    let fechaInicio = new Date();
    switch(periodo) {
        case 'dia': fechaInicio.setDate(fechaInicio.getDate() - 1); break;
        case 'semana': fechaInicio.setDate(fechaInicio.getDate() - 7); break;
        case 'mes': fechaInicio.setDate(fechaInicio.getDate() - 30); break;
        case 'año': fechaInicio.setFullYear(fechaInicio.getFullYear() - 1); break;
        default: fechaInicio.setDate(fechaInicio.getDate() - 30);
    }
    const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
    
    const sqlPorHora = `
        SELECT HOUR(Fecha) as hora, SUM(Monto) as total, COUNT(*) as transacciones
        FROM compra
        WHERE Fecha >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY HOUR(Fecha)
        ORDER BY hora
    `;
    
    const sqlDiario = `
        SELECT DATE(Fecha) as fecha, SUM(Monto) as total, COUNT(*) as transacciones
        FROM compra
        WHERE Fecha >= ?
        GROUP BY DATE(Fecha)
        ORDER BY fecha DESC
        LIMIT 30
    `;
    
    Promise.all([
        db.promise().query(sqlPorHora),
        db.promise().query(sqlDiario, [fechaInicioStr])
    ]).then(([porHora, diario]) => {
        res.json({
            ventas_por_hora: porHora[0].map(v => ({ hora: v.hora, total: parseFloat(v.total) || 0, transacciones: v.transacciones })),
            ventas_diarias: diario[0].map(v => ({ fecha: v.fecha, total: parseFloat(v.total) || 0, transacciones: v.transacciones }))
        });
    }).catch(err => {
        console.error('Error en /api/ventas-detalle:', err);
        res.status(500).json({ error: err.message });
    });
});

// ================= ENDPOINT TOP-PRODUCTOS CORREGIDO (CON CATEGORÍA) =================
app.get('/api/top-productos', (req, res) => {
    const { periodo = 'mes', limite = 100, fecha, desde, hasta, anio, mes } = req.query;
    
    let whereCondition = '';
    let params = [];
    
    if (fecha) {
        whereCondition = 'WHERE DATE(c.Fecha) = ?';
        params = [fecha];
    } else if (desde && hasta) {
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [desde, hasta];
    } else if (anio && mes) {
        const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [primerDia, ultimoDia];
    } else if (anio) {
        whereCondition = 'WHERE YEAR(c.Fecha) = ?';
        params = [anio];
    } else {
        let fechaInicio = new Date();
        switch(periodo) {
            case 'dia':
                fechaInicio.setDate(fechaInicio.getDate() - 1);
                break;
            case 'semana':
                fechaInicio.setDate(fechaInicio.getDate() - 7);
                break;
            case 'mes':
                fechaInicio.setDate(fechaInicio.getDate() - 30);
                break;
            case 'año':
                fechaInicio.setFullYear(fechaInicio.getFullYear() - 1);
                break;
            default:
                fechaInicio.setDate(fechaInicio.getDate() - 30);
        }
        const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
        whereCondition = 'WHERE c.Fecha >= ?';
        params = [fechaInicioStr];
    }
    
    const sql = `
        SELECT 
            p.Id_Producto,
            p.Nombre as nombre,
            COALESCE(cat.Nombre, 'Sin categoría') as categoria,
            COALESCE(SUM(o.CantidadVendida), 0) as cantidad,
            COALESCE(SUM(o.Subtotal), 0) as total_ventas
        FROM orden o
        INNER JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        INNER JOIN compra c ON o.NumFactura = c.Num_Factura
        ${whereCondition}
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        HAVING cantidad > 0
        ORDER BY cantidad DESC
        LIMIT ?
    `;
    
    db.query(sql, [...params, parseInt(limite)], (err, results) => {
        if (err) {
            console.error('Error en /api/top-productos:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ================= ESTADÍSTICAS POR AÑO CORREGIDO =================
app.get('/api/estadisticas-ventas-anio', (req, res) => {
    const { anio } = req.query;
    
    const sqlVentas = `
        SELECT COALESCE(SUM(o.CantidadVendida), 0) as total_unidades, COUNT(DISTINCT c.Num_Factura) as cantidad_ventas
        FROM compra c
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE YEAR(c.Fecha) = ?
    `;
    
    const sqlVentasMensuales = `
        SELECT MONTH(c.Fecha) as mes, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM compra c
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE YEAR(c.Fecha) = ?
        GROUP BY MONTH(c.Fecha)
        ORDER BY mes
    `;
    
    const sqlCategorias = `
        SELECT cat.Nombre as categoria, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM orden o
        INNER JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        INNER JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE YEAR(c.Fecha) = ?
        GROUP BY cat.Id_Categoria
        ORDER BY total DESC
    `;
    
    const sqlTopProductos = `
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoría') as categoria, SUM(o.CantidadVendida) as cantidad
        FROM orden o
        INNER JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        INNER JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE YEAR(c.Fecha) = ?
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        ORDER BY cantidad DESC
        LIMIT 5
    `;
    
    const sqlTopProductosCompleto = `
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoría') as categoria, SUM(o.CantidadVendida) as cantidad
        FROM orden o
        INNER JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        INNER JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE YEAR(c.Fecha) = ?
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        ORDER BY cantidad DESC
    `;
    
    const sqlTopClientes = `
        SELECT CONCAT(COALESCE(cl.Nombre, 'Cliente'), ' ', COALESCE(cl.Apellido, '')) as nombre, SUM(o.CantidadVendida) as unidades_compradas
        FROM compra c
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE YEAR(c.Fecha) = ? AND c.Id_cliente IS NOT NULL
        GROUP BY c.Id_cliente, cl.Nombre, cl.Apellido
        ORDER BY unidades_compradas DESC
        LIMIT 5
    `;
    
    Promise.all([
        db.promise().query(sqlVentas, [anio]),
        db.promise().query(sqlVentasMensuales, [anio]),
        db.promise().query(sqlCategorias, [anio]),
        db.promise().query(sqlTopProductos, [anio]),
        db.promise().query(sqlTopProductosCompleto, [anio]),
        db.promise().query(sqlTopClientes, [anio])
    ]).then(([ventas, ventasMensuales, categorias, topProductos, topProductosCompleto, topClientes]) => {
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const dataMensual = Array(12).fill(0);
        const ventasPorMes = ventasMensuales[0];
        ventasPorMes.forEach(v => {
            dataMensual[v.mes - 1] = parseInt(v.total) || 0;
        });
        
        const totalUnidades = parseInt(ventas[0][0]?.total_unidades) || 0;
        
        res.json({
            cantidad_ventas: parseInt(ventas[0][0]?.cantidad_ventas) || 0,
            total_unidades: totalUnidades,
            ventas_diarias: meses.map((mes, idx) => ({ fecha: `${mes} ${anio}`, total: dataMensual[idx] })),
            categorias: categorias[0].map(v => v.categoria),
            totales_categorias: categorias[0].map(v => parseInt(v.total) || 0),
            top_productos: topProductos[0],
            top_productos_completo: topProductosCompleto[0],
            top_clientes: topClientes[0],
            labels_dias: meses,
            data_dias: dataMensual
        });
    }).catch(err => {
        console.error('Error en /api/estadisticas-ventas-anio:', err);
        res.status(500).json({ error: err.message });
    });
});

// ================= ESTADÍSTICAS POR FECHA CORREGIDO =================
app.get('/api/estadisticas-ventas-fecha', (req, res) => {
    const { fecha } = req.query;
    
    const sqlVentas = `
        SELECT COALESCE(SUM(o.CantidadVendida), 0) as total_unidades, COUNT(DISTINCT c.Num_Factura) as cantidad_ventas
        FROM compra c
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) = ?
    `;
    
    const sqlCategorias = `
        SELECT cat.Nombre as categoria, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM orden o
        INNER JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        INNER JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) = ?
        GROUP BY cat.Id_Categoria
        ORDER BY total DESC
    `;
    
    const sqlTopProductos = `
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoría') as categoria, SUM(o.CantidadVendida) as cantidad
        FROM orden o
        INNER JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        INNER JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) = ?
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        ORDER BY cantidad DESC
    `;
    
    const sqlTopClientes = `
        SELECT CONCAT(COALESCE(cl.Nombre, 'Cliente'), ' ', COALESCE(cl.Apellido, '')) as nombre, SUM(o.CantidadVendida) as unidades_compradas
        FROM compra c
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) = ? AND c.Id_cliente IS NOT NULL
        GROUP BY c.Id_cliente, cl.Nombre, cl.Apellido
        ORDER BY unidades_compradas DESC
    `;
    
    Promise.all([
        db.promise().query(sqlVentas, [fecha]),
        db.promise().query(sqlCategorias, [fecha]),
        db.promise().query(sqlTopProductos, [fecha]),
        db.promise().query(sqlTopClientes, [fecha])
    ]).then(([ventas, categorias, topProductos, topClientes]) => {
        const totalUnidades = parseInt(ventas[0][0]?.total_unidades) || 0;
        
        res.json({
            cantidad_ventas: parseInt(ventas[0][0]?.cantidad_ventas) || 0,
            total_unidades: totalUnidades,
            labels_dias: [fecha],
            data_dias: [totalUnidades],
            categorias: categorias[0].map(v => v.categoria),
            totales_categorias: categorias[0].map(v => parseInt(v.total) || 0),
            top_productos: topProductos[0].slice(0, 5),
            top_productos_completo: topProductos[0],
            top_clientes: topClientes[0].slice(0, 5),
            top_clientes_completo: topClientes[0]
        });
    }).catch(err => {
        console.error('Error en /api/estadisticas-ventas-fecha:', err);
        res.status(500).json({ error: err.message });
    });
});

// ================= ENDPOINT TOP-CLIENTES CORREGIDO =================
app.get('/api/top-clientes', (req, res) => {
    const { periodo = 'mes', limite = 100, fecha, desde, hasta, anio, mes } = req.query;
    
    let whereCondition = '';
    let params = [];
    
    if (fecha) {
        whereCondition = 'AND DATE(c.Fecha) = ?';
        params = [fecha];
    } else if (desde && hasta) {
        whereCondition = 'AND DATE(c.Fecha) BETWEEN ? AND ?';
        params = [desde, hasta];
    } else if (anio && mes) {
        const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
        whereCondition = 'AND DATE(c.Fecha) BETWEEN ? AND ?';
        params = [primerDia, ultimoDia];
    } else if (anio) {
        whereCondition = 'AND YEAR(c.Fecha) = ?';
        params = [anio];
    } else {
        let fechaInicio = new Date();
        switch(periodo) {
            case 'dia':
                fechaInicio.setDate(fechaInicio.getDate() - 1);
                break;
            case 'semana':
                fechaInicio.setDate(fechaInicio.getDate() - 7);
                break;
            case 'mes':
                fechaInicio.setDate(fechaInicio.getDate() - 30);
                break;
            case 'año':
                fechaInicio.setFullYear(fechaInicio.getFullYear() - 1);
                break;
            default:
                fechaInicio.setDate(fechaInicio.getDate() - 30);
        }
        const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
        whereCondition = 'AND c.Fecha >= ?';
        params = [fechaInicioStr];
    }
    
    const sql = `
        SELECT 
            CONCAT(COALESCE(cl.Nombre, 'Cliente'), ' ', COALESCE(cl.Apellido, '')) as nombre,
            SUM(o.CantidadVendida) as compras
        FROM compra c
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE c.Id_cliente IS NOT NULL ${whereCondition}
        GROUP BY c.Id_cliente, cl.Nombre, cl.Apellido
        HAVING compras > 0
        ORDER BY compras DESC
        LIMIT ?
    `;
    
    db.query(sql, [...params, parseInt(limite)], (err, results) => {
        if (err) {
            console.error('Error en /api/top-clientes:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ================= INVENTARIO DETALLE =================

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
            COALESCE(SUM(o.Subtotal), 0) as TotalVentas 
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
            m.Motivo
        FROM merma m
        JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
        JOIN producto pr ON m.Id_Producto = pr.Id_Producto
        LEFT JOIN categoria c ON pr.Id_Categoria = c.Id_Categoria
        WHERE pd.Fecha >= ?
        GROUP BY m.Id_Producto, pr.Nombre, pr.Precio, pr.Marca, c.Nombre, m.Motivo
        ORDER BY cantidad DESC
    `;
    
    const sqlPerdidasPorCategoria = `
        SELECT 
            COALESCE(c.Nombre, 'Sin Categoria') as categoria,
            SUM(m.Cantidad) as cantidad
        FROM merma m
        JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
        JOIN producto pr ON m.Id_Producto = pr.Id_Producto
        LEFT JOIN categoria c ON pr.Id_Categoria = c.Id_Categoria
        WHERE pd.Fecha >= ?
        GROUP BY c.Nombre
        ORDER BY cantidad DESC
    `;
    
    const sqlConsumoPorCategoria = `
        SELECT 
            COALESCE(c.Nombre, 'Sin Categoria') as categoria,
            SUM(ci.Cantidad) as cantidad
        FROM consumo_interno ci
        JOIN producto pr ON ci.Id_Producto = pr.Id_Producto
        LEFT JOIN categoria c ON pr.Id_Categoria = c.Id_Categoria
        WHERE ci.Fecha >= ?
        GROUP BY c.Nombre
        ORDER BY cantidad DESC
    `;
    
    const sqlTotales = `
        SELECT 
            (SELECT COALESCE(SUM(m.Cantidad), 0) FROM merma m JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida WHERE pd.Fecha >= ?) as unidades_perdidas,
            (SELECT COALESCE(SUM(ci.Cantidad), 0) FROM consumo_interno ci WHERE ci.Fecha >= ?) as unidades_consumo
    `;
    
    Promise.all([
        db.promise().query(sqlPerdidas, [fechaInicioStr]),
        db.promise().query(sqlPerdidasPorCategoria, [fechaInicioStr]),
        db.promise().query(sqlConsumoPorCategoria, [fechaInicioStr]),
        db.promise().query(sqlTotales, [fechaInicioStr, fechaInicioStr])
    ]).then(([productosPerdidas, perdidasCategoria, consumoCategoria, totales]) => {
        const productosConPerdidas = productosPerdidas[0].map(p => ({
            nombre: p.Nombre,
            categoria: p.Categoria,
            marca: p.Marca,
            precio: parseFloat(p.Precio) || 0,
            cantidad: parseInt(p.cantidad) || 0,
            motivo: p.Motivo || 'Sin motivo'
        }));
        
        res.json({
            productos_con_perdidas: productosConPerdidas,
            perdidas_por_categoria: perdidasCategoria[0].map(c => ({ categoria: c.categoria, cantidad: parseInt(c.cantidad) || 0 })),
            consumo_por_categoria: consumoCategoria[0].map(c => ({ categoria: c.categoria, cantidad: parseInt(c.cantidad) || 0 })),
            total_unidades_perdidas: parseInt(totales[0][0]?.unidades_perdidas) || 0,
            total_unidades_consumo: parseInt(totales[0][0]?.unidades_consumo) || 0
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

// ================= SISTEMA QR PARA VENDEDORES =================

function generarCodigoUnico(idVendedor) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    const hash = crypto.createHash('md5').update(`${idVendedor}${timestamp}${random}`).digest('hex').substring(0, 8);
    return `CHP${idVendedor}${timestamp}${hash}`;
}

function crearTablaQRVendedores() {
    const sql = `
        CREATE TABLE IF NOT EXISTS qr_vendedores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(100) NOT NULL UNIQUE,
            id_vendedor INT NOT NULL,
            nombre_vendedor VARCHAR(100),
            generado_en DATETIME DEFAULT NOW(),
            expira_en DATETIME NOT NULL,
            usado TINYINT DEFAULT 0,
            generado_desde_app TINYINT DEFAULT 0,
            enviado_por_email TINYINT DEFAULT 0,
            FOREIGN KEY (id_vendedor) REFERENCES trabajadores(Id_Trabajador),
            INDEX idx_codigo (codigo),
            INDEX idx_expira (expira_en),
            INDEX idx_vendedor (id_vendedor)
        )
    `;
    db.query(sql, (err) => {
        if (err) {
            console.error('❌ Error creando tabla qr_vendedores:', err);
        } else {
            console.log('✅ Tabla qr_vendedores lista');
        }
    });
}

setInterval(() => {
    db.query(`DELETE FROM qr_vendedores WHERE expira_en < NOW() OR usado = 1`, (err) => {
        if (!err) console.log('🧹 QR expirados limpiados');
    });
}, 3600000);

app.get('/api/vendedor/verificar', verificarTokenTrabajador, (req, res) => {
    db.query(`SELECT Id_Trabajador, NombreCompleto, email FROM trabajadores WHERE Id_Trabajador = ?`, 
        [req.usuario.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
        res.json({
            vendedor: {
                id: results[0].Id_Trabajador,
                nombre: results[0].NombreCompleto,
                email: results[0].email
            }
        });
    });
});

app.get('/api/vendedor/qr-activo/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`
        SELECT codigo, expira_en FROM qr_vendedores 
        WHERE id_vendedor = ? AND usado = 0 AND expira_en > NOW()
        ORDER BY generado_en DESC LIMIT 1
    `, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        
        if (results.length > 0) {
            res.json({
                tiene_qr_activo: true,
                codigo: results[0].codigo,
                expira: results[0].expira_en
            });
        } else {
            res.json({ tiene_qr_activo: false });
        }
    });
});

app.post('/api/vendedor/generar-qr', verificarTokenTrabajador, (req, res) => {
    const { id_vendedor, duracion_minutos = 60 } = req.body;
    
    if (!id_vendedor) {
        return res.status(400).json({ success: false, message: 'ID de vendedor requerido' });
    }
    
    if (req.usuario.id !== id_vendedor) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    
    const codigo = generarCodigoUnico(id_vendedor);
    const expiraEn = new Date(Date.now() + duracion_minutos * 60000);
    
    db.query(`SELECT NombreCompleto FROM trabajadores WHERE Id_Trabajador = ?`, [id_vendedor], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error en servidor' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });
        }
        
        const nombreVendedor = results[0].NombreCompleto;
        
        db.query(`
            INSERT INTO qr_vendedores (codigo, id_vendedor, nombre_vendedor, expira_en, generado_desde_app) 
            VALUES (?, ?, ?, ?, 1)
        `, [codigo, id_vendedor, nombreVendedor, expiraEn], (err2) => {
            if (err2) {
                return res.status(500).json({ success: false, message: 'Error guardando QR: ' + err2.message });
            }
            
            res.json({
                success: true,
                codigo: codigo,
                expira: expiraEn,
                vendedor: nombreVendedor
            });
        });
    });
});

app.post('/api/vendedor/enviar-qr-email', (req, res) => {
    const { email, codigo, nombre_vendedor } = req.body;
    
    if (!email || !codigo) {
        return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }
    
    qrcode.toBuffer(codigo, { errorCorrectionLevel: 'H' }, (err, qrBuffer) => {
        if (err) {
            console.error('Error generando QR buffer:', err);
            return res.status(500).json({ success: false, message: 'Error generando QR' });
        }
        
        const qrBase64 = qrBuffer.toString('base64');
        const qrImageSrc = `data:image/png;base64,${qrBase64}`;
        
        const mailOptions = {
            from: 'Tienda Chepita <isabelchepita678@gmail.com>',
            to: email,
            subject: 'Tu codigo QR para ventas - Tienda Chepita',
            html: `
                <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px; max-width: 500px; margin: 0 auto;">
                    <h2 style="color: #A63C89; text-align: center;">Tu codigo QR de vendedor</h2>
                    <p>Hola <strong>${nombre_vendedor || 'Vendedor'}</strong>,</p>
                    <p>Este es tu codigo QR para asignar tus ventas en la caja.</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <img src="${qrImageSrc}" alt="QR Code" style="width: 250px; height: 250px; border: 2px solid #A63C89; border-radius: 15px;">
                    </div>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px;">
                        <p><strong>Codigo numerico (respaldo):</strong></p>
                        <p style="font-family: monospace; font-size: 16px; font-weight: bold; text-align: center; background: white; padding: 10px; border-radius: 8px;">${codigo}</p>
                    </div>
                    <hr>
                    <p style="color: #999; font-size: 11px; text-align: center;">Tienda Chepita - Sistema de Gestion Comercial</p>
                </div>
            `
        };
        
        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                console.error('Error enviando email:', error);
                return res.status(500).json({ success: false, message: 'Error al enviar email: ' + error.message });
            }
            res.json({ success: true, message: 'QR enviado a tu correo electronico' });
        });
    });
});

app.get('/api/generar-imagen-qr', (req, res) => {
    const { codigo } = req.query;
    
    if (!codigo) {
        return res.status(400).send('Código requerido');
    }
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline');
    
    qrcode.toBuffer(codigo, { errorCorrectionLevel: 'H' }, (err, buffer) => {
        if (err) {
            console.error('Error generando QR:', err);
            return res.status(500).send('Error generando QR');
        }
        res.send(buffer);
    });
});

app.post('/api/validar-qr-vendedor', (req, res) => {
    const { codigo } = req.body;
    
    if (!codigo) {
        return res.json({ valido: false, message: 'Código inválido' });
    }
    
    db.query(`
        SELECT q.*, t.NombreCompleto 
        FROM qr_vendedores q
        JOIN trabajadores t ON q.id_vendedor = t.Id_Trabajador
        WHERE q.codigo = ? AND q.usado = 0 AND q.expira_en > NOW()
    `, [codigo], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        
        if (results.length === 0) {
            db.query(`SELECT usado, expira_en FROM qr_vendedores WHERE codigo = ?`, [codigo], (err2, checkResults) => {
                if (checkResults.length > 0) {
                    const check = checkResults[0];
                    if (check.usado === 1) {
                        return res.json({ valido: false, message: '⚠️ QR ya usado. Genere uno nuevo.' });
                    }
                    if (new Date(check.expira_en) < new Date()) {
                        return res.json({ valido: false, message: '⏰ QR expirado. Genere uno nuevo.' });
                    }
                }
                return res.json({ valido: false, message: '❌ QR inválido' });
            });
            return;
        }
        
        const qr = results[0];
        db.query(`UPDATE qr_vendedores SET usado = 1 WHERE id = ?`, [qr.id]);
        
        console.log(`✅ QR válido - Vendedor: ${qr.NombreCompleto}`);
        
        res.json({
            valido: true,
            id_vendedor: qr.id_vendedor,
            nombre_vendedor: qr.NombreCompleto,
            expira: qr.expira_en
        });
    });
});

app.get('/api/codigos-activos/:id_vendedor', (req, res) => {
    const { id_vendedor } = req.params;
    
    db.query(`
        SELECT codigo, expira_en, usado, generado_en 
        FROM qr_vendedores 
        WHERE id_vendedor = ? AND expira_en > NOW() AND usado = 0
        ORDER BY generado_en DESC
    `, [id_vendedor], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.post('/api/registrar-uso-qr', (req, res) => {
    const { codigo, id_vendedor, id_cajero } = req.body;
    console.log(`📊 QR usado: ${codigo} | Vendedor: ${id_vendedor} | Cajero: ${id_cajero || 'desconocido'}`);
    res.json({ success: true });
});

// ================= ENDPOINTS CORREGIDOS PARA DASHBOARD =================

app.get('/api/anios-disponibles', (req, res) => {
    const sql = `SELECT DISTINCT YEAR(Fecha) as anio FROM compra ORDER BY anio DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.map(r => r.anio));
    });
});

app.get('/api/estadisticas-ventas-fecha', (req, res) => {
    const { fecha } = req.query;
    
    const sqlVentas = `
        SELECT COALESCE(SUM(o.CantidadVendida), 0) as total_unidades, COUNT(DISTINCT c.Num_Factura) as cantidad_ventas
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) = ?
    `;
    
    const sqlVentasPorDia = `
        SELECT DATE(c.Fecha) as fecha, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) = ?
        GROUP BY DATE(c.Fecha)
    `;
    
    const sqlCategorias = `
        SELECT cat.Nombre as categoria, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) = ?
        GROUP BY cat.Id_Categoria
        ORDER BY total DESC
    `;
    
    const sqlTopProductos = `
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoría') as categoria, SUM(o.CantidadVendida) as cantidad
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) = ?
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        ORDER BY cantidad DESC
        LIMIT 5
    `;
    
    const sqlTopClientes = `
        SELECT CONCAT(COALESCE(cl.Nombre, 'Cliente'), ' ', COALESCE(cl.Apellido, '')) as nombre, COUNT(o.Id_Producto) as unidades_compradas
        FROM compra c
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        LEFT JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) = ? AND c.Id_cliente IS NOT NULL
        GROUP BY c.Id_cliente, cl.Nombre, cl.Apellido
        ORDER BY unidades_compradas DESC
        LIMIT 5
    `;
    
    Promise.all([
        db.promise().query(sqlVentas, [fecha]),
        db.promise().query(sqlVentasPorDia, [fecha]),
        db.promise().query(sqlCategorias, [fecha]),
        db.promise().query(sqlTopProductos, [fecha]),
        db.promise().query(sqlTopClientes, [fecha])
    ]).then(([ventas, ventasPorDia, categorias, topProductos, topClientes]) => {
        res.json({
            cantidad_ventas: parseInt(ventas[0][0]?.cantidad_ventas) || 0,
            total_unidades: parseInt(ventas[0][0]?.total_unidades) || 0,
            labels_dias: [fecha],
            data_dias: [parseInt(ventas[0][0]?.total_unidades) || 0],
            categorias: categorias[0].map(v => v.categoria),
            totales_categorias: categorias[0].map(v => parseInt(v.total) || 0),
            top_productos: topProductos[0],
            top_clientes: topClientes[0],
            ventas_diarias: ventasPorDia[0].map(v => ({ fecha: v.fecha, total: parseInt(v.total) || 0 }))
        });
    }).catch(err => {
        console.error('Error en /api/estadisticas-ventas-fecha:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/estadisticas-ventas-rango', (req, res) => {
    const { desde, hasta } = req.query;
    
    const sqlVentas = `
        SELECT COALESCE(SUM(o.CantidadVendida), 0) as total_unidades, COUNT(DISTINCT c.Num_Factura) as cantidad_ventas
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
    `;
    
    const sqlVentasDiarias = `
        SELECT DATE(c.Fecha) as fecha, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
        GROUP BY DATE(c.Fecha)
        ORDER BY fecha
    `;
    
    const sqlCategorias = `
        SELECT cat.Nombre as categoria, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
        GROUP BY cat.Id_Categoria
        ORDER BY total DESC
    `;
    
    const sqlTopProductos = `
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoría') as categoria, SUM(o.CantidadVendida) as cantidad
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        ORDER BY cantidad DESC
        LIMIT 5
    `;
    
    Promise.all([
        db.promise().query(sqlVentas, [desde, hasta]),
        db.promise().query(sqlVentasDiarias, [desde, hasta]),
        db.promise().query(sqlCategorias, [desde, hasta]),
        db.promise().query(sqlTopProductos, [desde, hasta])
    ]).then(([ventas, ventasDiarias, categorias, topProductos]) => {
        const ventasDiariasData = ventasDiarias[0];
        const labels = ventasDiariasData.map(v => {
            const fecha = new Date(v.fecha);
            return fecha.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
        });
        
        res.json({
            cantidad_ventas: parseInt(ventas[0][0]?.cantidad_ventas) || 0,
            total_unidades: parseInt(ventas[0][0]?.total_unidades) || 0,
            ventas_diarias: ventasDiariasData.map(v => ({ fecha: v.fecha, total: parseInt(v.total) || 0 })),
            categorias: categorias[0].map(v => v.categoria),
            totales_categorias: categorias[0].map(v => parseInt(v.total) || 0),
            top_productos: topProductos[0],
            labels_dias: labels,
            data_dias: ventasDiariasData.map(v => parseInt(v.total) || 0)
        });
    }).catch(err => {
        console.error('Error en /api/estadisticas-ventas-rango:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/estadisticas-ventas-mes', (req, res) => {
    const { anio, mes } = req.query;
    
    const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
    
    const sqlVentas = `
        SELECT COALESCE(SUM(o.CantidadVendida), 0) as total_unidades, COUNT(DISTINCT c.Num_Factura) as cantidad_ventas
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
    `;
    
    const sqlVentasDiarias = `
        SELECT DAY(c.Fecha) as dia, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
        GROUP BY DAY(c.Fecha)
        ORDER BY dia
    `;
    
    const sqlCategorias = `
        SELECT cat.Nombre as categoria, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
        GROUP BY cat.Id_Categoria
        ORDER BY total DESC
    `;
    
    const sqlTopProductos = `
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoría') as categoria, SUM(o.CantidadVendida) as cantidad
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE DATE(c.Fecha) BETWEEN ? AND ?
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        ORDER BY cantidad DESC
        LIMIT 5
    `;
    
    Promise.all([
        db.promise().query(sqlVentas, [primerDia, ultimoDia]),
        db.promise().query(sqlVentasDiarias, [primerDia, ultimoDia]),
        db.promise().query(sqlCategorias, [primerDia, ultimoDia]),
        db.promise().query(sqlTopProductos, [primerDia, ultimoDia])
    ]).then(([ventas, ventasDiarias, categorias, topProductos]) => {
        const diasData = ventasDiarias[0];
        const labels = diasData.map(v => `Día ${v.dia}`);
        
        res.json({
            cantidad_ventas: parseInt(ventas[0][0]?.cantidad_ventas) || 0,
            total_unidades: parseInt(ventas[0][0]?.total_unidades) || 0,
            ventas_diarias: diasData.map(v => ({ dia: v.dia, total: parseInt(v.total) || 0 })),
            categorias: categorias[0].map(v => v.categoria),
            totales_categorias: categorias[0].map(v => parseInt(v.total) || 0),
            top_productos: topProductos[0],
            labels_dias: labels,
            data_dias: diasData.map(v => parseInt(v.total) || 0)
        });
    }).catch(err => {
        console.error('Error en /api/estadisticas-ventas-mes:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/estadisticas-ventas-anio', (req, res) => {
    const { anio } = req.query;
    
    const sqlVentas = `
        SELECT COALESCE(SUM(o.CantidadVendida), 0) as total_unidades, COUNT(DISTINCT c.Num_Factura) as cantidad_ventas
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE YEAR(c.Fecha) = ?
    `;
    
    const sqlVentasMensuales = `
        SELECT MONTH(c.Fecha) as mes, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM compra c
        JOIN orden o ON c.Num_Factura = o.NumFactura
        WHERE YEAR(c.Fecha) = ?
        GROUP BY MONTH(c.Fecha)
        ORDER BY mes
    `;
    
    const sqlCategorias = `
        SELECT cat.Nombre as categoria, COALESCE(SUM(o.CantidadVendida), 0) as total
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE YEAR(c.Fecha) = ?
        GROUP BY cat.Id_Categoria
        ORDER BY total DESC
    `;
    
    const sqlTopProductos = `
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoría') as categoria, SUM(o.CantidadVendida) as cantidad
        FROM orden o
        JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE YEAR(c.Fecha) = ?
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre
        ORDER BY cantidad DESC
        LIMIT 5
    `;
    
    Promise.all([
        db.promise().query(sqlVentas, [anio]),
        db.promise().query(sqlVentasMensuales, [anio]),
        db.promise().query(sqlCategorias, [anio]),
        db.promise().query(sqlTopProductos, [anio])
    ]).then(([ventas, ventasMensuales, categorias, topProductos]) => {
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const dataMensual = Array(12).fill(0);
        const ventasPorMes = ventasMensuales[0];
        ventasPorMes.forEach(v => {
            dataMensual[v.mes - 1] = parseInt(v.total) || 0;
        });
        
        res.json({
            cantidad_ventas: parseInt(ventas[0][0]?.cantidad_ventas) || 0,
            total_unidades: parseInt(ventas[0][0]?.total_unidades) || 0,
            ventas_diarias: meses.map((mes, idx) => ({ fecha: `${mes} ${anio}`, total: dataMensual[idx] })),
            categorias: categorias[0].map(v => v.categoria),
            totales_categorias: categorias[0].map(v => parseInt(v.total) || 0),
            top_productos: topProductos[0],
            labels_dias: meses,
            data_dias: dataMensual
        });
    }).catch(err => {
        console.error('Error en /api/estadisticas-ventas-anio:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/ventas-recientes', (req, res) => {
    const sql = `
        SELECT c.Fecha, 
               CONCAT(COALESCE(cl.Nombre, 'Cliente'), ' ', COALESCE(cl.Apellido, '')) as cliente,
               COALESCE(p.Nombre, 'Producto') as producto, 
               o.CantidadVendida as cantidad
        FROM compra c
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        LEFT JOIN orden o ON c.Num_Factura = o.NumFactura
        LEFT JOIN producto p ON o.Id_Producto = p.Id_Producto
        WHERE o.Id_Producto IS NOT NULL
        ORDER BY c.Fecha DESC
        LIMIT 10
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
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
                        ci.Fecha
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

// ================= RECUPERACIÓN UNIFICADA (TRABAJADORES Y ADMIN) =================
app.post('/api/recuperar-password-unificado', (req, res) => {
    const { email } = req.body;
    
    if (!email || email.trim() === '') {
        return res.status(400).json({ success: false, message: 'Por favor, ingrese su correo electrónico' });
    }
    
    db.query(`SELECT id, usuario, email, 'admin' as tipo FROM usuarios_admin WHERE email = ?`, [email], (err, adminResults) => {
        if (err) {
            console.error('Error en recuperación admin:', err);
            return res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
        
        if (adminResults.length > 0) {
            const admin = adminResults[0];
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
                        <h2 style="color: #A63C89;">Recuperación de Contraseña</h2>
                        <p>Hola <strong>${admin.usuario}</strong>,</p>
                        <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
                        </div>
                        <p style="color: #666;">Este enlace es válido por 1 hora.</p>
                        <hr>
                        <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestión Comercial</p>
                    </div>
                `
            };
            
            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.error('Error al enviar email admin:', error);
                    return res.status(500).json({ success: false, message: 'Error al enviar el correo.' });
                }
                console.log(`✅ Email de recuperación enviado a ADMIN: ${email}`);
                res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
            });
        } else {
            db.query(`SELECT Id_Trabajador, NombreCompleto, email, 'trabajador' as tipo FROM trabajadores WHERE email = ? AND Activo = 1`, [email], (err, trabajadoresResults) => {
                if (err) {
                    console.error('Error en recuperación trabajador:', err);
                    return res.status(500).json({ success: false, message: 'Error en el servidor' });
                }
                
                if (trabajadoresResults.length > 0) {
                    const trabajador = trabajadoresResults[0];
                    const token = crypto.randomBytes(32).toString('hex');
                    const expiraEn = new Date();
                    expiraEn.setHours(expiraEn.getHours() + 1);
                    
                    db.query(`INSERT INTO trabajador_recuperacion_tokens (id_trabajador, token, expira_en) VALUES (?, ?, ?)`, 
                        [trabajador.Id_Trabajador, token, expiraEn], (err) => {
                        if (err) {
                            console.error('Error guardando token trabajador:', err);
                            return res.status(500).json({ success: false, message: 'Error en el servidor' });
                        }
                        
                        const resetLink = `http://localhost:3000/trabajador-reset-password.html?token=${token}`;
                        
                        const mailOptions = {
                            from: 'Tienda Chepita <isabelchepita678@gmail.com>',
                            to: trabajador.email,
                            subject: 'Recuperación de Contraseña - Tienda Chepita',
                            html: `
                                <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                                    <h2 style="color: #A63C89;">Recuperación de Contraseña</h2>
                                    <p>Hola <strong>${trabajador.NombreCompleto}</strong>,</p>
                                    <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
                                    <div style="text-align: center; margin: 25px 0;">
                                        <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
                                    </div>
                                    <p style="color: #666;">Este enlace es válido por 1 hora.</p>
                                    <hr>
                                    <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestión Comercial</p>
                                </div>
                            `
                        };
                        
                        transporter.sendMail(mailOptions, (error) => {
                            if (error) {
                                console.error('Error al enviar email trabajador:', error);
                                return res.status(500).json({ success: false, message: 'Error al enviar el correo.' });
                            }
                            console.log(`✅ Email de recuperación enviado a TRABAJADOR: ${email}`);
                            res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
                        });
                    });
                } else {
                    console.log(`📧 Correo no registrado: ${email}`);
                    res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
                }
            });
        }
    });
});

// ================= PANEL FINANCIERO - ENDPOINTS COMPLETOS =================

app.get('/api/financiero/ventas-detalle', (req, res) => {
    const { desde, hasta, anio, mes } = req.query;
    
    let whereCondition = '';
    let params = [];
    
    if (desde && hasta) {
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [desde, hasta];
    } else if (anio && mes) {
        const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [primerDia, ultimoDia];
    } else if (anio) {
        whereCondition = 'WHERE YEAR(c.Fecha) = ?';
        params = [anio];
    } else {
        const fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - 30);
        whereCondition = 'WHERE c.Fecha >= ?';
        params = [fechaInicio.toISOString().split('T')[0]];
    }
    
    const sql = `
        SELECT 
            COALESCE(SUM(o.Subtotal), 0) as ventas_brutas,
            COUNT(DISTINCT c.Num_Factura) as cantidad_ventas,
            COALESCE(SUM(o.CantidadVendida), 0) as unidades_vendidas
        FROM compra c
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        ${whereCondition}
    `;
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error en /api/financiero/ventas-detalle:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const ventasBrutas = parseFloat(results[0]?.ventas_brutas) || 0;
        const iva = ventasBrutas * 0.15;
        const ventasNetas = ventasBrutas - iva;
        
        res.json({
            ventas_brutas: ventasBrutas,
            iva: iva,
            ventas_netas: ventasNetas,
            cantidad_ventas: parseInt(results[0]?.cantidad_ventas) || 0,
            unidades_vendidas: parseInt(results[0]?.unidades_vendidas) || 0
        });
    });
});

app.get('/api/financiero/costo-ventas', (req, res) => {
    const { desde, hasta, anio, mes } = req.query;
    
    let whereCondition = '';
    let params = [];
    
    if (desde && hasta) {
        whereCondition = 'AND DATE(c.Fecha) BETWEEN ? AND ?';
        params = [desde, hasta];
    } else if (anio && mes) {
        const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
        whereCondition = 'AND DATE(c.Fecha) BETWEEN ? AND ?';
        params = [primerDia, ultimoDia];
    } else if (anio) {
        whereCondition = 'AND YEAR(c.Fecha) = ?';
        params = [anio];
    } else {
        const fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - 30);
        whereCondition = 'AND c.Fecha >= ?';
        params = [fechaInicio.toISOString().split('T')[0]];
    }
    
    const sql = `
        SELECT 
            p.Id_Producto,
            p.Nombre as nombre_producto,
            COALESCE(SUM(o.CantidadVendida), 0) as cantidad_vendida,
            COALESCE(AVG(a.Precio_Compra), 0) as costo_unitario,
            COALESCE(SUM(o.CantidadVendida * a.Precio_Compra), 0) as costo_total
        FROM orden o
        INNER JOIN compra c ON o.NumFactura = c.Num_Factura
        INNER JOIN producto p ON o.Id_Producto = p.Id_Producto
        LEFT JOIN abastecimiento a ON p.Id_Producto = a.Id_Producto
        WHERE 1=1 ${whereCondition}
        GROUP BY p.Id_Producto, p.Nombre
        HAVING cantidad_vendida > 0
        ORDER BY costo_total DESC
    `;
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error en /api/financiero/costo-ventas:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const costoTotal = results.reduce((sum, r) => sum + (parseFloat(r.costo_total) || 0), 0);
        
        res.json({
            productos: results.map(r => ({
                id_producto: r.Id_Producto,
                nombre_producto: r.nombre_producto,
                cantidad_vendida: parseInt(r.cantidad_vendida),
                costo_unitario: parseFloat(r.costo_unitario) || 0,
                costo_total: parseFloat(r.costo_total) || 0
            })),
            costo_total: costoTotal
        });
    });
});

app.get('/api/financiero/gastos-operativos', (req, res) => {
    const { desde, hasta, anio, mes } = req.query;
    
    let fechaInicio, fechaFin;
    
    if (desde && hasta) {
        fechaInicio = desde;
        fechaFin = hasta;
    } else if (anio && mes) {
        fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
        fechaFin = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
    } else if (anio) {
        fechaInicio = `${anio}-01-01`;
        fechaFin = `${anio}-12-31`;
    } else {
        fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - 30);
        fechaInicio = fechaInicio.toISOString().split('T')[0];
        fechaFin = new Date().toISOString().split('T')[0];
    }
    
    const sqlSalarios = `
        SELECT COALESCE(SUM(Salario), 0) as total_salarios
        FROM trabajadores
        WHERE Activo = 1
    `;
    
    const sqlMermas = `
        SELECT COALESCE(SUM(m.Cantidad * p.Precio), 0) as total_mermas
        FROM merma m
        INNER JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
        INNER JOIN producto p ON m.Id_Producto = p.Id_Producto
        WHERE DATE(pd.Fecha) BETWEEN ? AND ?
    `;
    
    const sqlConsumos = `
        SELECT COALESCE(SUM(ci.Cantidad * p.Precio), 0) as total_consumos
        FROM consumo_interno ci
        INNER JOIN producto p ON ci.Id_Producto = p.Id_Producto
        WHERE DATE(ci.Fecha) BETWEEN ? AND ?
    `;
    
    Promise.all([
        db.promise().query(sqlSalarios),
        db.promise().query(sqlMermas, [fechaInicio, fechaFin]),
        db.promise().query(sqlConsumos, [fechaInicio, fechaFin])
    ]).then(([salarios, mermas, consumos]) => {
        const totalSalarios = parseFloat(salarios[0][0]?.total_salarios) || 0;
        const totalMermas = parseFloat(mermas[0][0]?.total_mermas) || 0;
        const totalConsumos = parseFloat(consumos[0][0]?.total_consumos) || 0;
        
        res.json({
            salarios: totalSalarios,
            mermas: totalMermas,
            consumos_internos: totalConsumos,
            otros_gastos: 0,
            total_gastos_operativos: totalSalarios + totalMermas + totalConsumos,
            detalle: {
                salarios_detalle: [{ concepto: "Salarios de trabajadores", monto: totalSalarios }],
                mermas_detalle: [{ concepto: "Mermas y perdidas", monto: totalMermas }],
                consumos_detalle: [{ concepto: "Consumo interno", monto: totalConsumos }]
            }
        });
    }).catch(err => {
        console.error('Error en /api/financiero/gastos-operativos:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/financiero/estado-resultados', async (req, res) => {
    const { desde, hasta, anio, mes } = req.query;
    
    try {
        const ventasPromise = new Promise((resolve, reject) => {
            let whereCondition = '';
            let params = [];
            
            if (desde && hasta) {
                whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
                params = [desde, hasta];
            } else if (anio && mes) {
                const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
                const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
                whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
                params = [primerDia, ultimoDia];
            } else if (anio) {
                whereCondition = 'WHERE YEAR(c.Fecha) = ?';
                params = [anio];
            } else {
                const fechaInicio = new Date();
                fechaInicio.setDate(fechaInicio.getDate() - 30);
                whereCondition = 'WHERE c.Fecha >= ?';
                params = [fechaInicio.toISOString().split('T')[0]];
            }
            
            db.query(`
                SELECT COALESCE(SUM(o.Subtotal), 0) as ventas_brutas
                FROM compra c
                INNER JOIN orden o ON c.Num_Factura = o.NumFactura
                ${whereCondition}
            `, params, (err, results) => {
                if (err) reject(err);
                else resolve(parseFloat(results[0]?.ventas_brutas) || 0);
            });
        });
        
        const costoPromise = new Promise((resolve, reject) => {
            let whereCondition = '';
            let params = [];
            
            if (desde && hasta) {
                whereCondition = 'AND DATE(c.Fecha) BETWEEN ? AND ?';
                params = [desde, hasta];
            } else if (anio && mes) {
                const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
                const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
                whereCondition = 'AND DATE(c.Fecha) BETWEEN ? AND ?';
                params = [primerDia, ultimoDia];
            } else if (anio) {
                whereCondition = 'AND YEAR(c.Fecha) = ?';
                params = [anio];
            } else {
                const fechaInicio = new Date();
                fechaInicio.setDate(fechaInicio.getDate() - 30);
                whereCondition = 'AND c.Fecha >= ?';
                params = [fechaInicio.toISOString().split('T')[0]];
            }
            
            db.query(`
                SELECT COALESCE(SUM(o.CantidadVendida * a.Precio_Compra), 0) as costo_ventas
                FROM orden o
                INNER JOIN compra c ON o.NumFactura = c.Num_Factura
                LEFT JOIN abastecimiento a ON o.Id_Producto = a.Id_Producto
                WHERE 1=1 ${whereCondition}
            `, params, (err, results) => {
                if (err) reject(err);
                else resolve(parseFloat(results[0]?.costo_ventas) || 0);
            });
        });
        
        let fechaInicio, fechaFin;
        if (desde && hasta) {
            fechaInicio = desde;
            fechaFin = hasta;
        } else if (anio && mes) {
            fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
            fechaFin = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
        } else if (anio) {
            fechaInicio = `${anio}-01-01`;
            fechaFin = `${anio}-12-31`;
        } else {
            fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            fechaInicio = fechaInicio.toISOString().split('T')[0];
            fechaFin = new Date().toISOString().split('T')[0];
        }
        
        const gastosPromise = new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    (SELECT COALESCE(SUM(Salario), 0) FROM trabajadores WHERE Activo = 1) as salarios,
                    (SELECT COALESCE(SUM(m.Cantidad * p.Precio), 0) FROM merma m 
                     INNER JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
                     INNER JOIN producto p ON m.Id_Producto = p.Id_Producto
                     WHERE DATE(pd.Fecha) BETWEEN ? AND ?) as mermas,
                    (SELECT COALESCE(SUM(ci.Cantidad * p.Precio), 0) FROM consumo_interno ci
                     INNER JOIN producto p ON ci.Id_Producto = p.Id_Producto
                     WHERE DATE(ci.Fecha) BETWEEN ? AND ?) as consumos
            `, [fechaInicio, fechaFin, fechaInicio, fechaFin], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        const [ventasBrutas, costoVentas, gastos] = await Promise.all([ventasPromise, costoPromise, gastosPromise]);
        
        const iva = ventasBrutas * 0.15;
        const ventasNetas = ventasBrutas - iva;
        const utilidadBruta = ventasNetas - costoVentas;
        const totalGastos = (parseFloat(gastos?.salarios) || 0) + (parseFloat(gastos?.mermas) || 0) + (parseFloat(gastos?.consumos) || 0);
        const utilidadNeta = utilidadBruta - totalGastos;
        const margenUtilidad = ventasNetas > 0 ? (utilidadNeta / ventasNetas) * 100 : 0;
        
        res.json({
            ingresos: {
                ventas_brutas: ventasBrutas,
                iva: iva,
                ventas_netas: ventasNetas
            },
            costos: {
                costo_ventas: costoVentas
            },
            utilidad_bruta: utilidadBruta,
            gastos_operativos: {
                salarios: parseFloat(gastos?.salarios) || 0,
                mermas: parseFloat(gastos?.mermas) || 0,
                consumos_internos: parseFloat(gastos?.consumos) || 0,
                total: totalGastos
            },
            utilidad_neta: utilidadNeta,
            margen_utilidad: margenUtilidad
        });
    } catch (err) {
        console.error('Error en /api/financiero/estado-resultados:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/financiero/iva-declarar', (req, res) => {
    const { desde, hasta, anio, mes } = req.query;
    
    let whereCondition = '';
    let params = [];
    
    if (desde && hasta) {
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [desde, hasta];
    } else if (anio && mes) {
        const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [primerDia, ultimoDia];
    } else if (anio) {
        whereCondition = 'WHERE YEAR(c.Fecha) = ?';
        params = [anio];
    } else {
        const fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - 30);
        whereCondition = 'WHERE c.Fecha >= ?';
        params = [fechaInicio.toISOString().split('T')[0]];
    }
    
    const sqlIVA = `
        SELECT COALESCE(SUM(o.Subtotal), 0) as ventas_brutas
        FROM compra c
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        ${whereCondition}
    `;
    
    db.query(sqlIVA, params, (err, results) => {
        if (err) {
            console.error('Error en /api/financiero/iva-declarar:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const ventasBrutas = parseFloat(results[0]?.ventas_brutas) || 0;
        const ivaCobrado = ventasBrutas * 0.15;
        
        const sqlCompras = `
            SELECT COALESCE(SUM(a.Precio_Compra * a.Cantidad_Entrada), 0) as total_compras
            FROM abastecimiento a
        `;
        
        db.query(sqlCompras, (err2, results2) => {
            const totalCompras = parseFloat(results2[0]?.total_compras) || 0;
            const ivaPagado = totalCompras * 0.15;
            const ivaPorDeclarar = ivaCobrado - ivaPagado;
            
            res.json({
                periodo: { desde: params[0], hasta: params[params.length - 1] },
                ventas_brutas: ventasBrutas,
                iva_cobrado: ivaCobrado,
                compras_totales: totalCompras,
                iva_pagado: ivaPagado,
                iva_por_declarar: ivaPorDeclarar > 0 ? ivaPorDeclarar : 0,
                iva_a_favor: ivaPorDeclarar < 0 ? Math.abs(ivaPorDeclarar) : 0
            });
        });
    });
});

app.get('/api/financiero/punto-equilibrio', (req, res) => {
    const sqlCostosFijos = `
        SELECT 
            (SELECT COALESCE(SUM(Salario), 0) FROM trabajadores WHERE Activo = 1) as salarios_mensuales,
            5000 as servicios_basicos,
            2000 as alquiler,
            1000 as otros_gastos_fijos
    `;
    
    const sqlMargenContribucion = `
        SELECT 
            AVG(p.Precio - COALESCE(a.Precio_Compra, p.Precio * 0.6)) as margen_promedio
        FROM producto p
        LEFT JOIN abastecimiento a ON p.Id_Producto = a.Id_Producto
        WHERE p.Precio > 0
    `;
    
    Promise.all([
        db.promise().query(sqlCostosFijos),
        db.promise().query(sqlMargenContribucion)
    ]).then(([costosFijos, margenContribucion]) => {
        const costosFijosMensuales = 
            (parseFloat(costosFijos[0][0]?.salarios_mensuales) || 0) +
            (parseFloat(costosFijos[0][0]?.servicios_basicos) || 0) +
            (parseFloat(costosFijos[0][0]?.alquiler) || 0) +
            (parseFloat(costosFijos[0][0]?.otros_gastos_fijos) || 0);
        
        const margenPromedio = parseFloat(margenContribucion[0][0]?.margen_promedio) || 150;
        const precioPromedioVenta = 400;
        const margenPorcentual = margenPromedio / precioPromedioVenta;
        
        const puntoEquilibrioUnidades = Math.ceil(costosFijosMensuales / margenPromedio);
        const puntoEquilibrioVentas = puntoEquilibrioUnidades * precioPromedioVenta;
        
        res.json({
            costos_fijos_mensuales: costosFijosMensuales,
            margen_contribucion_promedio: margenPromedio,
            precio_venta_promedio: precioPromedioVenta,
            punto_equilibrio_unidades: puntoEquilibrioUnidades,
            punto_equilibrio_ventas: puntoEquilibrioVentas,
            explicacion: `Necesitas vender aproximadamente ${puntoEquilibrioUnidades} unidades (C$${puntoEquilibrioVentas.toLocaleString()}) al mes para cubrir todos tus costos.`
        });
    }).catch(err => {
        console.error('Error en /api/financiero/punto-equilibrio:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/financiero/rentabilidad-productos', (req, res) => {
    const sql = `
        SELECT 
            p.Id_Producto,
            p.Nombre as nombre,
            COALESCE(cat.Nombre, 'Sin categoría') as categoria,
            p.Precio as precio_venta,
            COALESCE(a.Precio_Compra, p.Precio * 0.6) as costo_unitario,
            (p.Precio - COALESCE(a.Precio_Compra, p.Precio * 0.6)) as ganancia_unitaria,
            ROUND(((p.Precio - COALESCE(a.Precio_Compra, p.Precio * 0.6)) / p.Precio) * 100, 2) as margen_porcentaje,
            COALESCE(SUM(o.CantidadVendida), 0) as unidades_vendidas,
            COALESCE(SUM(o.CantidadVendida * (p.Precio - COALESCE(a.Precio_Compra, p.Precio * 0.6))), 0) as ganancia_total
        FROM producto p
        LEFT JOIN abastecimiento a ON p.Id_Producto = a.Id_Producto
        LEFT JOIN categoria cat ON p.Id_Categoria = cat.Id_Categoria
        LEFT JOIN orden o ON p.Id_Producto = o.Id_Producto
        LEFT JOIN compra c ON o.NumFactura = c.Num_Factura
        WHERE p.Precio > 0 AND p.Id_Estado = 1
        GROUP BY p.Id_Producto, p.Nombre, cat.Nombre, p.Precio, a.Precio_Compra
        ORDER BY ganancia_unitaria DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error en /api/financiero/rentabilidad-productos:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const productosConGanancia = results.filter(p => p.ganancia_unitaria > 0);
        const productosConPerdida = results.filter(p => p.ganancia_unitaria < 0);
        
        res.json({
            productos_mas_rentables: productosConGanancia.slice(0, 10),
            productos_menos_rentables: productosConPerdida.slice(0, 10),
            productos_con_perdida: productosConPerdida.length,
            total_productos_analizados: results.length
        });
    });
});

app.get('/api/financiero/comparativo-periodos', (req, res) => {
    const { anio } = req.query;
    const añoActual = parseInt(anio) || new Date().getFullYear();
    
    const sqlMensual = `
        SELECT 
            MONTH(c.Fecha) as mes,
            COALESCE(SUM(o.Subtotal), 0) as ingresos,
            COALESCE(SUM(o.CantidadVendida * a.Precio_Compra), 0) as egresos_costo
        FROM compra c
        INNER JOIN orden o ON c.Num_Factura = o.NumFactura
        LEFT JOIN abastecimiento a ON o.Id_Producto = a.Id_Producto
        WHERE YEAR(c.Fecha) = ?
        GROUP BY MONTH(c.Fecha)
        ORDER BY mes
    `;
    
    db.query(sqlMensual, [añoActual], (err, results) => {
        if (err) {
            console.error('Error en /api/financiero/comparativo-periodos:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const ingresosData = Array(12).fill(0);
        const egresosData = Array(12).fill(0);
        
        results.forEach(r => {
            ingresosData[r.mes - 1] = parseFloat(r.ingresos) || 0;
            egresosData[r.mes - 1] = parseFloat(r.egresos_costo) || 0;
        });
        
        const gastosOperativosMensuales = 20000;
        const egresosTotales = egresosData.map(e => e + gastosOperativosMensuales);
        
        res.json({
            anio: añoActual,
            meses: meses,
            ingresos: ingresosData,
            egresos: egresosTotales,
            utilidad: ingresosData.map((ing, idx) => ing - egresosTotales[idx])
        });
    });
});

app.get('/api/financiero/flujo-caja', (req, res) => {
    const { desde, hasta, anio, mes } = req.query;
    
    let whereCondition = '';
    let params = [];
    
    if (desde && hasta) {
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [desde, hasta];
    } else if (anio && mes) {
        const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [primerDia, ultimoDia];
    } else if (anio) {
        whereCondition = 'WHERE YEAR(c.Fecha) = ?';
        params = [anio];
    } else {
        const fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - 30);
        whereCondition = 'WHERE c.Fecha >= ?';
        params = [fechaInicio.toISOString().split('T')[0]];
    }
    
    const sqlEntradas = `
        SELECT 
            c.Fecha,
            c.Num_Factura,
            c.Monto as monto,
            mp.Nombre_Metodo as metodo_pago
        FROM compra c
        LEFT JOIN metododepago mp ON c.Id_Metodo = mp.Id_Metodo
        ${whereCondition}
        ORDER BY c.Fecha
    `;
    
    const sqlSalidas = `
        SELECT 
            pp.Fecha,
            pp.Monto,
            prov.Nombre as proveedor,
            mp.Nombre_Metodo as metodo_pago
        FROM pago_proveedor pp
        LEFT JOIN proveedores prov ON pp.Id_Proveedor = prov.Id_Proveedor
        LEFT JOIN metododepago mp ON pp.Id_Metodo = mp.Id_Metodo
        WHERE DATE(pp.Fecha) BETWEEN ? AND ?
        ORDER BY pp.Fecha
    `;
    
    Promise.all([
        db.promise().query(sqlEntradas, params),
        db.promise().query(sqlSalidas, [params[0] || '2020-01-01', params[params.length - 1] || '2025-12-31'])
    ]).then(([entradas, salidas]) => {
        const entradasList = entradas[0].map(e => ({
            fecha: e.Fecha,
            concepto: `Venta Factura #${e.Num_Factura}`,
            monto: parseFloat(e.monto) || 0,
            metodo: e.metodo_pago
        }));
        
        const salidasList = salidas[0].map(s => ({
            fecha: s.Fecha,
            concepto: `Pago a proveedor: ${s.proveedor}`,
            monto: parseFloat(s.Monto) || 0,
            metodo: s.metodo_pago
        }));
        
        const totalEntradas = entradasList.reduce((sum, e) => sum + e.monto, 0);
        const totalSalidas = salidasList.reduce((sum, s) => sum + s.monto, 0);
        const saldoNeto = totalEntradas - totalSalidas;
        
        let saldoAcumulado = 0;
        const movimientos = [];
        
        [...entradasList, ...salidasList].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).forEach(m => {
            if (m.concepto.includes('Venta')) {
                saldoAcumulado += m.monto;
            } else {
                saldoAcumulado -= m.monto;
            }
            movimientos.push({
                ...m,
                saldo_acumulado: saldoAcumulado
            });
        });
        
        res.json({
            periodo: {
                desde: params[0] || 'inicio',
                hasta: params[params.length - 1] || 'actual'
            },
            resumen: {
                total_entradas: totalEntradas,
                total_salidas: totalSalidas,
                saldo_neto: saldoNeto,
                saldo_final: saldoAcumulado
            },
            entradas: entradasList,
            salidas: salidasList,
            movimientos: movimientos
        });
    }).catch(err => {
        console.error('Error en /api/financiero/flujo-caja:', err);
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/financiero/gastos-categoria', (req, res) => {
    const { desde, hasta, anio, mes } = req.query;
    
    let fechaInicio, fechaFin;
    
    if (desde && hasta) {
        fechaInicio = desde;
        fechaFin = hasta;
    } else if (anio && mes) {
        fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
        fechaFin = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0];
    } else if (anio) {
        fechaInicio = `${anio}-01-01`;
        fechaFin = `${anio}-12-31`;
    } else {
        fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - 30);
        fechaInicio = fechaInicio.toISOString().split('T')[0];
        fechaFin = new Date().toISOString().split('T')[0];
    }
    
    const sqlGastos = `
        SELECT 
            'Salarios' as categoria,
            COALESCE(SUM(Salario), 0) as monto
        FROM trabajadores
        WHERE Activo = 1
        UNION ALL
        SELECT 
            'Compras (Inventario)' as categoria,
            COALESCE(SUM(a.Precio_Compra * a.Cantidad_Entrada), 0) as monto
        FROM abastecimiento a
        WHERE DATE(a.FechaEntrada) BETWEEN ? AND ?
        UNION ALL
        SELECT 
            'Mermas y Perdidas' as categoria,
            COALESCE(SUM(m.Cantidad * p.Precio), 0) as monto
        FROM merma m
        INNER JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
        INNER JOIN producto p ON m.Id_Producto = p.Id_Producto
        WHERE DATE(pd.Fecha) BETWEEN ? AND ?
        UNION ALL
        SELECT 
            'Consumo Interno' as categoria,
            COALESCE(SUM(ci.Cantidad * p.Precio), 0) as monto
        FROM consumo_interno ci
        INNER JOIN producto p ON ci.Id_Producto = p.Id_Producto
        WHERE DATE(ci.Fecha) BETWEEN ? AND ?
        UNION ALL
        SELECT 
            'Servicios Basicos' as categoria,
            5000 as monto
        UNION ALL
        SELECT 
            'Alquiler' as categoria,
            2000 as monto
        UNION ALL
        SELECT 
            'Otros Gastos' as categoria,
            1000 as monto
    `;
    
    db.query(sqlGastos, [fechaInicio, fechaFin, fechaInicio, fechaFin, fechaInicio, fechaFin], (err, results) => {
        if (err) {
            console.error('Error en /api/financiero/gastos-categoria:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const gastosPorCategoria = results.map(g => ({
            categoria: g.categoria,
            monto: parseFloat(g.monto) || 0
        }));
        
        const totalGastos = gastosPorCategoria.reduce((sum, g) => sum + g.monto, 0);
        
        res.json({
            periodo: { desde: fechaInicio, hasta: fechaFin },
            gastos_por_categoria: gastosPorCategoria,
            total_gastos: totalGastos
        });
    });
});

// ================= INICIO DEL SERVIDOR =================

setTimeout(() => {
    crearProcedimientosSiNoExisten();
    verificarEstructuraTabla();
}, 2000);

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     🖥️  CAJA LOCAL - SISTEMA CHEPITA 🖥️                   ║
    ╠══════════════════════════════════════════════════════════╣
    ║  📡 Puerto: ${PORT}                                          ║
    ║  🌐 URL: http://localhost:${PORT}                       ║
    ║  🗄️  Base de datos: RAILWAY (compartida)                  ║
    ║  ✅ Sincronización: ACTIVADA con la APP                   ║
    ║                                                           ║
    ║  📧 Sistema de emails activado                            ║
    ║  🔐 Autenticación de trabajadores activada                ║
    ║  🔐 Recuperación de contraseña por email activada         ║
    ║  🔒 5 intentos de login - Bloqueo 15 minutos              ║
    ║  📱 QR Vendedores: SISTEMA ACTIVADO ✅                     ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});