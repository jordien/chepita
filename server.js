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

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chepita7',
    port: 3306
});

db.connect(err => {
    if (err) return console.error('Error de conexion a XAMPP:', err.message);
    console.log('CAJA LOCAL - Conectada exitosamente a la base de datos XAMPP');
    
    crearTablaTokens();
    crearTablaRecuperacionTokens();
    agregarColumnasIntentos();
    crearTablaQRVendedores();
    agregarColumnaCajero();
    crearTablaPedidosPendientes();
    crearTablaPuntos();
    crearTablaMovimientos();
    agregarColumnasRegaliasProveedor();
    crearTablaAsistencia();
    crearTablaCompraPagoDetalle();
    crearTablaDevolucionProveedor();
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'isabelchepita678@gmail.com',
        pass: 'cazx kvss xagg zepm'
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('Error de conexion con Gmail:', error.message);
    } else {
        console.log('Conexion con Gmail establecida correctamente');
    }
});

const resetTokens = {};
const SECRET_KEY = 'chepita_secret_key_2025';

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'PAG.html'));
});

// =====================================================
// FUNCIONES DE CREACIÓN DE TABLAS
// =====================================================

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
        else console.log('Tabla trabajador_registro_tokens verificada');
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
        if (err) console.error('Error creando tabla de recuperacion:', err);
        else console.log('Tabla trabajador_recuperacion_tokens verificada');
    });
}

// ============================================================
// REQ-FR-22: Tabla de desglose de pagos mixtos
// ============================================================
function crearTablaCompraPagoDetalle() {
    const sql = `
        CREATE TABLE IF NOT EXISTS compra_pago_detalle (
            Id_Pago_Detalle INT AUTO_INCREMENT PRIMARY KEY,
            Num_Factura INT NOT NULL,
            Id_Metodo INT NOT NULL,
            Monto DECIMAL(10,2) NOT NULL,
            Referencia VARCHAR(100) DEFAULT NULL,
            Fecha_Registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (Num_Factura) REFERENCES compra(Num_Factura) ON DELETE CASCADE,
            FOREIGN KEY (Id_Metodo) REFERENCES metododepago(Id_Metodo)
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error('Error creando tabla compra_pago_detalle:', err);
        else console.log('Tabla compra_pago_detalle (REQ-FR-22) creada/verificada');
    });
}

// ============================================================
// Devoluciones/Rechazos a proveedores
// ============================================================
function crearTablaDevolucionProveedor() {
    const sql = `
        CREATE TABLE IF NOT EXISTS devolucion_proveedor (
            Id_Devolucion INT AUTO_INCREMENT PRIMARY KEY,
            Id_Proveedor INT NOT NULL,
            Id_Producto INT NOT NULL,
            Cantidad INT NOT NULL,
            Fecha DATE NOT NULL,
            Motivo ENUM('mal_estado','vencimiento','error_entrega','otro') NOT NULL,
            Descripcion VARCHAR(255) DEFAULT NULL,
            Id_Abastecimiento_Origen INT DEFAULT NULL,
            Id_Trabajador_Registro INT DEFAULT NULL,
            Estado ENUM('pendiente','enviado','reembolsado','reemplazado','cancelado') DEFAULT 'pendiente',
            Monto_Reclamado DECIMAL(10,2) DEFAULT 0.00,
            Notas_Resolucion VARCHAR(255) DEFAULT NULL,
            Fecha_Resolucion DATETIME DEFAULT NULL,
            Fecha_Registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (Id_Proveedor) REFERENCES proveedores(Id_Proveedor),
            FOREIGN KEY (Id_Producto) REFERENCES producto(Id_Producto)
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error('Error creando tabla devolucion_proveedor:', err);
        else console.log('✅ Tabla devolucion_proveedor creada/verificada');
    });
}

function agregarColumnasIntentos() {
    db.query(`SHOW COLUMNS FROM trabajadores LIKE 'intentos_fallidos'`, (err, results) => {
        if (err) {
            console.error('Error verificando columna intentos_fallidos:', err);
            return;
        }
        if (results.length === 0) {
            console.log('Agregando columna intentos_fallidos...');
            db.query(`ALTER TABLE trabajadores ADD COLUMN intentos_fallidos INT DEFAULT 0`, (err) => {
                if (err) console.error('Error agregando intentos_fallidos:', err);
                else console.log('Columna intentos_fallidos agregada');
            });
        }
    });
    
    db.query(`SHOW COLUMNS FROM trabajadores LIKE 'bloqueado_hasta'`, (err, results) => {
        if (err) {
            console.error('Error verificando columna bloqueado_hasta:', err);
            return;
        }
        if (results.length === 0) {
            console.log('Agregando columna bloqueado_hasta...');
            db.query(`ALTER TABLE trabajadores ADD COLUMN bloqueado_hasta DATETIME DEFAULT NULL`, (err) => {
                if (err) console.error('Error agregando bloqueado_hasta:', err);
                else console.log('Columna bloqueado_hasta agregada');
            });
        }
    });
}

function agregarColumnaCajero() {
    db.query(`SHOW COLUMNS FROM trabajadores LIKE 'es_cajero'`, (err, results) => {
        if (err) {
            console.error('Error verificando columna es_cajero:', err);
            return;
        }
        if (results.length === 0) {
            console.log('Agregando columna es_cajero...');
            db.query(`ALTER TABLE trabajadores ADD COLUMN es_cajero TINYINT DEFAULT 0`, (err) => {
                if (err) console.error('Error agregando es_cajero:', err);
                else console.log('Columna es_cajero agregada');
            });
        } else {
            console.log('Columna es_cajero ya existe');
        }
    });
}

function crearTablaPedidosPendientes() {
    const sql = `
        CREATE TABLE IF NOT EXISTS pedidos_pendientes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(50) NOT NULL UNIQUE,
            id_vendedor INT NOT NULL,
            nombre_vendedor VARCHAR(100),
            productos JSON NOT NULL,
            total DECIMAL(10,2) NOT NULL,
            estado ENUM('pendiente', 'en_proceso', 'completado', 'cancelado', 'expirado') DEFAULT 'pendiente',
            fecha_creacion DATETIME DEFAULT NOW(),
            fecha_procesado DATETIME,
            fecha_expiracion DATETIME,
            FOREIGN KEY (id_vendedor) REFERENCES trabajadores(Id_Trabajador)
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error('Error creando tabla pedidos_pendientes:', err);
        else console.log('Tabla pedidos_pendientes (Tickets) creada/verificada');
    });
}

function crearTablaPuntos() {
    db.query(`
        CREATE TABLE IF NOT EXISTS puntos_vendedores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_vendedor INT NOT NULL UNIQUE,
            total_puntos INT DEFAULT 0,
            fecha_actualizacion DATETIME DEFAULT NOW(),
            FOREIGN KEY (id_vendedor) REFERENCES trabajadores(Id_Trabajador)
        )
    `, (err) => {
        if (err) console.error('Error creando puntos_vendedores:', err);
        else console.log('Tabla puntos_vendedores creada/verificada');
    });

    db.query(`
        CREATE TABLE IF NOT EXISTS puntos_detalle (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_vendedor INT NOT NULL,
            puntos INT NOT NULL,
            motivo VARCHAR(255),
            fecha DATETIME DEFAULT NOW(),
            num_factura VARCHAR(50),
            ticket_codigo VARCHAR(50),
            FOREIGN KEY (id_vendedor) REFERENCES trabajadores(Id_Trabajador)
        )
    `, (err) => {
        if (err) console.error('Error creando puntos_detalle:', err);
        else console.log('Tabla puntos_detalle creada/verificada');
    });
}

function crearTablaMovimientos() {
    const sql = `
        CREATE TABLE IF NOT EXISTS movimientos_inventario (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_producto INT NOT NULL,
            tipo_movimiento ENUM('entrada', 'salida') NOT NULL,
            cantidad INT NOT NULL,
            fecha DATETIME DEFAULT NOW(),
            motivo VARCHAR(100),
            referencia VARCHAR(100),
            id_usuario INT,
            FOREIGN KEY (id_producto) REFERENCES producto(Id_Producto)
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error('Error creando tabla movimientos_inventario:', err);
        else console.log('Tabla movimientos_inventario creada/verificada');
    });
}

function crearTablaAsistencia() {
    const sql = `
        CREATE TABLE IF NOT EXISTS asistencia_registros (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_vendedor INT NOT NULL,
            fecha DATE NOT NULL,
            hora_entrada TIME,
            hora_salida TIME,
            estado VARCHAR(20) DEFAULT 'pendiente',
            FOREIGN KEY (id_vendedor) REFERENCES trabajadores(Id_Trabajador)
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error('Error creando asistencia_registros:', err);
        else console.log('Tabla asistencia_registros verificada');
    });
}

function registrarMovimiento(idProducto, tipo, cantidad, motivo, referencia, idUsuario = null) {
    const sql = `
        INSERT INTO movimientos_inventario 
        (id_producto, tipo_movimiento, cantidad, motivo, referencia, id_usuario, fecha)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    db.query(sql, [idProducto, tipo, cantidad, motivo, referencia, idUsuario], (err, result) => {
        if (err) {
            console.error('Error registrando movimiento:', err);
        } else {
            console.log(`Movimiento: ${tipo.toUpperCase()} | Producto #${idProducto} | Cant: ${cantidad} | Motivo: ${motivo}`);
        }
    });
}

function agregarColumnasRegaliasProveedor() {
    db.query(`SHOW COLUMNS FROM regalia LIKE 'Id_Proveedor'`, (err, results) => {
        if (err) {
            console.error('Error verificando columna Id_Proveedor en regalia:', err);
            return;
        }
        if (results.length === 0) {
            console.log('Agregando columna Id_Proveedor a regalia...');
            db.query(`ALTER TABLE regalia ADD COLUMN Id_Proveedor INT NULL, ADD FOREIGN KEY (Id_Proveedor) REFERENCES proveedores(Id_Proveedor)`, (err) => {
                if (err) console.error('Error agregando Id_Proveedor:', err);
                else console.log('Columna Id_Proveedor agregada a regalia');
            });
        } else {
            console.log('Columna Id_Proveedor ya existe en regalia');
        }
    });
    
    db.query(`SHOW COLUMNS FROM regalia LIKE 'Activa'`, (err, results) => {
        if (err) return;
        if (results.length === 0) {
            console.log('Agregando columna Activa a regalia...');
            db.query(`ALTER TABLE regalia ADD COLUMN Activa TINYINT(1) DEFAULT 1`, (err) => {
                if (err) console.error('Error agregando Activa:', err);
                else console.log('Columna Activa agregada a regalia');
            });
        }
    });
    
    db.query(`SHOW COLUMNS FROM premio LIKE 'Condicion'`, (err, results) => {
        if (err) return;
        if (results.length === 0) {
            console.log('Agregando columna Condicion a premio...');
            db.query(`ALTER TABLE premio ADD COLUMN Condicion VARCHAR(255) DEFAULT NULL`, (err) => {
                if (err) console.error('Error agregando Condicion:', err);
                else console.log('Columna Condicion agregada a premio');
            });
        }
    });
}

// =====================================================
// AUTENTICACIÓN - TRABAJADORES
// =====================================================

app.post('/api/trabajadores/login', async (req, res) => {
    const { nombre_usuario, password } = req.body;
    
    const sql = `SELECT * FROM trabajadores WHERE (nombre_usuario = ? OR email = ? OR NombreCompleto = ?) AND Activo = 1 AND es_cajero = 1`;
    
    db.query(sql, [nombre_usuario, nombre_usuario, nombre_usuario], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            db.query(`SELECT es_cajero, Activo FROM trabajadores WHERE (nombre_usuario = ? OR email = ? OR NombreCompleto = ?)`, 
                [nombre_usuario, nombre_usuario, nombre_usuario], (err2, checkResults) => {
                if (err2) return res.status(500).json({ error: err2.sqlMessage });
                if (checkResults.length > 0) {
                    const user = checkResults[0];
                    if (user.Activo === 0) {
                        return res.status(401).json({ success: false, message: "Usuario inactivo. Contacte al administrador." });
                    }
                    if (user.es_cajero === 0) {
                        return res.status(401).json({ success: false, message: "Este usuario no tiene permisos de cajero. Contacte al administrador." });
                    }
                }
                return res.status(401).json({ success: false, message: "Usuario o contrasena incorrectos" });
            });
            return;
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
            console.log(`Login MD5 exitoso para: ${trabajador.NombreCompleto}`);
        }
        
        if (!passwordValida && trabajador.password_hash && trabajador.password_hash.startsWith('$2b$')) {
            try {
                passwordValida = await bcrypt.compare(password, trabajador.password_hash);
                if (passwordValida) console.log(`Login bcrypt exitoso para: ${trabajador.NombreCompleto}`);
            } catch(e) { 
                passwordValida = false; 
            }
        }
        
        if (!passwordValida && password === '1234') {
            passwordValida = true;
            console.log(`Login con contrasena temporal 1234 para: ${trabajador.NombreCompleto}`);
        }
        
        if (passwordValida) {
            db.query(`UPDATE trabajadores SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE Id_Trabajador = ?`, 
                [trabajador.Id_Trabajador]);
            
            const token = jwt.sign(
                { id: trabajador.Id_Trabajador, nombre: trabajador.NombreCompleto, rol: 'trabajador', es_cajero: 1 },
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
                    usuario: trabajador.nombre_usuario,
                    es_cajero: 1
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
                message: `Contrasena incorrecta. Le quedan ${intentosRestantes} intento${intentosRestantes !== 1 ? 's' : ''}.` 
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
        return res.status(400).json({ success: false, message: "La contrasena debe tener al menos 4 caracteres" });
    }
    
    const hashedPassword = await bcrypt.hash(nueva_password, 10);
    
    const sql = `UPDATE trabajadores SET password_hash = ?, debe_cambiar_password = 0 WHERE Id_Trabajador = ?`;
    db.query(sql, [hashedPassword, id_trabajador], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Error al actualizar contrasena" });
        res.json({ success: true, message: "Contrasena actualizada correctamente" });
    });
});

app.post('/api/trabajadores', async (req, res) => {
    const { NombreCompleto, Celular, Salario, Activo, email } = req.body;
    
    if (!NombreCompleto || NombreCompleto.trim() === '') {
        return res.status(400).json({ error: 'El nombre completo es requerido' });
    }
    if (!Celular || Celular.trim() === '') {
        return res.status(400).json({ error: 'El numero de celular es requerido' });
    }
    if (!email || email.trim() === '') {
        return res.status(400).json({ error: 'El correo electronico es requerido' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Formato de correo electronico invalido' });
    }
    
    db.query(`SELECT * FROM trabajadores WHERE email = ?`, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length > 0) {
            return res.status(400).json({ error: 'Ya existe un trabajador con ese correo electronico' });
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
            
            const sql = `INSERT INTO trabajadores (NombreCompleto, Celular, Salario, Activo, email, nombre_usuario, password_hash, debe_cambiar_password, es_cajero) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`;
            
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
                    subject: 'Bienvenido a Chepita - Configura tu cuenta',
                    html: `
                        <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px; max-width: 500px; margin: 0 auto;">
                            <h2 style="color: #A63C89;">Bienvenido a Chepita, ${NombreCompleto}</h2>
                            <p>Has sido registrado en nuestro sistema de gestion.</p>
                            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                <p><strong>Tu correo:</strong> ${email}</p>
                                <p><strong>Tu usuario:</strong> ${usuarioFinal}</p>
                                <p><strong>Contrasena temporal:</strong> 1234</p>
                            </div>
                            <div style="text-align: center; margin: 25px 0;">
                                <a href="${registroLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Configurar mi cuenta</a>
                            </div>
                            <p style="color: #666; font-size: 12px;">Este enlace es valido por 48 horas.</p>
                            <hr>
                            <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestion Comercial</p>
                        </div>
                    `
                };
                
                console.log(`Intentando enviar email de bienvenida a: ${email}`);
                
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error al enviar email de bienvenida:', error.message);
                        return res.json({ 
                            message: "Trabajador agregado exitosamente. No se pudo enviar el email, pero puede iniciar con la contrasena temporal 1234.", 
                            Id_Trabajador: idTrabajador,
                            email_enviado: false,
                            error: error.message
                        });
                    }
                    console.log(`Email de bienvenida enviado exitosamente a: ${email}`);
                    res.json({ 
                        message: "Trabajador agregado exitosamente. Se ha enviado un email para configurar su contrasena.", 
                        Id_Trabajador: idTrabajador,
                        email_enviado: true
                    });
                });
            });
        });
    });
});

app.post('/api/test-email', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email requerido' });
    }
    
    const mailOptions = {
        from: 'Tienda Chepita <isabelchepita678@gmail.com>',
        to: email,
        subject: 'Prueba de correo - Chepita',
        html: `
            <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                <h2 style="color: #A63C89;">Prueba de correo exitosa</h2>
                <p>El sistema de correos de Chepita esta funcionando correctamente.</p>
                <p>Este es un mensaje de prueba para verificar que los emails se estan enviando.</p>
                <hr>
                <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestion Comercial</p>
            </div>
        `
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error test email:', error.message);
            return res.status(500).json({ 
                success: false, 
                message: 'Error al enviar email: ' + error.message
            });
        }
        console.log('Test email enviado a:', email);
        res.json({ 
            success: true, 
            message: 'Email de prueba enviado a ' + email,
            messageId: info.messageId
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
        return res.status(400).json({ success: false, message: "La contrasena debe tener al menos 4 caracteres" });
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
            if (err) return res.status(500).json({ success: false, message: "Error en transaccion" });
            
            db.query(`UPDATE trabajadores SET password_hash = ?, debe_cambiar_password = 0 WHERE Id_Trabajador = ?`,
                [hashedPassword, idTrabajador], (err) => {
                if (err) {
                    return db.rollback(() => res.status(500).json({ success: false, message: "Error actualizando contrasena" }));
                }
                
                db.query(`UPDATE trabajador_registro_tokens SET usado = 1 WHERE token = ?`, [token], (err) => {
                    if (err) {
                        return db.rollback(() => res.status(500).json({ success: false, message: "Error actualizando token" }));
                    }
                    
                    db.commit((err) => {
                        if (err) return res.status(500).json({ success: false, message: "Error completando registro" });
                        res.json({ success: true, message: "Contrasena configurada correctamente. Ya puedes iniciar sesion." });
                    });
                });
            });
        });
    });
});

app.put('/api/trabajadores/:id', (req, res) => {
    const { id } = req.params;
    const { NombreCompleto, Celular, Salario, Activo, email, es_cajero } = req.body;
    
    let campos = [];
    let valores = [];
    
    if (NombreCompleto !== undefined) {
        campos.push('NombreCompleto = ?');
        valores.push(NombreCompleto);
    }
    if (Celular !== undefined) {
        campos.push('Celular = ?');
        valores.push(Celular);
    }
    if (Salario !== undefined) {
        campos.push('Salario = ?');
        valores.push(Salario);
    }
    if (Activo !== undefined) {
        campos.push('Activo = ?');
        valores.push(Activo);
    }
    if (email !== undefined) {
        campos.push('email = ?');
        valores.push(email);
    }
    if (es_cajero !== undefined) {
        campos.push('es_cajero = ?');
        valores.push(es_cajero);
    }
    
    if (campos.length === 0) {
        return res.status(400).json({ error: "No hay campos para actualizar" });
    }
    
    valores.push(id);
    const sql = `UPDATE trabajadores SET ${campos.join(', ')} WHERE Id_Trabajador = ?`;
    
    db.query(sql, valores, (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Trabajador no encontrado" });
        res.json({ message: "Trabajador actualizado" });
    });
});

app.get('/api/trabajadores', (req, res) => {
    db.query(`SELECT Id_Trabajador, NombreCompleto, Celular, Salario, Activo, email, nombre_usuario, debe_cambiar_password, es_cajero FROM trabajadores ORDER BY NombreCompleto`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.get('/api/trabajadores/activos', (req, res) => {
    db.query(`SELECT Id_Trabajador, NombreCompleto, Celular, nombre_usuario, es_cajero FROM trabajadores WHERE Activo = 1 ORDER BY NombreCompleto`, (err, results) => {
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
            res.json({ success: false, message: 'Codigo incorrecto o trabajador inactivo' });
        }
    });
});

app.delete('/api/trabajadores/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`DELETE FROM trabajador_registro_tokens WHERE id_trabajador = ?`, [id], (err) => {
        if (err) console.error('Error eliminando tokens:', err);
        
        db.query(`DELETE FROM trabajador_recuperacion_tokens WHERE id_trabajador = ?`, [id], (err) => {
            if (err) console.error('Error eliminando tokens de recuperacion:', err);
            
            db.query(`DELETE FROM trabajadores WHERE Id_Trabajador = ?`, [id], (err, result) => {
                if (err) {
                    console.error('Error eliminando trabajador:', err);
                    return res.status(500).json({ error: err.sqlMessage });
                }
                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: "Trabajador no encontrado" });
                }
                console.log(`Trabajador ${id} eliminado fisicamente`);
                res.json({ message: "Trabajador eliminado correctamente" });
            });
        });
    });
});

app.post('/api/trabajadores/cambiar-cajero', (req, res) => {
    const { id_trabajador } = req.body;
    
    if (!id_trabajador) {
        return res.status(400).json({ error: "ID de trabajador requerido" });
    }
    
    db.query(`SELECT Id_Trabajador, NombreCompleto, Activo FROM trabajadores WHERE Id_Trabajador = ?`, [id_trabajador], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.status(404).json({ error: "Trabajador no encontrado" });
        }
        if (results[0].Activo === 0) {
            return res.status(400).json({ error: "El trabajador esta inactivo. Activelo primero." });
        }
        
        db.query(`UPDATE trabajadores SET es_cajero = 0 WHERE es_cajero = 1`, (err2) => {
            if (err2) return res.status(500).json({ error: err2.sqlMessage });
            
            db.query(`UPDATE trabajadores SET es_cajero = 1 WHERE Id_Trabajador = ?`, [id_trabajador], (err3, result) => {
                if (err3) return res.status(500).json({ error: err3.sqlMessage });
                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: "Trabajador no encontrado o inactivo" });
                }
                
                db.query(`SELECT NombreCompleto FROM trabajadores WHERE Id_Trabajador = ?`, [id_trabajador], (err4, results2) => {
                    if (err4) return res.status(500).json({ error: err4.sqlMessage });
                    res.json({ 
                        success: true, 
                        message: `Cajero actualizado correctamente`,
                        cajero: results2[0]?.NombreCompleto || 'Desconocido'
                    });
                });
            });
        });
    });
});

app.get('/api/trabajadores/cajero-actual', (req, res) => {
    db.query(`SELECT Id_Trabajador, NombreCompleto, email, Celular FROM trabajadores WHERE es_cajero = 1 AND Activo = 1`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.json({ existe: false, message: "No hay ningun cajero asignado" });
        }
        res.json({ 
            existe: true, 
            id: results[0].Id_Trabajador, 
            nombre: results[0].NombreCompleto,
            email: results[0].email,
            celular: results[0].Celular
        });
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
            return res.status(403).json({ autenticado: false, message: "Token invalido o expirado" });
        }
        req.usuario = decoded;
        next();
    });
}

app.get('/api/verificar-sesion-trabajador', verificarTokenTrabajador, (req, res) => {
    res.json({ autenticado: true, usuario: req.usuario });
});

// =====================================================
// LOGIN ADMIN
// =====================================================
app.post('/api/admin/login', async (req, res) => {
    const { usuario, password } = req.body;
    
    db.query(`SELECT * FROM usuarios_admin WHERE usuario = ?`, [usuario], async (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Usuario o contrasena incorrectos" });
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
                console.log(`Contrasena de ${admin.usuario} migrada a bcrypt`);
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
                message: `Contrasena incorrecta. Le quedan ${intentosRestantes} intento(s).` 
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
            return res.json({ success: false, message: "Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena." });
        }

        const { usuario } = results[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 3600000;

        resetTokens[token] = { email, expiresAt };
        const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;

        const mailOptions = {
            from: 'Tienda Chepita <isabelchepita678@gmail.com>',
            to: email,
            subject: 'Recuperacion de Contrasena - Tienda Chepita',
            html: `
                <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #A63C89;">Recuperacion de Contrasena</h2>
                    <p>Hola <strong>${usuario}</strong>,</p>
                    <p>Hemos recibido una solicitud para restablecer tu contrasena. Para crear una nueva, haz clic en el siguiente boton:</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Restablecer Contrasena</a>
                    </div>
                    <p style="color: #666; font-size: 12px;">Este enlace es valido por 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.</p>
                    <hr>
                    <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestion Comercial</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error al enviar email:", error);
                return res.status(500).json({ error: "No se pudo enviar el correo." });
            }
            res.json({ success: true, message: "Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena." });
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
        return res.status(400).json({ success: false, message: "La nueva contrasena debe tener al menos 8 caracteres." });
    }

    const tokenData = resetTokens[token];
    if (!tokenData || Date.now() > tokenData.expiresAt) {
        return res.status(400).json({ success: false, message: "El enlace ha expirado o es invalido." });
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
        console.log(`Contrasena actualizada para: ${email}`);
        res.json({ success: true, message: "Contrasena actualizada correctamente. Ya puedes iniciar sesion." });
    });
});

app.post('/api/admin/cambiar-password', async (req, res) => {
    const { usuario, passwordActual, nuevaPassword } = req.body;
    
    if (!nuevaPassword || nuevaPassword.length < 8) {
        return res.status(400).json({ success: false, message: "La contrasena debe tener al menos 8 caracteres" });
    }
    if (!/[A-Z]/.test(nuevaPassword)) {
        return res.status(400).json({ success: false, message: "La contrasena debe contener al menos una mayuscula" });
    }
    if (!/[0-9]/.test(nuevaPassword)) {
        return res.status(400).json({ success: false, message: "La contrasena debe contener al menos un numero" });
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
            return res.status(401).json({ success: false, message: "Contrasena actual incorrecta" });
        }
        
        let esIgual = false;
        if (admin.password && admin.password.startsWith('$2b$')) {
            esIgual = await bcrypt.compare(nuevaPassword, admin.password);
        } else {
            const md5pass = crypto.createHash('md5').update(nuevaPassword).digest('hex');
            esIgual = (admin.password === md5pass);
        }
        
        if (esIgual) {
            return res.status(400).json({ success: false, message: "La nueva contrasena no puede ser igual a la anterior" });
        }
        
        const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
        
        db.query(`UPDATE usuarios_admin SET password = ? WHERE usuario = ?`, [hashedPassword, usuario], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "Error al actualizar" });
            res.json({ success: true, message: "Contrasena actualizada correctamente" });
        });
    });
});

// =====================================================
// CATEGORÍAS
// =====================================================
app.get('/api/categorias', (req, res) => {
    console.log('PROCEDIMIENTO sp_listar_categorias - Ejecutando consulta...');
    db.query(`CALL sp_listar_categorias()`, (err, results) => {
        if (err) {
            console.error('Error en sp_listar_categorias:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        const categorias = results[0];
        console.log(`sp_listar_categorias - ${categorias.length} categorias encontradas`);
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

// =====================================================
// PRODUCTOS
// =====================================================
app.get('/api/productos', (req, res) => {
    const sql = `
        SELECT 
            p.Id_Producto, 
            p.Nombre, 
            p.Precio, 
            p.Marca,
            COALESCE(c.Nombre, 'Sin Categoria') AS Nombre_Categoria, 
            COALESCE(e.Nombre_Estado, 'Disponible') AS Nombre_Estado,
            COALESCE(SUM(s.Cantidad), 0) AS Stock,
            COALESCE(prov.Nombre, 'Sin asignar') AS Proveedor
        FROM producto p
        LEFT JOIN categoria c ON p.Id_Categoria = c.Id_Categoria
        LEFT JOIN estado e ON p.Id_Estado = e.Id_Estado
        LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto
        LEFT JOIN abastecimiento a ON p.Id_Producto = a.Id_Producto
        LEFT JOIN proveedores prov ON a.Id_Proveedor = prov.Id_Proveedor
        GROUP BY p.Id_Producto, p.Nombre, p.Precio, p.Marca, c.Nombre, e.Nombre_Estado, prov.Nombre
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
        
        console.log(`Productos enviados: ${resultadosLimpios.length}`);
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
    
    const nombreLimpio = Nombre.trim();
    const marcaLimpia = (Marca || '').trim();

    const sqlDuplicado = `
        SELECT Id_Producto, Nombre, Marca 
        FROM producto 
        WHERE LOWER(TRIM(Nombre)) = LOWER(?) 
          AND LOWER(TRIM(COALESCE(Marca, ''))) = LOWER(?)
    `;
    
    db.query(sqlDuplicado, [nombreLimpio, marcaLimpia], (errDup, dupResults) => {
        if (errDup) return res.status(500).json({ error: errDup.sqlMessage });
        
        if (dupResults.length > 0) {
            const dup = dupResults[0];
            return res.status(400).json({ 
                error: `Ya existe un producto con el nombre "${dup.Nombre}"${dup.Marca ? ` y marca "${dup.Marca}"` : ''} (ID #${dup.Id_Producto}). No se permiten duplicados.` 
            });
        }
        
        db.query(`SELECT Id_Proveedor FROM proveedores WHERE Id_Proveedor = ?`, [Id_Proveedor], (err, provResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            if (provResults.length === 0) {
                return res.status(400).json({ error: 'El proveedor seleccionado no existe en la base de datos' });
            }
            
            const sqlProd = `INSERT INTO producto (Nombre, Precio, Marca, Id_Categoria, Id_Estado) VALUES (?, ?, ?, ?, 1)`;
            
            db.query(sqlProd, [nombreLimpio, Precio, marcaLimpia || null, Id_Categoria || null], (err, result) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                const idProducto = result.insertId;

                const sqlStock = `INSERT INTO stock (Id_Inventario, Id_Producto, Cantidad, FechaEntrada) VALUES (1, ?, ?, CURDATE())`;
                db.query(sqlStock, [idProducto, Stock], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.sqlMessage });
                    
                    registrarMovimiento(idProducto, 'entrada', Stock, 'Producto nuevo', 'Alta inicial');
                    
                    const sqlAbast = `INSERT INTO abastecimiento (Id_Producto, Id_Proveedor, Precio_Compra, FechaEntrada, Cantidad_Entrada) VALUES (?, ?, ?, CURDATE(), ?)`;
                    db.query(sqlAbast, [idProducto, Id_Proveedor, Precio, Stock], (err3) => {
                        if (err3) return res.status(500).json({ error: err3.sqlMessage });
                        res.json({ message: "Producto agregado", Id_Producto: idProducto });
                    });
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
    
    const nombreLimpio = Nombre.trim();
    const marcaLimpia = (Marca || '').trim();
    
    const sqlDuplicado = `
        SELECT Id_Producto, Nombre, Marca 
        FROM producto 
        WHERE LOWER(TRIM(Nombre)) = LOWER(?) 
          AND LOWER(TRIM(COALESCE(Marca, ''))) = LOWER(?)
          AND Id_Producto != ?
    `;
    
    db.query(sqlDuplicado, [nombreLimpio, marcaLimpia, id], (errDup, dupResults) => {
        if (errDup) return res.status(500).json({ error: errDup.sqlMessage });
        
        if (dupResults.length > 0) {
            const dup = dupResults[0];
            return res.status(400).json({ 
                error: `Ya existe otro producto con el nombre "${dup.Nombre}"${dup.Marca ? ` y marca "${dup.Marca}"` : ''} (ID #${dup.Id_Producto}). No se permiten duplicados.` 
            });
        }
        
        const sql = `UPDATE producto SET Nombre = ?, Precio = ?, Marca = ?, Id_Estado = ? WHERE Id_Producto = ?`;
        db.query(sql, [nombreLimpio, Precio, marcaLimpia || null, Id_Estado, id], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            res.json({ message: "Producto actualizado correctamente" });
        });
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
            const stockAnterior = results[0].Cantidad;
            const diferencia = stock - stockAnterior;
            
            db.query(`UPDATE stock SET Cantidad = ?, FechaEntrada = CURDATE() WHERE Id_Producto = ?`, [stock, id], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                if (diferencia !== 0) {
                    registrarMovimiento(
                        id, 
                        diferencia > 0 ? 'entrada' : 'salida', 
                        Math.abs(diferencia), 
                        'Ajuste manual', 
                        'Edicion de producto'
                    );
                }
                
                res.json({ message: "Stock actualizado", stock: stock });
            });
        } else {
            db.query(`INSERT INTO stock (Id_Inventario, Id_Producto, Cantidad, FechaEntrada) VALUES (1, ?, ?, CURDATE())`, [id, stock], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                
                registrarMovimiento(id, 'entrada', stock, 'Ajuste manual', 'Creacion de stock');
                
                res.json({ message: "Registro de stock creado", stock: stock });
            });
        }
    });
});

app.delete('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const tablasRelacionadas = ['orden', 'stock', 'abastecimiento', 'consumo_interno', 'merma', 'premio', 'movimientos_inventario'];
    
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
    console.log('PROCEDIMIENTO sp_productos_bajo_stock - Ejecutando consulta...');
    db.query(`CALL sp_productos_bajo_stock()`, (err, results) => {
        if (err) {
            console.error('Error en sp_productos_bajo_stock:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        const productos = results[0];
        console.log(`sp_productos_bajo_stock - ${productos.length} productos con bajo stock`);
        res.json(productos);
    });
});

// =====================================================
// MOVIMIENTOS
// =====================================================
app.get('/api/movimientos', (req, res) => {
    const { id_producto, tipo, desde, hasta, limite } = req.query;
    
    let whereCondition = 'WHERE 1=1';
    let params = [];
    
    if (id_producto) {
        whereCondition += ' AND m.id_producto = ?';
        params.push(id_producto);
    }
    if (tipo && (tipo === 'entrada' || tipo === 'salida')) {
        whereCondition += ' AND m.tipo_movimiento = ?';
        params.push(tipo);
    }
    if (desde) {
        whereCondition += ' AND DATE(m.fecha) >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND DATE(m.fecha) <= ?';
        params.push(hasta);
    }
    
    const limiteFinal = parseInt(limite) || 500;
    
    const sql = `
        SELECT 
            m.id,
            m.id_producto,
            p.Nombre AS nombre_producto,
            m.tipo_movimiento,
            m.cantidad,
            m.fecha,
            m.motivo,
            m.referencia,
            m.id_usuario,
            t.NombreCompleto AS nombre_usuario
        FROM movimientos_inventario m
        LEFT JOIN producto p ON m.id_producto = p.Id_Producto
        LEFT JOIN trabajadores t ON m.id_usuario = t.Id_Trabajador
        ${whereCondition}
        ORDER BY m.fecha DESC, m.id DESC
        LIMIT ?
    `;
    
    db.query(sql, [...params, limiteFinal], (err, results) => {
        if (err) {
            console.error('Error en /api/movimientos:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json(results);
    });
});

app.get('/api/movimientos/producto/:id', (req, res) => {
    const { id } = req.params;
    
    const sql = `
        SELECT 
            m.id,
            m.tipo_movimiento,
            m.cantidad,
            m.fecha,
            m.motivo,
            m.referencia,
            p.Nombre AS nombre_producto,
            t.NombreCompleto AS nombre_usuario
        FROM movimientos_inventario m
        LEFT JOIN producto p ON m.id_producto = p.Id_Producto
        LEFT JOIN trabajadores t ON m.id_usuario = t.Id_Trabajador
        WHERE m.id_producto = ?
        ORDER BY m.fecha DESC, m.id DESC
    `;
    
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.get('/api/movimientos/resumen', (req, res) => {
    const sql = `
        SELECT 
            p.Id_Producto,
            p.Nombre AS nombre_producto,
            COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'entrada' THEN m.cantidad ELSE 0 END), 0) AS total_entradas,
            COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'salida' THEN m.cantidad ELSE 0 END), 0) AS total_salidas,
            COUNT(m.id) AS total_movimientos
        FROM producto p
        LEFT JOIN movimientos_inventario m ON p.Id_Producto = m.id_producto
        GROUP BY p.Id_Producto, p.Nombre
        ORDER BY p.Nombre
    `;
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// =====================================================
// PROVEEDORES
// =====================================================
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
        return res.status(400).json({ error: 'El numero de telefono es requerido' });
    }
    
    db.query(`SELECT * FROM proveedores WHERE Num_celular = ?`, [Num_celular], (err, results) => {
        if (err) {
            console.error('Error verificando duplicado:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        if (results.length > 0) {
            return res.status(400).json({ error: 'Ya existe un proveedor con ese numero de telefono' });
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
        return res.status(400).json({ error: 'El numero de telefono es requerido' });
    }
    
    db.query(`SELECT * FROM proveedores WHERE Num_celular = ? AND Id_Proveedor != ?`, [Num_celular, id], (err, results) => {
        if (err) {
            console.error('Error verificando duplicado:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        if (results.length > 0) {
            return res.status(400).json({ error: 'Ya existe otro proveedor con ese numero de telefono' });
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
    
    db.query(`DELETE FROM abastecimiento WHERE Id_Proveedor = ?`, [id], (err) => {
        if (err) {
            console.error('Error eliminando dependencias de abastecimiento:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        
        db.query(`DELETE FROM proveedores WHERE Id_Proveedor = ?`, [id], (err, result) => {
            if (err) {
                console.error('Error eliminando proveedor:', err);
                return res.status(500).json({ error: err.sqlMessage });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Proveedor no encontrado" });
            }
            console.log(`DELETE /api/proveedores/${id} - Proveedor eliminado con sus dependencias`);
            res.json({ message: "Proveedor eliminado correctamente" });
        });
    });
});

// ============================================================
// DEVOLUCIONES / RECHAZOS A PROVEEDORES
// ============================================================

// 1. Registrar nueva devolución
app.post('/api/devoluciones-proveedor', (req, res) => {
    const {
        Id_Proveedor,
        Id_Producto,
        Cantidad,
        Fecha,
        Motivo,
        Descripcion,
        Id_Trabajador_Registro,
        Monto_Reclamado
    } = req.body;

    if (!Id_Proveedor) return res.status(400).json({ error: 'El proveedor es requerido' });
    if (!Id_Producto) return res.status(400).json({ error: 'El producto es requerido' });
    if (!Cantidad || isNaN(Cantidad) || parseInt(Cantidad) < 1)
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    if (!Fecha) return res.status(400).json({ error: 'La fecha es requerida' });

    const motivosValidos = ['mal_estado', 'vencimiento', 'error_entrega', 'otro'];
    if (!Motivo || !motivosValidos.includes(Motivo))
        return res.status(400).json({ error: 'Motivo inválido' });

    const cantidadNum = parseInt(Cantidad);
    const montoReclamado = parseFloat(Monto_Reclamado) || 0;

    db.query(
        `SELECT Id_Proveedor, Nombre, Empresa FROM proveedores WHERE Id_Proveedor = ?`,
        [Id_Proveedor],
        (err, provResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            if (provResults.length === 0)
                return res.status(400).json({ error: 'El proveedor no existe' });

            db.query(`
                SELECT p.Id_Producto, p.Nombre, p.Precio, COALESCE(SUM(s.Cantidad), 0) AS Stock_Total
                FROM producto p
                LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto
                WHERE p.Id_Producto = ?
                GROUP BY p.Id_Producto
            `, [Id_Producto], (err2, prodResults) => {
                if (err2) return res.status(500).json({ error: err2.sqlMessage });
                if (prodResults.length === 0)
                    return res.status(400).json({ error: 'El producto no existe' });

                const producto = prodResults[0];
                const stockActual = parseInt(producto.Stock_Total) || 0;

                if (stockActual < cantidadNum) {
                    return res.status(400).json({
                        error: `Stock insuficiente. Actual: ${stockActual}, solicitado: ${cantidadNum}`
                    });
                }

                db.beginTransaction((errTx) => {
                    if (errTx) return res.status(500).json({ error: 'Error iniciando transacción' });

                    const sqlInsert = `
                        INSERT INTO devolucion_proveedor
                        (Id_Proveedor, Id_Producto, Cantidad, Fecha, Motivo, Descripcion,
                         Id_Trabajador_Registro, Estado, Monto_Reclamado)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)
                    `;

                    db.query(sqlInsert, [
                        Id_Proveedor, Id_Producto, cantidadNum, Fecha, Motivo,
                        Descripcion || null, Id_Trabajador_Registro || null, montoReclamado
                    ], (errIns, resultIns) => {
                        if (errIns) return db.rollback(() =>
                            res.status(500).json({ error: 'Error guardando devolución: ' + errIns.sqlMessage })
                        );

                        const idDevolucion = resultIns.insertId;
                        const nuevoStock = stockActual - cantidadNum;

                        db.query(
                            `UPDATE stock SET Cantidad = ? WHERE Id_Producto = ?`,
                            [nuevoStock, Id_Producto],
                            (errStock) => {
                                if (errStock) return db.rollback(() =>
                                    res.status(500).json({ error: 'Error ajustando stock: ' + errStock.sqlMessage })
                                );

                                registrarMovimiento(
                                    Id_Producto,
                                    'salida',
                                    cantidadNum,
                                    'Devolución a proveedor',
                                    `Devolución #${idDevolucion} - ${Motivo}`
                                );

                                db.query(`INSERT INTO perdida (Fecha) VALUES (?)`, [Fecha], (errP, resP) => {
                                    if (!errP) {
                                        db.query(`
                                            INSERT INTO merma (Id_Perdida, Id_Producto, Cantidad, Motivo)
                                            VALUES (?, ?, ?, ?)
                                        `, [resP.insertId, Id_Producto, cantidadNum,
                                            `DEVOLUCIÓN: ${Motivo}${Descripcion ? ' - ' + Descripcion : ''}`]);
                                    }

                                    db.commit((errC) => {
                                        if (errC) return db.rollback(() =>
                                            res.status(500).json({ error: 'Error confirmando' })
                                        );

                                        console.log(`✅ Devolución #${idDevolucion} registrada | Prod #${Id_Producto} x${cantidadNum}`);

                                        res.json({
                                            success: true,
                                            message: 'Devolución registrada correctamente',
                                            Id_Devolucion: idDevolucion,
                                            proveedor: provResults[0].Nombre,
                                            producto: producto.Nombre,
                                            cantidad: cantidadNum,
                                            stock_anterior: stockActual,
                                            stock_nuevo: nuevoStock
                                        });
                                    });
                                });
                            }
                        );
                    });
                });
            });
        }
    );
});

// 2. Listar devoluciones
app.get('/api/devoluciones-proveedor', (req, res) => {
    const { id_proveedor, id_producto, motivo, estado, desde, hasta, limite } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (id_proveedor) { whereCondition += ' AND d.Id_Proveedor = ?'; params.push(id_proveedor); }
    if (id_producto) { whereCondition += ' AND d.Id_Producto = ?'; params.push(id_producto); }
    if (motivo) { whereCondition += ' AND d.Motivo = ?'; params.push(motivo); }
    if (estado) { whereCondition += ' AND d.Estado = ?'; params.push(estado); }
    if (desde) { whereCondition += ' AND d.Fecha >= ?'; params.push(desde); }
    if (hasta) { whereCondition += ' AND d.Fecha <= ?'; params.push(hasta); }

    const limiteFinal = parseInt(limite) || 200;

    const sql = `
        SELECT 
            d.Id_Devolucion,
            d.Id_Proveedor,
            prov.Nombre AS Nombre_Proveedor,
            prov.Empresa AS Empresa_Proveedor,
            d.Id_Producto,
            p.Nombre AS Nombre_Producto,
            p.Marca AS Marca_Producto,
            d.Cantidad,
            d.Fecha,
            d.Motivo,
            d.Descripcion,
            d.Estado,
            d.Monto_Reclamado,
            d.Notas_Resolucion,
            d.Fecha_Resolucion,
            d.Fecha_Registro,
            t.NombreCompleto AS Registrado_Por
        FROM devolucion_proveedor d
        LEFT JOIN proveedores prov ON d.Id_Proveedor = prov.Id_Proveedor
        LEFT JOIN producto p ON d.Id_Producto = p.Id_Producto
        LEFT JOIN trabajadores t ON d.Id_Trabajador_Registro = t.Id_Trabajador
        ${whereCondition}
        ORDER BY d.Fecha DESC, d.Id_Devolucion DESC
        LIMIT ?
    `;

    db.query(sql, [...params, limiteFinal], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        const totalUnidades = results.reduce((s, r) => s + (parseInt(r.Cantidad) || 0), 0);
        const totalMonto = results.reduce((s, r) => s + (parseFloat(r.Monto_Reclamado) || 0), 0);

        res.json({
            total_registros: results.length,
            total_unidades: totalUnidades,
            total_monto_reclamado: totalMonto,
            devoluciones: results
        });
    });
});

// 3. Obtener devolución por ID
app.get('/api/devoluciones-proveedor/:id', (req, res) => {
    const { id } = req.params;

    const sql = `
        SELECT 
            d.*,
            prov.Nombre AS Nombre_Proveedor,
            prov.Empresa AS Empresa_Proveedor,
            prov.Num_celular AS Celular_Proveedor,
            p.Nombre AS Nombre_Producto,
            p.Marca AS Marca_Producto,
            p.Precio AS Precio_Referencia,
            t.NombreCompleto AS Registrado_Por
        FROM devolucion_proveedor d
        LEFT JOIN proveedores prov ON d.Id_Proveedor = prov.Id_Proveedor
        LEFT JOIN producto p ON d.Id_Producto = p.Id_Producto
        LEFT JOIN trabajadores t ON d.Id_Trabajador_Registro = t.Id_Trabajador
        WHERE d.Id_Devolucion = ?
    `;

    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0)
            return res.status(404).json({ error: 'Devolución no encontrada' });
        res.json(results[0]);
    });
});

// 4. Actualizar estado
app.put('/api/devoluciones-proveedor/:id/estado', (req, res) => {
    const { id } = req.params;
    const { Estado, Notas_Resolucion } = req.body;

    const estadosValidos = ['pendiente', 'enviado', 'reembolsado', 'reemplazado', 'cancelado'];
    if (!Estado || !estadosValidos.includes(Estado))
        return res.status(400).json({ error: 'Estado inválido' });

    const sql = `
        UPDATE devolucion_proveedor 
        SET Estado = ?, 
            Notas_Resolucion = ?,
            Fecha_Resolucion = CASE WHEN ? IN ('reembolsado','reemplazado','cancelado') THEN NOW() ELSE Fecha_Resolucion END
        WHERE Id_Devolucion = ?
    `;

    db.query(sql, [Estado, Notas_Resolucion || null, Estado, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (result.affectedRows === 0)
            return res.status(404).json({ error: 'Devolución no encontrada' });

        res.json({ success: true, message: `Estado actualizado a "${Estado}"`, Estado });
    });
});

// 5. Eliminar devolución (revierte stock)
app.delete('/api/devoluciones-proveedor/:id', (req, res) => {
    const { id } = req.params;

    db.query(
        `SELECT Id_Producto, Cantidad FROM devolucion_proveedor WHERE Id_Devolucion = ?`,
        [id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            if (results.length === 0)
                return res.status(404).json({ error: 'Devolución no encontrada' });

            const dev = results[0];

            db.beginTransaction((errTx) => {
                if (errTx) return res.status(500).json({ error: 'Error iniciando transacción' });

                db.query(
                    `UPDATE stock SET Cantidad = Cantidad + ? WHERE Id_Producto = ?`,
                    [dev.Cantidad, dev.Id_Producto],
                    (errS) => {
                        if (errS) return db.rollback(() =>
                            res.status(500).json({ error: 'Error revirtiendo stock' })
                        );

                        registrarMovimiento(
                            dev.Id_Producto, 'entrada', dev.Cantidad,
                            'Reversión de devolución', `Devolución #${id} eliminada`
                        );

                        db.query(`DELETE FROM devolucion_proveedor WHERE Id_Devolucion = ?`, [id], (errD) => {
                            if (errD) return db.rollback(() =>
                                res.status(500).json({ error: 'Error eliminando' })
                            );

                            db.commit((errC) => {
                                if (errC) return db.rollback(() =>
                                    res.status(500).json({ error: 'Error confirmando' })
                                );
                                res.json({
                                    success: true,
                                    message: 'Devolución eliminada y stock revertido',
                                    cantidad_revertida: dev.Cantidad
                                });
                            });
                        });
                    }
                );
            });
        }
    );
});

// 6. Estadísticas
app.get('/api/devoluciones-proveedor/estadisticas', (req, res) => {
    const { desde, hasta } = req.query;
    let whereCondition = '';
    let params = [];

    if (desde && hasta) {
        whereCondition = 'WHERE d.Fecha BETWEEN ? AND ?';
        params = [desde, hasta];
    }

    const sqlMotivo = `
        SELECT d.Motivo, COUNT(*) AS total_devoluciones,
               SUM(d.Cantidad) AS total_unidades,
               SUM(d.Monto_Reclamado) AS total_monto
        FROM devolucion_proveedor d
        ${whereCondition}
        GROUP BY d.Motivo
        ORDER BY total_unidades DESC
    `;

    const sqlProv = `
        SELECT prov.Id_Proveedor, prov.Nombre AS Nombre_Proveedor, prov.Empresa AS Empresa_Proveedor,
               COUNT(*) AS total_devoluciones, SUM(d.Cantidad) AS total_unidades,
               SUM(d.Monto_Reclamado) AS total_monto
        FROM devolucion_proveedor d
        INNER JOIN proveedores prov ON d.Id_Proveedor = prov.Id_Proveedor
        ${whereCondition}
        GROUP BY prov.Id_Proveedor, prov.Nombre, prov.Empresa
        ORDER BY total_unidades DESC
        LIMIT 20
    `;

    const sqlTot = `
        SELECT COUNT(*) AS total_devoluciones,
               COALESCE(SUM(d.Cantidad), 0) AS total_unidades,
               COALESCE(SUM(d.Monto_Reclamado), 0) AS total_monto,
               COALESCE(SUM(CASE WHEN d.Estado='pendiente' THEN 1 ELSE 0 END), 0) AS pendientes,
               COALESCE(SUM(CASE WHEN d.Estado='reembolsado' THEN 1 ELSE 0 END), 0) AS reembolsadas
        FROM devolucion_proveedor d
        ${whereCondition}
    `;

    Promise.all([
        db.promise().query(sqlMotivo, params),
        db.promise().query(sqlProv, params),
        db.promise().query(sqlTot, params)
    ]).then(([m, p, t]) => {
        res.json({
            por_motivo: m[0],
            por_proveedor: p[0],
            totales: t[0][0] || { total_devoluciones: 0, total_unidades: 0, total_monto: 0, pendientes: 0, reembolsadas: 0 }
        });
    }).catch(err => {
        console.error('Error estadísticas devoluciones:', err);
        res.status(500).json({ error: err.message });
    });
});

// =====================================================
// REGALÍAS
// =====================================================
app.get('/api/regalias', (req, res) => {
    const { id_proveedor, activa } = req.query;
    
    let whereCondition = 'WHERE 1=1';
    let params = [];
    
    if (id_proveedor) {
        whereCondition += ' AND r.Id_Proveedor = ?';
        params.push(id_proveedor);
    }
    if (activa !== undefined && activa !== '') {
        whereCondition += ' AND r.Activa = ?';
        params.push(activa);
    }
    
    const sql = `
        SELECT 
            r.Id_Regalia,
            r.Id_Proveedor,
            r.Fecha,
            r.Activa,
            prov.Nombre AS Nombre_Proveedor,
            prov.Empresa AS Empresa_Proveedor,
            p.Id_Producto,
            p.Nombre AS Nombre_Producto,
            pr.Cantidad,
            pr.Tipo_Premio,
            pr.Condicion
        FROM regalia r
        LEFT JOIN proveedores prov ON r.Id_Proveedor = prov.Id_Proveedor
        LEFT JOIN premio pr ON r.Id_Regalia = pr.Id_Regalia
        LEFT JOIN producto p ON pr.Id_Producto = p.Id_Producto
        ${whereCondition}
        ORDER BY r.Fecha DESC, r.Id_Regalia DESC
    `;
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error en /api/regalias:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json(results);
    });
});

app.get('/api/regalias/proveedor/:id', (req, res) => {
    const { id } = req.params;
    
    const sql = `
        SELECT 
            r.Id_Regalia,
            r.Id_Proveedor,
            r.Fecha,
            r.Activa,
            p.Id_Producto,
            p.Nombre AS Nombre_Producto,
            pr.Cantidad,
            pr.Tipo_Premio,
            pr.Condicion
        FROM regalia r
        LEFT JOIN premio pr ON r.Id_Regalia = pr.Id_Regalia
        LEFT JOIN producto p ON pr.Id_Producto = p.Id_Producto
        WHERE r.Id_Proveedor = ?
        ORDER BY r.Fecha DESC, r.Id_Regalia DESC
    `;
    
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.post('/api/regalias', (req, res) => {
    const { Id_Proveedor, Id_Producto, Cantidad, Tipo_Premio, Condicion, Fecha } = req.body;
    
    if (!Id_Proveedor) {
        return res.status(400).json({ error: 'El proveedor es requerido' });
    }
    if (!Tipo_Premio || Tipo_Premio.trim() === '') {
        return res.status(400).json({ error: 'El tipo de regalia es requerido' });
    }
    
    const fechaRegistro = Fecha || new Date().toISOString().split('T')[0];
    
    db.query(`SELECT Id_Proveedor FROM proveedores WHERE Id_Proveedor = ?`, [Id_Proveedor], (err, provResults) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (provResults.length === 0) {
            return res.status(400).json({ error: 'El proveedor no existe' });
        }
        
        db.query(`INSERT INTO regalia (Id_Proveedor, Fecha, Activa) VALUES (?, ?, 1)`, 
            [Id_Proveedor, fechaRegistro], (err, resultRegalia) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            const idRegalia = resultRegalia.insertId;
            
            db.query(`INSERT INTO premio (Id_Regalia, Id_Producto, Cantidad, Tipo_Premio, Condicion) VALUES (?, ?, ?, ?, ?)`, 
                [idRegalia, Id_Producto || null, Cantidad || null, Tipo_Premio.trim(), Condicion || null], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                res.json({ 
                    message: "Regalia registrada exitosamente", 
                    Id_Regalia: idRegalia 
                });
            });
        });
    });
});

app.put('/api/regalias/:id', (req, res) => {
    const { id } = req.params;
    const { Id_Producto, Cantidad, Tipo_Premio, Condicion, Activa } = req.body;
    
    if (!Tipo_Premio || Tipo_Premio.trim() === '') {
        return res.status(400).json({ error: 'El tipo de regalia es requerido' });
    }
    
    db.query(`SELECT Id_Regalia FROM regalia WHERE Id_Regalia = ?`, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.status(404).json({ error: 'Regalia no encontrada' });
        }
        
        db.query(`UPDATE regalia SET Activa = ? WHERE Id_Regalia = ?`, 
            [Activa !== undefined ? Activa : 1, id], (err) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            
            db.query(`UPDATE premio SET Id_Producto = ?, Cantidad = ?, Tipo_Premio = ?, Condicion = ? WHERE Id_Regalia = ?`, 
                [Id_Producto || null, Cantidad || null, Tipo_Premio.trim(), Condicion || null, id], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                res.json({ message: "Regalia actualizada correctamente" });
            });
        });
    });
});

app.delete('/api/regalias/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`DELETE FROM premio WHERE Id_Regalia = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        
        db.query(`DELETE FROM regalia WHERE Id_Regalia = ?`, [id], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Regalia no encontrada' });
            }
            res.json({ message: "Regalia eliminada correctamente" });
        });
    });
});

// =====================================================
// CONSUMOS INTERNOS
// =====================================================
app.get('/api/consumos', (req, res) => {
    console.log('PROCEDIMIENTO sp_listar_consumos - Ejecutando consulta...');
    db.query(`CALL sp_listar_consumos()`, (err, results) => {
        if (err) {
            console.error('Error en sp_listar_consumos:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        const consumos = results[0];
        console.log(`sp_listar_consumos - ${consumos.length} consumos encontrados`);
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
                    
                    registrarMovimiento(Id_Producto, 'salida', Cantidad, 'Consumo interno', 'Consumo #' + result.insertId);
                    
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
                    
                    if (diferencia !== 0) {
                        registrarMovimiento(
                            consumoAnterior.Id_Producto, 
                            diferencia > 0 ? 'salida' : 'entrada', 
                            Math.abs(diferencia), 
                            'Ajuste de consumo', 
                            'Consumo #' + id
                        );
                    }
                    
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
                    
                    registrarMovimiento(consumo.Id_Producto, 'entrada', consumo.Cantidad, 'Reversion de consumo', 'Consumo #' + id);
                    
                    res.json({ message: "Consumo eliminado correctamente" });
                });
            });
        });
    });
});

// =====================================================
// PÉRDIDAS / MERMAS
// =====================================================
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
                        
                        registrarMovimiento(Id_Producto, 'salida', Cantidad, 'Perdida', Motivo);
                        
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
                    
                    if (diferencia !== 0) {
                        registrarMovimiento(
                            perdidaAnterior.Id_Producto, 
                            diferencia > 0 ? 'salida' : 'entrada', 
                            Math.abs(diferencia), 
                            'Ajuste de perdida', 
                            'Perdida #' + id
                        );
                    }
                    
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
                        
                        registrarMovimiento(perdida.Id_Producto, 'entrada', perdida.Cantidad, 'Reversion de perdida', 'Perdida #' + id);
                        
                        res.json({ message: "Perdida eliminada correctamente" });
                    });
                });
            });
        });
    });
});

// =====================================================
// RECUPERACIÓN DE CONTRASEÑA - TRABAJADORES
// =====================================================
app.post('/api/trabajadores/recuperar-password', (req, res) => {
    const { email } = req.body;
    
    if (!email || email.trim() === '') {
        return res.status(400).json({ success: false, message: 'Por favor, ingrese su correo electronico' });
    }
    
    db.query(`SELECT Id_Trabajador, NombreCompleto, email FROM trabajadores WHERE email = ? AND Activo = 1`, [email], (err, results) => {
        if (err) {
            console.error('Error en recuperacion:', err);
            return res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
        
        if (results.length === 0) {
            return res.json({ success: true, message: 'Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena.' });
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
                subject: 'Recuperacion de Contrasena - Tienda Chepita',
                html: `
                    <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                        <h2 style="color: #A63C89;">Recuperacion de Contrasena</h2>
                        <p>Hola <strong>${trabajador.NombreCompleto}</strong>,</p>
                        <p>Hemos recibido una solicitud para restablecer tu contrasena.</p>
                        <p>Para crear una nueva contrasena, haz clic en el siguiente boton:</p>
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Restablecer Contrasena</a>
                        </div>
                        <p style="color: #666; font-size: 12px;">Este enlace es valido por 1 hora.</p>
                        <hr>
                        <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestion Comercial</p>
                    </div>
                `
            };
            
            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.error('Error al enviar email:', error);
                    return res.status(500).json({ success: false, message: 'Error al enviar el correo.' });
                }
                res.json({ success: true, message: 'Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena.' });
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
        return res.status(400).json({ success: false, message: 'La contrasena debe tener al menos 4 caracteres' });
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
                console.error('Error iniciando transaccion:', err);
                return res.status(500).json({ success: false, message: 'Error en el servidor' });
            }
            
            db.query(`UPDATE trabajadores SET password_hash = ?, debe_cambiar_password = 0 WHERE Id_Trabajador = ?`,
                [hashedPassword, idTrabajador], (err) => {
                if (err) {
                    console.error('Error actualizando contrasena:', err);
                    return db.rollback(() => res.status(500).json({ success: false, message: 'Error actualizando contrasena' }));
                }
                
                db.query(`UPDATE trabajador_recuperacion_tokens SET usado = 1 WHERE token = ?`, [token], (err) => {
                    if (err) {
                        console.error('Error actualizando token:', err);
                        return db.rollback(() => res.status(500).json({ success: false, message: 'Error actualizando token' }));
                    }
                    
                    db.commit((err) => {
                        if (err) {
                            console.error('Error commit:', err);
                            return res.status(500).json({ success: false, message: 'Error completando operacion' });
                        }
                        res.json({ success: true, message: 'Contrasena restablecida correctamente. Ahora puedes iniciar sesion.' });
                    });
                });
            });
        });
    });
});

// =====================================================
// VENTAS
// =====================================================
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
            console.error('Error en GET /api/ventas:', err);
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
    
    console.log('POST /api/compras recibido:', { Num_Factura, Id_cliente, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto });
    
    if (!Num_Factura) {
        console.error('Falta Num_Factura');
        return res.status(400).json({ error: 'Num_Factura es obligatoria' });
    }
    
    if (!Id_Vendedor || isNaN(Id_Vendedor)) {
        console.error('Id_Vendedor invalido:', Id_Vendedor);
        return res.status(400).json({ error: 'Id_Vendedor es obligatorio y debe ser un numero' });
    }
    
    if (Id_Canal !== null && Id_Canal !== undefined && Id_Canal !== '') {
        if (isNaN(Id_Canal)) {
            console.error('Id_Canal invalido:', Id_Canal);
            return res.status(400).json({ error: 'Id_Canal debe ser un numero' });
        }
    }
    
    if (!Id_Metodo || isNaN(Id_Metodo)) {
        console.error('Id_Metodo invalido:', Id_Metodo);
        return res.status(400).json({ error: 'Id_Metodo es obligatorio y debe ser un numero' });
    }
    
    if (!Fecha) {
        console.error('Falta Fecha');
        return res.status(400).json({ error: 'Fecha es obligatoria' });
    }
    
    if (Monto === undefined || isNaN(Monto) || parseFloat(Monto) <= 0) {
        console.error('Monto invalido:', Monto);
        return res.status(400).json({ error: 'Monto debe ser un numero mayor a 0' });
    }
    
    console.log('Validacion de datos completada');
    
    const sql = `INSERT INTO compra (Num_Factura, Id_cliente, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto, Cajero) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [Num_Factura, Id_cliente || null, Id_Vendedor, Id_Canal, Id_Metodo, Fecha, Monto, Cajero || null], (err, result) => {
        if (err) {
            console.error('Error al insertar compra:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'La factura #' + Num_Factura + ' ya existe en el sistema' });
            }
            return res.status(500).json({ error: 'Error al guardar compra: ' + err.message });
        }
        
        console.log('Compra insertada - ID:', result.insertId, '| Factura #:', Num_Factura);
        res.json({ 
            message: "Compra guardada exitosamente", 
            Num_Factura: Num_Factura, 
            compraId: result.insertId,
            monto: Monto
        });
    });
});

// ============================================================
// REQ-FR-22: PAGOS MIXTOS - Registrar desglose de pago
// ============================================================
app.post('/api/compras/:numFactura/pagos', (req, res) => {
    const { numFactura } = req.params;
    const { pagos } = req.body;

    if (!pagos || !Array.isArray(pagos) || pagos.length === 0) {
        return res.status(400).json({ 
            error: 'Debe enviar al menos un método de pago en el array "pagos"' 
        });
    }

    for (let i = 0; i < pagos.length; i++) {
        const p = pagos[i];
        if (!p.Id_Metodo || isNaN(p.Id_Metodo)) {
            return res.status(400).json({ 
                error: `Pago #${i + 1}: Id_Metodo es obligatorio y numérico` 
            });
        }
        if (p.Monto === undefined || isNaN(p.Monto) || parseFloat(p.Monto) <= 0) {
            return res.status(400).json({ 
                error: `Pago #${i + 1}: Monto debe ser mayor a 0` 
            });
        }
    }

    db.query(
        `SELECT Num_Factura, Monto FROM compra WHERE Num_Factura = ?`,
        [numFactura],
        (err, compraResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            if (compraResults.length === 0) {
                return res.status(404).json({ 
                    error: `La factura #${numFactura} no existe` 
                });
            }

            const montoFactura = parseFloat(compraResults[0].Monto);
            const totalPagos = pagos.reduce(
                (sum, p) => sum + parseFloat(p.Monto), 0
            );

            if (Math.abs(totalPagos - montoFactura) > 0.01) {
                return res.status(400).json({
                    error: `La suma de los pagos (C$${totalPagos.toFixed(2)}) no coincide con el monto total de la factura (C$${montoFactura.toFixed(2)})`
                });
            }

            const idsMetodos = pagos.map(p => parseInt(p.Id_Metodo));
            const placeholders = idsMetodos.map(() => '?').join(',');
            
            db.query(
                `SELECT Id_Metodo FROM metododepago WHERE Id_Metodo IN (${placeholders})`,
                idsMetodos,
                (err, metodosResults) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });

                    const metodosValidos = metodosResults.map(m => m.Id_Metodo);
                    const metodosInvalidos = idsMetodos.filter(
                        id => !metodosValidos.includes(id)
                    );

                    if (metodosInvalidos.length > 0) {
                        return res.status(400).json({
                            error: `Métodos de pago inválidos: ${metodosInvalidos.join(', ')}`
                        });
                    }

                    db.beginTransaction((err) => {
                        if (err) return res.status(500).json({ error: 'Error iniciando transacción' });

                        const insertSql = `
                            INSERT INTO compra_pago_detalle 
                            (Num_Factura, Id_Metodo, Monto, Referencia) 
                            VALUES ?
                        `;
                        const valores = pagos.map(p => [
                            numFactura,
                            parseInt(p.Id_Metodo),
                            parseFloat(p.Monto),
                            p.Referencia || null
                        ]);

                        db.query(insertSql, [valores], (err, result) => {
                            if (err) {
                                return db.rollback(() => 
                                    res.status(500).json({ error: 'Error guardando pagos: ' + err.sqlMessage })
                                );
                            }

                            db.commit((err) => {
                                if (err) {
                                    return db.rollback(() => 
                                        res.status(500).json({ error: 'Error confirmando transacción' })
                                    );
                                }

                                console.log(`✅ Pagos mixtos registrados - Factura #${numFactura} | ${pagos.length} métodos | Total: C$${totalPagos}`);

                                res.json({
                                    success: true,
                                    message: 'Desglose de pago registrado correctamente',
                                    Num_Factura: numFactura,
                                    monto_total: montoFactura,
                                    pagos_registrados: pagos.length,
                                    desglose: pagos
                                });
                            });
                        });
                    });
                }
            );
        }
    );
});

// Obtener desglose de pagos de una factura
app.get('/api/compras/:numFactura/pagos', (req, res) => {
    const { numFactura } = req.params;

    const sql = `
        SELECT 
            cpd.Id_Pago_Detalle,
            cpd.Num_Factura,
            cpd.Id_Metodo,
            mp.Nombre_Metodo,
            cpd.Monto,
            cpd.Referencia,
            cpd.Fecha_Registro
        FROM compra_pago_detalle cpd
        INNER JOIN metododepago mp ON cpd.Id_Metodo = mp.Id_Metodo
        WHERE cpd.Num_Factura = ?
        ORDER BY cpd.Id_Pago_Detalle
    `;

    db.query(sql, [numFactura], (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// Listar todas las facturas con pago mixto
app.get('/api/pagos-mixtos', (req, res) => {
    const { desde, hasta } = req.query;

    let whereCondition = '';
    let params = [];

    if (desde && hasta) {
        whereCondition = 'WHERE DATE(c.Fecha) BETWEEN ? AND ?';
        params = [desde, hasta];
    }

    const sql = `
        SELECT 
            c.Num_Factura,
            c.Fecha,
            c.Monto AS Monto_Total,
            COUNT(cpd.Id_Pago_Detalle) AS cantidad_metodos,
            GROUP_CONCAT(
                CONCAT(mp.Nombre_Metodo, ': C$', FORMAT(cpd.Monto, 2)) 
                SEPARATOR ' + '
            ) AS desglose
        FROM compra c
        INNER JOIN compra_pago_detalle cpd ON c.Num_Factura = cpd.Num_Factura
        INNER JOIN metododepago mp ON cpd.Id_Metodo = mp.Id_Metodo
        ${whereCondition}
        GROUP BY c.Num_Factura, c.Fecha, c.Monto
        HAVING cantidad_metodos > 1
        ORDER BY c.Fecha DESC, c.Num_Factura DESC
    `;

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error en /api/pagos-mixtos:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json(results);
    });
});

// Eliminar desglose de pagos
app.delete('/api/compras/:numFactura/pagos', (req, res) => {
    const { numFactura } = req.params;

    db.query(
        `DELETE FROM compra_pago_detalle WHERE Num_Factura = ?`,
        [numFactura],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            res.json({ 
                success: true, 
                message: `Se eliminaron ${result.affectedRows} registro(s) de pago`,
                Num_Factura: numFactura
            });
        }
    );
});

app.post('/api/ordenes', (req, res) => {
    const { Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario } = req.body;
    
    console.log('POST /api/ordenes recibido:', { Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario });
    
    if (!Id_Producto) {
        console.error('Falta Id_Producto');
        return res.status(400).json({ error: 'Id_Producto es obligatorio' });
    }
    
    if (!NumFactura) {
        console.error('Falta NumFactura');
        return res.status(400).json({ error: 'NumFactura es obligatorio' });
    }
    
    if (!CantidadVendida || isNaN(CantidadVendida) || parseInt(CantidadVendida) <= 0) {
        console.error('CantidadVendida invalida:', CantidadVendida);
        return res.status(400).json({ error: 'CantidadVendida debe ser un numero mayor a 0' });
    }
    
    if (Subtotal === undefined || isNaN(Subtotal) || parseFloat(Subtotal) < 0) {
        console.error('Subtotal invalido:', Subtotal);
        return res.status(400).json({ error: 'Subtotal es obligatorio y debe ser un numero valido' });
    }
    
    if (!Fecha) {
        console.error('Falta Fecha');
        return res.status(400).json({ error: 'Fecha es obligatoria' });
    }
    
    if (PrecioUnitario === undefined || isNaN(PrecioUnitario) || parseFloat(PrecioUnitario) <= 0) {
        console.error('PrecioUnitario invalido:', PrecioUnitario);
        return res.status(400).json({ error: 'PrecioUnitario debe ser un numero mayor a 0' });
    }
    
    const checkProductoSql = 'SELECT Id_Producto FROM producto WHERE Id_Producto = ?';
    db.query(checkProductoSql, [Id_Producto], (err, results) => {
        if (err) {
            console.error('Error al verificar producto:', err);
            return res.status(500).json({ error: 'Error al verificar producto: ' + err.message });
        }
        
        if (!results || results.length === 0) {
            console.error('Producto no existe:', Id_Producto);
            return res.status(400).json({ error: 'El producto #' + Id_Producto + ' no existe en la base de datos' });
        }
        
        console.log('Producto verificado:', Id_Producto);
        
        const insertSql = `INSERT INTO orden (Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario) 
                          VALUES (?, ?, ?, ?, ?, ?)`;
        
        db.query(insertSql, [Id_Producto, NumFactura, CantidadVendida, Subtotal, Fecha, PrecioUnitario], (err, result) => {
            if (err) {
                console.error('Error al insertar orden:', err);
                return res.status(500).json({ error: 'Error al guardar orden: ' + err.message });
            }
            
            console.log('Orden insertada - ID:', result.insertId);
            
            const updateStockSql = `UPDATE stock SET Cantidad = Cantidad - ? WHERE Id_Producto = ?`;
            
            db.query(updateStockSql, [CantidadVendida, Id_Producto], (err2, result2) => {
                if (err2) {
                    console.error('Advertencia: Error al actualizar stock:', err2);
                    return res.status(500).json({ error: 'Orden guardada pero error al actualizar stock: ' + err2.message });
                }
                
                registrarMovimiento(Id_Producto, 'salida', CantidadVendida, 'Venta', `Factura #${NumFactura}`);
                
                console.log(`Stock actualizado - Producto: ${Id_Producto}, Cantidad reducida: ${CantidadVendida}`);
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

// =====================================================
// EVALUACIÓN / PUNTOS VENDEDORES
// =====================================================
app.get('/api/evaluacion-completa', (req, res) => {
    const { year, month } = req.query;
    
    const sqlTrabajadores = `SELECT Id_Trabajador, NombreCompleto FROM trabajadores WHERE Activo = 1`;
    
    db.query(sqlTrabajadores, (err, trabajadores) => {
        if (err) {
            console.error('Error obteniendo trabajadores:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (trabajadores.length === 0) {
            return res.json([]);
        }
        
        const resultados = [];
        let completados = 0;
        
        trabajadores.forEach((trabajador) => {
            const id = trabajador.Id_Trabajador;
            const nombre = trabajador.NombreCompleto;
            
            let sqlVentas = `
                SELECT 
                    COUNT(DISTINCT c.Num_Factura) as total_ventas,
                    COUNT(DISTINCT DATE(c.Fecha)) as dias_ventas,
                    COALESCE(SUM(c.Monto), 0) as total_ventas_cordobas
                FROM compra c
                WHERE c.Id_Vendedor = ? AND c.Fecha IS NOT NULL
            `;
            
            let paramsVentas = [id];
            
            db.query(sqlVentas, paramsVentas, (err, ventasResult) => {
                if (err) {
                    console.error('Error obteniendo ventas:', err);
                    completados++;
                    return;
                }
                
                const ventas = ventasResult[0] || { 
                    total_ventas: 0, 
                    dias_ventas: 0, 
                    total_ventas_cordobas: 0
                };
                
                let sqlAsistencia = `
                    SELECT 
                        COUNT(DISTINCT fecha) as dias_asistencia
                    FROM asistencia_registros
                    WHERE id_vendedor = ? AND estado = 'completo'
                `;
                
                let paramsAsistencia = [id];
                
                db.query(sqlAsistencia, paramsAsistencia, (err, asistenciaResult) => {
                    if (err) {
                        console.error('Error obteniendo asistencias:', err);
                        completados++;
                        return;
                    }
                    
                    const asistencia = asistenciaResult[0] || { dias_asistencia: 0 };
                    
                    const totalVentas = parseInt(ventas.total_ventas) || 0;
                    const diasVentas = parseInt(ventas.dias_ventas) || 0;
                    const diasAsistencia = parseInt(asistencia.dias_asistencia) || 0;
                    
                    const promedioDiario = diasVentas > 0 ? parseFloat((totalVentas / diasVentas).toFixed(2)) : 0;
                    
                    const puntajeTotal = parseFloat(
                        ((totalVentas * 0.3) + (diasVentas * 0.3) + (diasAsistencia * 0.4)).toFixed(2)
                    );
                    
                    resultados.push({
                        id_trabajador: id,
                        nombre_completo: nombre,
                        total_ventas: totalVentas,
                        dias_ventas: diasVentas,
                        dias_asistencia: diasAsistencia,
                        promedio_diario: promedioDiario,
                        puntaje_total: puntajeTotal,
                        total_ventas_cordobas: parseFloat(ventas.total_ventas_cordobas || 0)
                    });
                    
                    completados++;
                    
                    if (completados === trabajadores.length) {
                        resultados.sort((a, b) => b.puntaje_total - a.puntaje_total);
                        res.json(resultados);
                    }
                });
            });
        });
    });
});

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

// =====================================================
// ESTADÍSTICAS
// =====================================================
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
            COALESCE(cat.Nombre, 'Sin categoria') as categoria,
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
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoria') as categoria, SUM(o.CantidadVendida) as cantidad
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
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoria') as categoria, SUM(o.CantidadVendida) as cantidad
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
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoria') as categoria, SUM(o.CantidadVendida) as cantidad
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

// =====================================================
// QR VENDEDORES
// =====================================================
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
            console.error('Error creando tabla qr_vendedores:', err);
        } else {
            console.log('Tabla qr_vendedores lista');
        }
    });
}

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
        return res.status(400).send('Codigo requerido');
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
        return res.json({ valido: false, message: 'Codigo invalido' });
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
                        return res.json({ valido: false, message: 'QR ya usado. Genere uno nuevo.' });
                    }
                    if (new Date(check.expira_en) < new Date()) {
                        return res.json({ valido: false, message: 'QR expirado. Genere uno nuevo.' });
                    }
                }
                return res.json({ valido: false, message: 'QR invalido' });
            });
            return;
        }
        
        const qr = results[0];
        db.query(`UPDATE qr_vendedores SET usado = 1 WHERE id = ?`, [qr.id]);
        
        console.log(`QR valido - Vendedor: ${qr.NombreCompleto}`);
        
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
    console.log(`QR usado: ${codigo} | Vendedor: ${id_vendedor} | Cajero: ${id_cajero || 'desconocido'}`);
    res.json({ success: true });
});

// =====================================================
// TICKETS / PEDIDOS PENDIENTES
// =====================================================
app.post('/api/tickets/generar', verificarTokenTrabajador, (req, res) => {
    const { productos, total } = req.body;
    const id_vendedor = req.usuario.id;
    
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ success: false, message: 'Debe incluir al menos un producto' });
    }
    if (!total || total <= 0) {
        return res.status(400).json({ success: false, message: 'Total invalido' });
    }
    
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hash = crypto.createHash('md5').update(`${id_vendedor}${timestamp}${random}`).digest('hex').substring(0, 6);
    const codigo = `TKT-${id_vendedor}-${timestamp}-${hash}`;
    
    const fechaExpiracion = new Date();
    fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15);
    
    db.query(`SELECT NombreCompleto FROM trabajadores WHERE Id_Trabajador = ?`, [id_vendedor], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        if (results.length === 0) return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });
        
        const nombreVendedor = results[0].NombreCompleto;
        
        db.query(`
            INSERT INTO pedidos_pendientes (codigo, id_vendedor, nombre_vendedor, productos, total, estado, fecha_creacion, fecha_expiracion)
            VALUES (?, ?, ?, ?, ?, 'pendiente', NOW(), ?)
        `, [codigo, id_vendedor, nombreVendedor, JSON.stringify(productos), total, fechaExpiracion], (err, result) => {
            if (err) {
                console.error('Error guardando ticket:', err);
                return res.status(500).json({ success: false, message: 'Error guardando ticket: ' + err.message });
            }
            
            res.json({
                success: true,
                message: 'Ticket generado correctamente',
                ticket: {
                    codigo: codigo,
                    id_vendedor: id_vendedor,
                    nombre_vendedor: nombreVendedor,
                    productos: productos,
                    total: total,
                    estado: 'pendiente',
                    expira_en: fechaExpiracion
                }
            });
        });
    });
});

app.get('/api/tickets/pendientes', (req, res) => {
    db.query(`
        UPDATE pedidos_pendientes 
        SET estado = 'expirado' 
        WHERE estado = 'pendiente' AND fecha_expiracion < NOW()
    `, (err) => {
        if (err) console.error('Error actualizando tickets expirados:', err);
        
        db.query(`
            SELECT pp.*, t.NombreCompleto as vendedor_nombre
            FROM pedidos_pendientes pp
            JOIN trabajadores t ON pp.id_vendedor = t.Id_Trabajador
            WHERE pp.estado = 'pendiente' AND pp.fecha_expiracion > NOW()
            ORDER BY pp.fecha_creacion ASC
        `, (err, results) => {
            if (err) {
                console.error('Error obteniendo tickets pendientes:', err);
                return res.status(500).json({ success: false, message: 'Error en servidor' });
            }
            res.json({ success: true, tickets: results });
        });
    });
});

app.put('/api/tickets/:codigo/procesar', (req, res) => {
    const { codigo } = req.params;
    
    db.query(`
        UPDATE pedidos_pendientes 
        SET estado = 'en_proceso', fecha_procesado = NOW()
        WHERE codigo = ? AND estado = 'pendiente' AND fecha_expiracion > NOW()
    `, [codigo], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Ticket no encontrado o expirado' });
        }
        res.json({ success: true, message: 'Ticket marcado como en proceso' });
    });
});

app.post('/api/tickets/:codigo/completar', (req, res) => {
    const { codigo } = req.params;
    const { num_factura } = req.body;
    
    db.beginTransaction((err) => {
        if (err) {
            console.error('Error iniciando transaccion:', err);
            return res.status(500).json({ success: false, message: 'Error en servidor' });
        }
        
        db.query(`
            SELECT * FROM pedidos_pendientes 
            WHERE codigo = ? AND estado IN ('pendiente', 'en_proceso') AND fecha_expiracion > NOW()
        `, [codigo], (err, results) => {
            if (err) {
                console.error('Error obteniendo ticket:', err);
                return db.rollback(() => res.status(500).json({ success: false, message: 'Error en servidor' }));
            }
            
            if (results.length === 0) {
                return db.rollback(() => res.status(404).json({ success: false, message: 'Ticket no valido o expirado' }));
            }
            
            const ticket = results[0];
            const id_vendedor = ticket.id_vendedor;
            const totalVenta = ticket.total;
            
            db.query(`
                UPDATE pedidos_pendientes 
                SET estado = 'completado', fecha_procesado = NOW()
                WHERE codigo = ?
            `, [codigo], (err) => {
                if (err) {
                    console.error('Error actualizando ticket:', err);
                    return db.rollback(() => res.status(500).json({ success: false, message: 'Error actualizando ticket' }));
                }
                
                const puntosGanados = Math.floor(totalVenta / 100);
                
                db.query(`
                    INSERT INTO puntos_vendedores (id_vendedor, total_puntos, fecha_actualizacion)
                    VALUES (?, ?, NOW())
                    ON DUPLICATE KEY UPDATE 
                        total_puntos = total_puntos + ?,
                        fecha_actualizacion = NOW()
                `, [id_vendedor, puntosGanados, puntosGanados], (err) => {
                    if (err) {
                        console.error('Error asignando puntos:', err);
                        return db.rollback(() => res.status(500).json({ success: false, message: 'Error asignando puntos' }));
                    }
                    
                    db.query(`
                        INSERT INTO puntos_detalle (id_vendedor, puntos, motivo, fecha, num_factura, ticket_codigo)
                        VALUES (?, ?, ?, NOW(), ?, ?)
                    `, [id_vendedor, puntosGanados, `Venta #${num_factura || 'N/A'} - Ticket ${codigo}`, num_factura || null, codigo], (err) => {
                        if (err) {
                            console.error('Error registrando detalle de puntos:', err);
                        }
                        
                        db.commit((err) => {
                            if (err) {
                                console.error('Error commit:', err);
                                return res.status(500).json({ success: false, message: 'Error completando operacion' });
                            }
                            
                            console.log(`Ticket ${codigo} completado - Vendedor: ${ticket.nombre_vendedor} - Puntos: ${puntosGanados}`);
                            
                            res.json({
                                success: true,
                                message: 'Venta completada y puntos asignados',
                                puntos_asignados: puntosGanados,
                                vendedor: {
                                    id: id_vendedor,
                                    nombre: ticket.nombre_vendedor
                                }
                            });
                        });
                    });
                });
            });
        });
    });
});

app.put('/api/tickets/:codigo/cancelar', verificarTokenTrabajador, (req, res) => {
    const { codigo } = req.params;
    const id_vendedor = req.usuario.id;
    
    db.query(`
        UPDATE pedidos_pendientes 
        SET estado = 'cancelado'
        WHERE codigo = ? AND id_vendedor = ? AND estado = 'pendiente'
    `, [codigo, id_vendedor], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Ticket no encontrado o no se puede cancelar' });
        }
        res.json({ success: true, message: 'Ticket cancelado' });
    });
});

app.get('/api/tickets/:codigo', (req, res) => {
    const { codigo } = req.params;
    
    db.query(`
        SELECT pp.*, t.NombreCompleto as vendedor_nombre
        FROM pedidos_pendientes pp
        JOIN trabajadores t ON pp.id_vendedor = t.Id_Trabajador
        WHERE pp.codigo = ?
    `, [codigo], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
        }
        
        const ticket = results[0];
        if (ticket.estado === 'pendiente' && new Date(ticket.fecha_expiracion) < new Date()) {
            db.query(`UPDATE pedidos_pendientes SET estado = 'expirado' WHERE codigo = ?`, [codigo]);
            return res.status(410).json({ success: false, message: 'El ticket ha expirado' });
        }
        
        res.json({ success: true, ticket: results[0] });
    });
});

app.get('/api/vendedor/puntos/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`
        SELECT 
            COALESCE(pv.total_puntos, 0) as total_puntos,
            COUNT(pd.id) as total_transacciones
        FROM trabajadores t
        LEFT JOIN puntos_vendedores pv ON t.Id_Trabajador = pv.id_vendedor
        LEFT JOIN puntos_detalle pd ON t.Id_Trabajador = pd.id_vendedor
        WHERE t.Id_Trabajador = ?
        GROUP BY t.Id_Trabajador
    `, [id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        if (results.length === 0) {
            return res.json({ success: true, total_puntos: 0, total_transacciones: 0 });
        }
        res.json({ success: true, ...results[0] });
    });
});

app.get('/api/vendedor/historial-puntos/:id', (req, res) => {
    const { id } = req.params;
    
    db.query(`
        SELECT * FROM puntos_detalle 
        WHERE id_vendedor = ?
        ORDER BY fecha DESC
        LIMIT 50
    `, [id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        res.json({ success: true, historial: results });
    });
});

// =====================================================
// ASISTENCIA
// =====================================================
app.post('/api/asistencia/marcar-entrada', verificarTokenTrabajador, (req, res) => {
    const { id_vendedor } = req.body;
    const hoy = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    if (!id_vendedor) return res.status(400).json({ success: false, message: 'ID de vendedor requerido' });
    if (req.usuario.id !== id_vendedor) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    db.query(`SELECT * FROM asistencia_registros WHERE id_vendedor = ? AND fecha = ?`, [id_vendedor, hoy], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        
        if (results.length > 0) {
            const registro = results[0];
            if (registro.hora_entrada && !registro.hora_salida) {
                return res.json({ success: false, message: 'Ya marcaste entrada hoy. Debes marcar salida primero.' });
            }
            if (registro.hora_entrada && registro.hora_salida) {
                return res.json({ success: false, message: 'Ya completaste tu jornada hoy' });
            }
        }
        
        if (results.length === 0) {
            db.query(`INSERT INTO asistencia_registros (id_vendedor, fecha, hora_entrada, estado) VALUES (?, ?, ?, 'presente')`, 
                [id_vendedor, hoy, horaActual], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'Error registrando entrada' });
                res.json({ success: true, message: `Entrada registrada a las ${horaActual}`, tipo: 'entrada', hora: horaActual });
            });
        } else {
            db.query(`UPDATE asistencia_registros SET hora_entrada = ?, estado = 'presente' WHERE id_vendedor = ? AND fecha = ?`, 
                [horaActual, id_vendedor, hoy], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'Error registrando entrada' });
                res.json({ success: true, message: `Entrada registrada a las ${horaActual}`, tipo: 'entrada', hora: horaActual });
            });
        }
    });
});
// ============================================================
// ENDPOINTS ADICIONALES PARA REPORTES
// ============================================================

// 1. Reporte de ventas con desglose de pagos
app.get('/api/reportes/ventas', (req, res) => {
    const { desde, hasta } = req.query;
    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (desde) { whereCondition += ' AND DATE(c.Fecha) >= ?'; params.push(desde); }
    if (hasta) { whereCondition += ' AND DATE(c.Fecha) <= ?'; params.push(hasta); }

    const sql = `
        SELECT 
            c.Num_Factura, c.Fecha, c.Monto AS Monto_Total, c.Cajero,
            COALESCE(t.NombreCompleto, 'Sin asignar') AS Nombre_Vendedor,
            COALESCE(mp.Nombre_Metodo, 'No especificado') AS Nombre_Metodo,
            COALESCE(ca.Nombre_Canal, 'No especificado') AS Nombre_Canal,
            COALESCE(cl.Nombre, '') AS Nombre_Cliente,
            COALESCE(cl.Apellido, '') AS Apellido_Cliente,
            p.Nombre AS Producto, o.CantidadVendida, o.PrecioUnitario, o.Subtotal,
            (SELECT COUNT(*) FROM compra_pago_detalle cpd WHERE cpd.Num_Factura = c.Num_Factura) AS cantidad_desglose
        FROM compra c
        LEFT JOIN trabajadores t ON c.Id_Vendedor = t.Id_Trabajador
        LEFT JOIN metododepago mp ON c.Id_Metodo = mp.Id_Metodo
        LEFT JOIN canal ca ON c.Id_Canal = ca.Id_Canal
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        LEFT JOIN orden o ON c.Num_Factura = o.NumFactura
        LEFT JOIN producto p ON o.Id_Producto = p.Id_Producto
        ${whereCondition}
        ORDER BY c.Fecha DESC, c.Num_Factura DESC
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        const facturas = {};
        results.forEach(row => {
            const nf = row.Num_Factura;
            if (!facturas[nf]) {
                facturas[nf] = {
                    Num_Factura: nf, Fecha: row.Fecha,
                    Monto_Total: parseFloat(row.Monto_Total) || 0,
                    Cajero: row.Cajero, Nombre_Vendedor: row.Nombre_Vendedor,
                    Nombre_Metodo: row.Nombre_Metodo, Nombre_Canal: row.Nombre_Canal,
                    Cliente: `${row.Nombre_Cliente} ${row.Apellido_Cliente}`.trim() || 'Cliente no registrado',
                    cantidad_desglose: row.cantidad_desglose,
                    productos: []
                };
            }
            if (row.Producto) {
                facturas[nf].productos.push({
                    Producto: row.Producto, Cantidad: row.CantidadVendida,
                    Precio: parseFloat(row.PrecioUnitario) || 0,
                    Subtotal: parseFloat(row.Subtotal) || 0
                });
            }
        });

        res.json({
            total: Object.keys(facturas).length,
            monto_total: Object.values(facturas).reduce((s, f) => s + f.Monto_Total, 0),
            facturas: Object.values(facturas)
        });
    });
});

// 2. Reporte de existencias de inventario
app.get('/api/reportes/existencias', (req, res) => {
    const { categoria, solo_bajo_stock } = req.query;
    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (categoria) { whereCondition += ' AND p.Id_Categoria = ?'; params.push(categoria); }

    const sql = `
        SELECT 
            p.Id_Producto AS Codigo, p.Nombre,
            COALESCE(c.Nombre, 'Sin Categoría') AS Categoria,
            COALESCE(SUM(s.Cantidad), 0) AS Cantidad_Disponible,
            10 AS Nivel_Minimo_Stock,
            COALESCE(e.Nombre_Estado, 'Disponible') AS Estado,
            p.Precio, p.Marca
        FROM producto p
        LEFT JOIN categoria c ON p.Id_Categoria = c.Id_Categoria
        LEFT JOIN estado e ON p.Id_Estado = e.Id_Estado
        LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto
        ${whereCondition}
        GROUP BY p.Id_Producto, p.Nombre, c.Nombre, e.Nombre_Estado, p.Precio, p.Marca
        ORDER BY p.Nombre ASC
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        let productos = results.map(r => ({
            ...r,
            Cantidad_Disponible: parseInt(r.Cantidad_Disponible) || 0,
            bajo_stock: (parseInt(r.Cantidad_Disponible) || 0) < 10
        }));

        if (solo_bajo_stock === 'true') productos = productos.filter(p => p.bajo_stock);

        res.json({
            total_productos: productos.length,
            total_bajo_stock: productos.filter(p => p.bajo_stock).length,
            total_unidades: productos.reduce((s, p) => s + p.Cantidad_Disponible, 0),
            productos
        });
    });
});

// 3. Reporte de mermas y pérdidas
app.get('/api/reportes/mermas-perdidas', (req, res) => {
    const { desde, hasta, id_producto, motivo } = req.query;
    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (desde) { whereCondition += ' AND pd.Fecha >= ?'; params.push(desde); }
    if (hasta) { whereCondition += ' AND pd.Fecha <= ?'; params.push(hasta); }
    if (id_producto) { whereCondition += ' AND m.Id_Producto = ?'; params.push(id_producto); }
    if (motivo) { whereCondition += ' AND LOWER(m.Motivo) LIKE ?'; params.push('%' + motivo.toLowerCase() + '%'); }

    const sql = `
        SELECT 
            m.Id_Perdida, m.Id_Producto, p.Nombre AS Nombre_Producto, p.Marca,
            COALESCE(c.Nombre, 'Sin Categoría') AS Categoria,
            m.Cantidad, m.Motivo, pd.Fecha
        FROM merma m
        INNER JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
        INNER JOIN producto p ON m.Id_Producto = p.Id_Producto
        LEFT JOIN categoria c ON p.Id_Categoria = c.Id_Categoria
        ${whereCondition}
        ORDER BY pd.Fecha DESC, m.Cantidad DESC
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        const totalUnidades = results.reduce((s, r) => s + (parseInt(r.Cantidad) || 0), 0);

        const porMotivo = {};
        results.forEach(r => {
            const m = r.Motivo || 'Sin motivo';
            if (!porMotivo[m]) porMotivo[m] = { motivo: m, cantidad: 0, registros: 0 };
            porMotivo[m].cantidad += parseInt(r.Cantidad) || 0;
            porMotivo[m].registros++;
        });

        res.json({
            total_registros: results.length,
            total_unidades_perdidas: totalUnidades,
            por_motivo: Object.values(porMotivo).sort((a, b) => b.cantidad - a.cantidad),
            registros: results
        });
    });
});

// 4. Reporte de desempeño e incentivo mensual
app.get('/api/reportes/desempeno-incentivo', (req, res) => {
    const { anio, mes } = req.query;
    const anioNum = parseInt(anio) || new Date().getFullYear();
    const mesNum = parseInt(mes) || (new Date().getMonth() + 1);

    const primerDia = `${anioNum}-${String(mesNum).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anioNum, mesNum, 0).toISOString().split('T')[0];

    db.query(`SELECT * FROM configuracion_incentivos WHERE id = 1`, (errConfig, configR) => {
        if (errConfig) return res.status(500).json({ error: errConfig.sqlMessage });

        const config = (configR && configR[0]) || {
            porcentaje_minimo_asistencia: 80,
            monto_incentivo_1: 1500,
            monto_incentivo_2: 1000,
            monto_incentivo_3: 500
        };

        let diasLaborables = 0;
        const totalDias = new Date(anioNum, mesNum, 0).getDate();
        for (let d = 1; d <= totalDias; d++) {
            if (new Date(anioNum, mesNum - 1, d).getDay() !== 0) diasLaborables++;
        }

        db.query(`SELECT Id_Trabajador, NombreCompleto FROM trabajadores WHERE Activo = 1 ORDER BY NombreCompleto`, (errTrab, trabajadores) => {
            if (errTrab) return res.status(500).json({ error: errTrab.sqlMessage });
            if (trabajadores.length === 0) {
                return res.json({ anio: anioNum, mes: mesNum, dias_laborables: diasLaborables, porcentaje_minimo: config.porcentaje_minimo_asistencia, mejor_desempeno: null, incentivo: 0, trabajadores: [] });
            }

            const resultados = [];
            let completados = 0;

            trabajadores.forEach(trab => {
                db.query(`SELECT COUNT(DISTINCT fecha) AS dias_asistidos FROM asistencia_registros WHERE id_vendedor = ? AND fecha BETWEEN ? AND ? AND hora_entrada IS NOT NULL`, [trab.Id_Trabajador, primerDia, ultimoDia], (errA, asistR) => {
                    if (errA) { completados++; return; }

                    const diasAsistidos = (asistR[0] && asistR[0].dias_asistidos) || 0;
                    const porcentajeAsistencia = diasLaborables > 0 ? parseFloat(((diasAsistidos / diasLaborables) * 100).toFixed(2)) : 0;

                    db.query(`SELECT COUNT(DISTINCT Num_Factura) AS total_facturas, COALESCE(SUM(Monto), 0) AS total_monto FROM compra WHERE Id_Vendedor = ? AND Fecha BETWEEN ? AND ?`, [trab.Id_Trabajador, primerDia, ultimoDia], (errV, ventasR) => {
                        if (errV) { completados++; return; }

                        const ventas = (ventasR && ventasR[0]) || { total_facturas: 0, total_monto: 0 };
                        const cumple = porcentajeAsistencia >= config.porcentaje_minimo_asistencia;
                        const puntaje = cumple ? parseFloat(((ventas.total_facturas * 0.5) + (porcentajeAsistencia * 0.5)).toFixed(2)) : 0;

                        resultados.push({
                            id_trabajador: trab.Id_Trabajador,
                            nombre_completo: trab.NombreCompleto,
                            total_ventas: parseInt(ventas.total_facturas) || 0,
                            total_monto: parseFloat(ventas.total_monto) || 0,
                            dias_asistidos: diasAsistidos,
                            porcentaje_asistencia: porcentajeAsistencia,
                            cumple_asistencia: cumple,
                            puntaje: puntaje
                        });

                        completados++;
                        if (completados === trabajadores.length) {
                            resultados.sort((a, b) => b.puntaje - a.puntaje);
                            const elegibles = resultados.filter(r => r.cumple_asistencia);
                            let mejor = null;
                            let incentivoMonto = 0;

                            if (elegibles.length > 0) {
                                mejor = { ...elegibles[0] };
                                incentivoMonto = config.monto_incentivo_1;
                                mejor.incentivo = incentivoMonto;
                            }

                            res.json({
                                anio: anioNum, mes: mesNum, dias_laborables: diasLaborables,
                                porcentaje_minimo: config.porcentaje_minimo_asistencia,
                                mejor_desempeno: mejor, incentivo: incentivoMonto,
                                monto_incentivo_1: config.monto_incentivo_1,
                                monto_incentivo_2: config.monto_incentivo_2,
                                monto_incentivo_3: config.monto_incentivo_3,
                                trabajadores: resultados
                            });
                        }
                    });
                });
            });
        });
    });
});

// 5. Configuración de incentivos (GET/PUT)
app.get('/api/configuracion-incentivos', (req, res) => {
    db.query(`SELECT * FROM configuracion_incentivos WHERE id = 1`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.json({ porcentaje_minimo_asistencia: 80.00, monto_incentivo_1: 1500.00, monto_incentivo_2: 1000.00, monto_incentivo_3: 500.00 });
        }
        res.json(results[0]);
    });
});

app.put('/api/configuracion-incentivos', (req, res) => {
    const { porcentaje_minimo_asistencia, monto_incentivo_1, monto_incentivo_2, monto_incentivo_3 } = req.body;

    if (porcentaje_minimo_asistencia === undefined || isNaN(porcentaje_minimo_asistencia)) {
        return res.status(400).json({ error: 'El porcentaje mínimo es requerido' });
    }
    if (porcentaje_minimo_asistencia < 0 || porcentaje_minimo_asistencia > 100) {
        return res.status(400).json({ error: 'El porcentaje debe estar entre 0 y 100' });
    }

    const sql = `
        INSERT INTO configuracion_incentivos 
        (id, porcentaje_minimo_asistencia, monto_incentivo_1, monto_incentivo_2, monto_incentivo_3)
        VALUES (1, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            porcentaje_minimo_asistencia = VALUES(porcentaje_minimo_asistencia),
            monto_incentivo_1 = VALUES(monto_incentivo_1),
            monto_incentivo_2 = VALUES(monto_incentivo_2),
            monto_incentivo_3 = VALUES(monto_incentivo_3)
    `;

    db.query(sql, [porcentaje_minimo_asistencia, monto_incentivo_1, monto_incentivo_2, monto_incentivo_3], (err) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ success: true, message: 'Configuración actualizada correctamente' });
    });
});

app.post('/api/asistencia/marcar-salida', verificarTokenTrabajador, (req, res) => {
    const { id_vendedor } = req.body;
    const hoy = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    if (!id_vendedor) return res.status(400).json({ success: false, message: 'ID de vendedor requerido' });
    if (req.usuario.id !== id_vendedor) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    db.query(`SELECT * FROM asistencia_registros WHERE id_vendedor = ? AND fecha = ?`, [id_vendedor, hoy], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        if (results.length === 0) return res.json({ success: false, message: 'Primero debes marcar tu entrada' });
        
        const registro = results[0];
        if (registro.hora_salida) return res.json({ success: false, message: 'Ya marcaste salida hoy' });
        if (!registro.hora_entrada) return res.json({ success: false, message: 'Primero debes marcar tu entrada' });
        
        db.query(`UPDATE asistencia_registros SET hora_salida = ?, estado = 'completo' WHERE id_vendedor = ? AND fecha = ?`, 
            [horaActual, id_vendedor, hoy], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Error registrando salida' });
            res.json({ success: true, message: `Salida registrada a las ${horaActual}`, tipo: 'salida', hora: horaActual });
        });
    });
});

app.get('/api/asistencia/estado/:id', (req, res) => {
    const { id } = req.params;
    const hoy = new Date().toISOString().split('T')[0];
    
    db.query(`SELECT * FROM asistencia_registros WHERE id_vendedor = ? AND fecha = ?`, [id, hoy], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en servidor' });
        
        if (results.length === 0) {
            return res.json({ success: true, tiene_registro: false, entrada: null, salida: null, estado: 'pendiente', mensaje: 'No has marcado asistencia hoy' });
        }
        
        const registro = results[0];
        let estado = 'pendiente', mensaje = '';
        
        if (registro.hora_entrada && !registro.hora_salida) {
            estado = 'en_jornada';
            mensaje = `Entrada: ${registro.hora_entrada} - Aun no marcas salida`;
        } else if (registro.hora_entrada && registro.hora_salida) {
            estado = 'completo';
            mensaje = `Entrada: ${registro.hora_entrada} | Salida: ${registro.hora_salida}`;
        }
        
        res.json({ success: true, tiene_registro: true, entrada: registro.hora_entrada, salida: registro.hora_salida, estado: estado, mensaje: mensaje });
    });
});

app.get('/api/asistencia/trabajador/:id', (req, res) => {
    const { id } = req.params;
    const { desde, hasta, limite } = req.query;

    let whereCondition = 'WHERE a.id_vendedor = ?';
    let params = [id];

    if (desde) {
        whereCondition += ' AND a.fecha >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND a.fecha <= ?';
        params.push(hasta);
    }

    const limiteFinal = parseInt(limite) || 100;

    const sql = `
        SELECT 
            a.id,
            a.id_vendedor,
            a.fecha,
            a.hora_entrada,
            a.hora_salida,
            a.estado,
            t.NombreCompleto AS nombre_trabajador,
            TIMESTAMPDIFF(MINUTE, 
                CONCAT(a.fecha, ' ', a.hora_entrada),
                CONCAT(a.fecha, ' ', COALESCE(a.hora_salida, a.hora_entrada))
            ) AS minutos_trabajados
        FROM asistencia_registros a
        INNER JOIN trabajadores t ON a.id_vendedor = t.Id_Trabajador
        ${whereCondition}
        ORDER BY a.fecha DESC, a.hora_entrada DESC
        LIMIT ?
    `;

    db.query(sql, [...params, limiteFinal], (err, results) => {
        if (err) {
            console.error('Error en /api/asistencia/trabajador/:id:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }

        const totalRegistros = results.length;
        const totalCompletos = results.filter(r => r.estado === 'completo' && r.hora_salida).length;
        const totalMinutos = results.reduce((sum, r) => sum + (r.minutos_trabajados || 0), 0);
        const totalHoras = (totalMinutos / 60).toFixed(2);
        const promedioHorasPorDia = totalCompletos > 0 
            ? (totalMinutos / 60 / totalCompletos).toFixed(2) 
            : 0;

        res.json({
            success: true,
            trabajador_id: parseInt(id),
            total_registros: totalRegistros,
            total_jornadas_completas: totalCompletos,
            total_horas_trabajadas: parseFloat(totalHoras),
            promedio_horas_por_jornada: parseFloat(promedioHorasPorDia),
            registros: results
        });
    });
});

app.get('/api/asistencia/hoy', (req, res) => {
    const hoy = new Date().toISOString().split('T')[0];

    const sql = `
        SELECT 
            t.Id_Trabajador,
            t.NombreCompleto,
            t.Activo,
            a.fecha,
            a.hora_entrada,
            a.hora_salida,
            a.estado,
            TIMESTAMPDIFF(MINUTE, 
                CONCAT(a.fecha, ' ', a.hora_entrada),
                CONCAT(a.fecha, ' ', COALESCE(a.hora_salida, a.hora_entrada))
            ) AS minutos_trabajados
        FROM trabajadores t
        LEFT JOIN asistencia_registros a 
            ON t.Id_Trabajador = a.id_vendedor AND a.fecha = ?
        WHERE t.Activo = 1
        ORDER BY t.NombreCompleto
    `;

    db.query(sql, [hoy], (err, results) => {
        if (err) {
            console.error('Error en /api/asistencia/hoy:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        res.json({
            success: true,
            fecha: hoy,
            total_trabajadores: results.length,
            presentes: results.filter(r => r.hora_entrada && !r.hora_salida).length,
            completos: results.filter(r => r.hora_entrada && r.hora_salida).length,
            ausentes: results.filter(r => !r.hora_entrada).length,
            registros: results
        });
    });
});

// =====================================================
// ABASTECIMIENTO
// =====================================================
app.post('/api/abastecimiento/ingreso', (req, res) => {
    const { Id_Producto, Id_Proveedor, Cantidad, Precio_Compra, Fecha } = req.body;

    if (!Id_Producto) {
        return res.status(400).json({ error: 'El producto es requerido' });
    }
    if (!Id_Proveedor) {
        return res.status(400).json({ error: 'El proveedor es requerido' });
    }
    if (!Cantidad || Cantidad < 1 || Cantidad > 9999) {
        return res.status(400).json({ error: 'La cantidad debe estar entre 1 y 9999' });
    }
    if (!Precio_Compra || Precio_Compra < 0) {
        return res.status(400).json({ error: 'El precio de compra es requerido' });
    }
    if (!Fecha) {
        return res.status(400).json({ error: 'La fecha es requerida' });
    }

    db.query(`SELECT Id_Producto, Nombre FROM producto WHERE Id_Producto = ?`, [Id_Producto], (err, prodResults) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (prodResults.length === 0) {
            return res.status(400).json({ error: 'El producto no existe' });
        }

        db.query(`SELECT Id_Proveedor, Nombre FROM proveedores WHERE Id_Proveedor = ?`, [Id_Proveedor], (err, provResults) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            if (provResults.length === 0) {
                return res.status(400).json({ error: 'El proveedor no existe' });
            }

            const sqlAbast = `
                INSERT INTO abastecimiento (Id_Producto, Id_Proveedor, Precio_Compra, FechaEntrada, Cantidad_Entrada) 
                VALUES (?, ?, ?, ?, ?)
            `;
            db.query(sqlAbast, [Id_Producto, Id_Proveedor, Precio_Compra, Fecha, Cantidad], (err, result) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });

                db.query(`SELECT COALESCE(SUM(Cantidad), 0) AS stock_total FROM stock WHERE Id_Producto = ?`, [Id_Producto], (err, stockResults) => {
                    if (err) return res.status(500).json({ error: err.sqlMessage });

                    const stockActual = stockResults[0].stock_total;
                    const nuevoStock = stockActual + parseInt(Cantidad);

                    db.query(`SELECT Id_Inventario FROM stock WHERE Id_Producto = ?`, [Id_Producto], (err, checkStock) => {
                        if (err) return res.status(500).json({ error: err.sqlMessage });

                        if (checkStock.length > 0) {
                            db.query(`UPDATE stock SET Cantidad = ?, FechaEntrada = ? WHERE Id_Producto = ?`, 
                                [nuevoStock, Fecha, Id_Producto], (err) => {
                                if (err) return res.status(500).json({ error: err.sqlMessage });
                                finalizarIngreso();
                            });
                        } else {
                            db.query(`INSERT INTO stock (Id_Inventario, Id_Producto, Cantidad, FechaEntrada) VALUES (1, ?, ?, ?)`, 
                                [Id_Producto, nuevoStock, Fecha], (err) => {
                                if (err) return res.status(500).json({ error: err.sqlMessage });
                                finalizarIngreso();
                            });
                        }
                    });

                    function finalizarIngreso() {
                        registrarMovimiento(
                            Id_Producto, 
                            'entrada', 
                            Cantidad, 
                            'Ingreso de proveedor', 
                            'Abastecimiento #' + result.insertId
                        );

                        console.log(`Ingreso registrado: Producto #${Id_Producto} | Proveedor #${Id_Proveedor} | Cant: ${Cantidad}`);

                        res.json({
                            success: true,
                            message: 'Ingreso de mercancia registrado exitosamente',
                            Id_Abastecimiento: result.insertId,
                            producto: prodResults[0].Nombre,
                            proveedor: provResults[0].Nombre,
                            cantidad: parseInt(Cantidad),
                            stock_anterior: stockActual,
                            stock_nuevo: nuevoStock
                        });
                    }
                });
            });
        });
    });
});

app.get('/api/abastecimiento/historial', (req, res) => {
    const { id_producto, id_proveedor, desde, hasta } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (id_producto) {
        whereCondition += ' AND a.Id_Producto = ?';
        params.push(id_producto);
    }
    if (id_proveedor) {
        whereCondition += ' AND a.Id_Proveedor = ?';
        params.push(id_proveedor);
    }
    if (desde) {
        whereCondition += ' AND a.FechaEntrada >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND a.FechaEntrada <= ?';
        params.push(hasta);
    }

    const sql = `
        SELECT 
            a.Id_Producto,
            a.Id_Proveedor,
            a.Precio_Compra,
            a.FechaEntrada,
            a.Cantidad_Entrada,
            p.Nombre AS Nombre_Producto,
            p.Marca AS Marca_Producto,
            prov.Nombre AS Nombre_Proveedor,
            prov.Empresa AS Empresa_Proveedor
        FROM abastecimiento a
        LEFT JOIN producto p ON a.Id_Producto = p.Id_Producto
        LEFT JOIN proveedores prov ON a.Id_Proveedor = prov.Id_Proveedor
        ${whereCondition}
        ORDER BY a.FechaEntrada DESC, a.Id_Producto DESC
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

app.get('/api/abastecimiento/resumen-proveedor', (req, res) => {
    const sql = `
        SELECT 
            prov.Id_Proveedor,
            prov.Nombre AS Nombre_Proveedor,
            prov.Empresa AS Empresa_Proveedor,
            COUNT(*) AS total_ingresos,
            COALESCE(SUM(a.Cantidad_Entrada), 0) AS total_unidades,
            COALESCE(SUM(a.Cantidad_Entrada * a.Precio_Compra), 0) AS total_invertido
        FROM abastecimiento a
        INNER JOIN proveedores prov ON a.Id_Proveedor = prov.Id_Proveedor
        GROUP BY prov.Id_Proveedor, prov.Nombre, prov.Empresa
        ORDER BY total_unidades DESC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json(results);
    });
});

// =====================================================
// FINANCIERO
// =====================================================
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
            COALESCE(cat.Nombre, 'Sin categoria') as categoria,
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

app.get('/api/anios-disponibles', (req, res) => {
    const sql = `SELECT DISTINCT YEAR(Fecha) as anio FROM compra ORDER BY anio DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.map(r => r.anio));
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
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoria') as categoria, SUM(o.CantidadVendida) as cantidad
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
        SELECT p.Nombre as nombre, COALESCE(cat.Nombre, 'Sin categoria') as categoria, SUM(o.CantidadVendida) as cantidad
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
        const labels = diasData.map(v => `Dia ${v.dia}`);
        
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

function crearProcedimientosSiNoExisten() {
    db.query(`SHOW PROCEDURE STATUS WHERE Name = 'sp_listar_categorias'`, (err, results) => {
        if (err) console.error('Error verificando procedimiento:', err);
        if (results && results.length === 0) {
            console.log('PROCEDIMIENTO Creando sp_listar_categorias...');
            db.query(`
                CREATE PROCEDURE sp_listar_categorias()
                BEGIN
                    SELECT Id_Categoria, Nombre FROM categoria ORDER BY Nombre;
                END
            `, (err) => {
                if (err) console.error('Error creando sp_listar_categorias:', err);
                else console.log('PROCEDIMIENTO sp_listar_categorias creado exitosamente');
            });
        } else {
            console.log('PROCEDIMIENTO sp_listar_categorias ya existe');
        }
    });

    db.query(`SHOW PROCEDURE STATUS WHERE Name = 'sp_listar_consumos'`, (err, results) => {
        if (err) console.error('Error verificando procedimiento:', err);
        if (results && results.length === 0) {
            console.log('PROCEDIMIENTO Creando sp_listar_consumos...');
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
                if (err) console.error('Error creando sp_listar_consumos:', err);
                else console.log('PROCEDIMIENTO sp_listar_consumos creado exitosamente');
            });
        } else {
            console.log('PROCEDIMIENTO sp_listar_consumos ya existe');
        }
    });

    db.query(`SHOW PROCEDURE STATUS WHERE Name = 'sp_productos_bajo_stock'`, (err, results) => {
        if (err) console.error('Error verificando procedimiento:', err);
        if (results && results.length === 0) {
            console.log('PROCEDIMIENTO Creando sp_productos_bajo_stock...');
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
                if (err) console.error('Error creando sp_productos_bajo_stock:', err);
                else console.log('PROCEDIMIENTO sp_productos_bajo_stock creado exitosamente');
            });
        } else {
            console.log('PROCEDIMIENTO sp_productos_bajo_stock ya existe');
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
            console.log('Agregando columna Id_Vendedor a tabla compra...');
            db.query(`ALTER TABLE compra ADD COLUMN Id_Vendedor INT NULL, ADD FOREIGN KEY (Id_Vendedor) REFERENCES trabajadores(Id_Trabajador)`, (err) => {
                if (err) console.error('Error agregando columna Id_Vendedor:', err);
                else console.log('Columna Id_Vendedor agregada correctamente');
            });
        } else {
            console.log('Columna Id_Vendedor ya existe en tabla compra');
        }
    });
}

// =====================================================
// REPORTES
// =====================================================

// Reporte de historial de ventas
app.get('/api/reportes/ventas', (req, res) => {
    const { desde, hasta } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (desde) {
        whereCondition += ' AND DATE(c.Fecha) >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND DATE(c.Fecha) <= ?';
        params.push(hasta);
    }

    const sql = `
        SELECT 
            c.Num_Factura,
            c.Fecha,
            c.Monto AS Monto_Total,
            c.Cajero,
            COALESCE(t.NombreCompleto, 'Sin asignar') AS Nombre_Vendedor,
            COALESCE(mp.Nombre_Metodo, 'No especificado') AS Nombre_Metodo,
            COALESCE(ca.Nombre_Canal, 'No especificado') AS Nombre_Canal,
            COALESCE(cl.Nombre, '') AS Nombre_Cliente,
            COALESCE(cl.Apellido, '') AS Apellido_Cliente,
            p.Nombre AS Producto,
            o.CantidadVendida,
            o.PrecioUnitario,
            o.Subtotal,
            (SELECT COUNT(*) FROM compra_pago_detalle cpd WHERE cpd.Num_Factura = c.Num_Factura) AS cantidad_desglose
        FROM compra c
        LEFT JOIN trabajadores t ON c.Id_Vendedor = t.Id_Trabajador
        LEFT JOIN metododepago mp ON c.Id_Metodo = mp.Id_Metodo
        LEFT JOIN canal ca ON c.Id_Canal = ca.Id_Canal
        LEFT JOIN clientes cl ON c.Id_cliente = cl.Id_cliente
        LEFT JOIN orden o ON c.Num_Factura = o.NumFactura
        LEFT JOIN producto p ON o.Id_Producto = p.Id_Producto
        ${whereCondition}
        ORDER BY c.Fecha DESC, c.Num_Factura DESC
    `;

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error en /api/reportes/ventas:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }

        const facturas = {};
        results.forEach(row => {
            const nf = row.Num_Factura;
            if (!facturas[nf]) {
                facturas[nf] = {
                    Num_Factura: nf,
                    Fecha: row.Fecha,
                    Monto_Total: parseFloat(row.Monto_Total) || 0,
                    Cajero: row.Cajero,
                    Nombre_Vendedor: row.Nombre_Vendedor,
                    Nombre_Metodo: row.Nombre_Metodo,
                    Nombre_Canal: row.Nombre_Canal,
                    Cliente: `${row.Nombre_Cliente} ${row.Apellido_Cliente}`.trim() || 'Cliente no registrado',
                    cantidad_desglose: row.cantidad_desglose,
                    productos: []
                };
            }
            if (row.Producto) {
                facturas[nf].productos.push({
                    Producto: row.Producto,
                    Cantidad: row.CantidadVendida,
                    Precio: parseFloat(row.PrecioUnitario) || 0,
                    Subtotal: parseFloat(row.Subtotal) || 0
                });
            }
        });

        res.json({
            total: Object.keys(facturas).length,
            monto_total: Object.values(facturas).reduce((sum, f) => sum + f.Monto_Total, 0),
            facturas: Object.values(facturas)
        });
    });
});

// Reporte financiero del período
app.get('/api/reportes/financiero', (req, res) => {
    const { desde, hasta } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (desde) {
        whereCondition += ' AND DATE(Fecha) >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND DATE(Fecha) <= ?';
        params.push(hasta);
    }

    const sqlVentas = `
        SELECT 
            COUNT(DISTINCT Num_Factura) AS total_ventas,
            COALESCE(SUM(Monto), 0) AS ingresos_totales
        FROM compra
        ${whereCondition}
    `;

    const sqlCompras = `
        SELECT 
            COUNT(*) AS total_compras,
            COALESCE(SUM(Cantidad_Entrada), 0) AS total_unidades_compradas,
            COALESCE(SUM(Cantidad_Entrada * Precio_Compra), 0) AS total_invertido
        FROM abastecimiento
        ${whereCondition.replace(/Fecha/g, 'FechaEntrada')}
    `;

    const sqlPorMetodo = `
        SELECT 
            mp.Nombre_Metodo,
            COUNT(c.Num_Factura) AS cantidad,
            COALESCE(SUM(c.Monto), 0) AS total
        FROM compra c
        INNER JOIN metododepago mp ON c.Id_Metodo = mp.Id_Metodo
        ${whereCondition.replace(/Fecha/g, 'c.Fecha')}
        GROUP BY mp.Id_Metodo, mp.Nombre_Metodo
        ORDER BY total DESC
    `;

    const sqlPorDia = `
        SELECT 
            DATE(Fecha) AS fecha,
            COUNT(DISTINCT Num_Factura) AS ventas,
            COALESCE(SUM(Monto), 0) AS total
        FROM compra
        ${whereCondition}
        GROUP BY DATE(Fecha)
        ORDER BY fecha ASC
    `;

    Promise.all([
        db.promise().query(sqlVentas, params),
        db.promise().query(sqlCompras, params),
        db.promise().query(sqlPorMetodo, params),
        db.promise().query(sqlPorDia, params)
    ]).then(([ventasR, comprasR, metodosR, diasR]) => {
        const ventas = ventasR[0][0] || {};
        const compras = comprasR[0][0] || {};

        res.json({
            total_ventas: parseInt(ventas.total_ventas) || 0,
            ingresos_totales: parseFloat(ventas.ingresos_totales) || 0,
            total_compras: parseInt(compras.total_compras) || 0,
            total_unidades_compradas: parseInt(compras.total_unidades_compradas) || 0,
            total_invertido: parseFloat(compras.total_invertido) || 0,
            ganancia_bruta: (parseFloat(ventas.ingresos_totales) || 0) - (parseFloat(compras.total_invertido) || 0),
            por_metodo: metodosR[0],
            por_dia: diasR[0]
        });
    }).catch(err => {
        console.error('Error en /api/reportes/financiero:', err);
        res.status(500).json({ error: err.message });
    });
});

// Reporte de asistencia
app.get('/api/reportes/asistencia', (req, res) => {
    const { desde, hasta, id_trabajador } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (desde) {
        whereCondition += ' AND a.fecha >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND a.fecha <= ?';
        params.push(hasta);
    }
    if (id_trabajador) {
        whereCondition += ' AND a.id_vendedor = ?';
        params.push(id_trabajador);
    }

    let diasLaborables = 0;
    if (desde && hasta) {
        const d1 = new Date(desde);
        const d2 = new Date(hasta);
        for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
            if (d.getDay() !== 0) diasLaborables++;
        }
    }

    const sql = `
        SELECT 
            t.Id_Trabajador,
            t.NombreCompleto,
            COUNT(DISTINCT a.fecha) AS dias_asistidos,
            SUM(CASE WHEN a.estado = 'completo' THEN 1 ELSE 0 END) AS jornadas_completas,
            SUM(TIMESTAMPDIFF(MINUTE,
                CONCAT(a.fecha, ' ', a.hora_entrada),
                CONCAT(a.fecha, ' ', COALESCE(a.hora_salida, a.hora_entrada))
            )) AS total_minutos
        FROM trabajadores t
        LEFT JOIN asistencia_registros a ON t.Id_Trabajador = a.id_vendedor
            ${whereCondition.replace('WHERE', 'AND')}
        WHERE t.Activo = 1
        GROUP BY t.Id_Trabajador, t.NombreCompleto
        ORDER BY t.NombreCompleto
    `;

    const sqlRegistros = `
        SELECT 
            a.id,
            a.id_vendedor,
            a.fecha,
            a.hora_entrada,
            a.hora_salida,
            a.estado,
            t.NombreCompleto AS nombre_trabajador,
            TIMESTAMPDIFF(MINUTE,
                CONCAT(a.fecha, ' ', a.hora_entrada),
                CONCAT(a.fecha, ' ', COALESCE(a.hora_salida, a.hora_entrada))
            ) AS minutos_trabajados
        FROM asistencia_registros a
        INNER JOIN trabajadores t ON a.id_vendedor = t.Id_Trabajador
        ${whereCondition}
        ORDER BY a.fecha DESC, t.NombreCompleto ASC
    `;

    Promise.all([
        db.promise().query(sql, params),
        db.promise().query(sqlRegistros, params)
    ]).then(([resumenR, registrosR]) => {
        const resumen = resumenR[0].map(r => {
            const diasAsistidos = parseInt(r.dias_asistidos) || 0;
            const porcentaje = diasLaborables > 0
                ? parseFloat(((diasAsistidos / diasLaborables) * 100).toFixed(2))
                : 0;
            const totalMinutos = parseInt(r.total_minutos) || 0;
            return {
                id_trabajador: r.Id_Trabajador,
                nombre: r.NombreCompleto,
                dias_asistidos: diasAsistidos,
                jornadas_completas: parseInt(r.jornadas_completas) || 0,
                total_horas: parseFloat((totalMinutos / 60).toFixed(2)),
                porcentaje_asistencia: porcentaje
            };
        });

        res.json({
            dias_laborables: diasLaborables,
            total_trabajadores: resumen.length,
            resumen,
            registros: registrosR[0]
        });
    }).catch(err => {
        console.error('Error en /api/reportes/asistencia:', err);
        res.status(500).json({ error: err.message });
    });
});

// Reporte de mercancía ingresada por proveedor
app.get('/api/reportes/mercancia-proveedor', (req, res) => {
    const { desde, hasta, id_proveedor } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (desde) {
        whereCondition += ' AND a.FechaEntrada >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND a.FechaEntrada <= ?';
        params.push(hasta);
    }
    if (id_proveedor) {
        whereCondition += ' AND a.Id_Proveedor = ?';
        params.push(id_proveedor);
    }

    const sql = `
        SELECT 
            a.Id_Proveedor,
            prov.Nombre AS Nombre_Proveedor,
            prov.Empresa AS Empresa_Proveedor,
            a.Id_Producto,
            p.Nombre AS Nombre_Producto,
            p.Marca AS Marca_Producto,
            a.Cantidad_Entrada,
            a.Precio_Compra,
            a.FechaEntrada,
            (a.Cantidad_Entrada * a.Precio_Compra) AS Total_Invertido
        FROM abastecimiento a
        INNER JOIN proveedores prov ON a.Id_Proveedor = prov.Id_Proveedor
        INNER JOIN producto p ON a.Id_Producto = p.Id_Producto
        ${whereCondition}
        ORDER BY a.FechaEntrada DESC, prov.Nombre ASC
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        const totalUnidades = results.reduce((sum, r) => sum + (parseInt(r.Cantidad_Entrada) || 0), 0);
        const totalInvertido = results.reduce((sum, r) => sum + (parseFloat(r.Total_Invertido) || 0), 0);

        res.json({
            total_registros: results.length,
            total_unidades: totalUnidades,
            total_invertido: totalInvertido,
            registros: results
        });
    });
});

// Reporte de existencias
app.get('/api/reportes/existencias', (req, res) => {
    const { categoria, solo_bajo_stock } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (categoria) {
        whereCondition += ' AND p.Id_Categoria = ?';
        params.push(categoria);
    }

    const sql = `
        SELECT 
            p.Id_Producto AS Codigo,
            p.Nombre,
            COALESCE(c.Nombre, 'Sin Categoría') AS Categoria,
            COALESCE(SUM(s.Cantidad), 0) AS Cantidad_Disponible,
            10 AS Nivel_Minimo_Stock,
            COALESCE(e.Nombre_Estado, 'Disponible') AS Estado,
            p.Precio,
            p.Marca
        FROM producto p
        LEFT JOIN categoria c ON p.Id_Categoria = c.Id_Categoria
        LEFT JOIN estado e ON p.Id_Estado = e.Id_Estado
        LEFT JOIN stock s ON p.Id_Producto = s.Id_Producto
        ${whereCondition}
        GROUP BY p.Id_Producto, p.Nombre, c.Nombre, e.Nombre_Estado, p.Precio, p.Marca
        ORDER BY p.Nombre ASC
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        let productos = results.map(r => ({
            ...r,
            Cantidad_Disponible: parseInt(r.Cantidad_Disponible) || 0,
            bajo_stock: (parseInt(r.Cantidad_Disponible) || 0) < 10
        }));

        if (solo_bajo_stock === 'true') {
            productos = productos.filter(p => p.bajo_stock);
        }

        res.json({
            total_productos: productos.length,
            total_bajo_stock: productos.filter(p => p.bajo_stock).length,
            total_unidades: productos.reduce((sum, p) => sum + p.Cantidad_Disponible, 0),
            productos
        });
    });
});

// Reporte de mermas y pérdidas
app.get('/api/reportes/mermas-perdidas', (req, res) => {
    const { desde, hasta, id_producto, motivo } = req.query;

    let whereCondition = 'WHERE 1=1';
    let params = [];

    if (desde) {
        whereCondition += ' AND pd.Fecha >= ?';
        params.push(desde);
    }
    if (hasta) {
        whereCondition += ' AND pd.Fecha <= ?';
        params.push(hasta);
    }
    if (id_producto) {
        whereCondition += ' AND m.Id_Producto = ?';
        params.push(id_producto);
    }
    if (motivo) {
        whereCondition += ' AND LOWER(m.Motivo) LIKE ?';
        params.push('%' + motivo.toLowerCase() + '%');
    }

    const sql = `
        SELECT 
            m.Id_Perdida,
            m.Id_Producto,
            p.Nombre AS Nombre_Producto,
            p.Marca,
            COALESCE(c.Nombre, 'Sin Categoría') AS Categoria,
            m.Cantidad,
            m.Motivo,
            pd.Fecha
        FROM merma m
        INNER JOIN perdida pd ON m.Id_Perdida = pd.Id_Perdida
        INNER JOIN producto p ON m.Id_Producto = p.Id_Producto
        LEFT JOIN categoria c ON p.Id_Categoria = c.Id_Categoria
        ${whereCondition}
        ORDER BY pd.Fecha DESC, m.Cantidad DESC
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });

        const totalUnidades = results.reduce((sum, r) => sum + (parseInt(r.Cantidad) || 0), 0);

        const porMotivo = {};
        results.forEach(r => {
            const m = r.Motivo || 'Sin motivo';
            if (!porMotivo[m]) porMotivo[m] = { motivo: m, cantidad: 0, registros: 0 };
            porMotivo[m].cantidad += parseInt(r.Cantidad) || 0;
            porMotivo[m].registros++;
        });

        res.json({
            total_registros: results.length,
            total_unidades_perdidas: totalUnidades,
            por_motivo: Object.values(porMotivo).sort((a, b) => b.cantidad - a.cantidad),
            registros: results
        });
    });
});

// Reporte de desempeño e incentivo mensual
app.get('/api/reportes/desempeno-incentivo', (req, res) => {
    const { anio, mes } = req.query;

    const anioNum = parseInt(anio) || new Date().getFullYear();
    const mesNum = parseInt(mes) || (new Date().getMonth() + 1);

    const primerDia = `${anioNum}-${String(mesNum).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anioNum, mesNum, 0).toISOString().split('T')[0];

    db.query(`SELECT * FROM configuracion_incentivos WHERE id = 1`, (errConfig, configR) => {
        if (errConfig) return res.status(500).json({ error: errConfig.sqlMessage });

        const config = (configR && configR[0]) || {
            porcentaje_minimo_asistencia: 80,
            monto_incentivo_1: 1500,
            monto_incentivo_2: 1000,
            monto_incentivo_3: 500
        };

        let diasLaborables = 0;
        const totalDias = new Date(anioNum, mesNum, 0).getDate();
        for (let d = 1; d <= totalDias; d++) {
            if (new Date(anioNum, mesNum - 1, d).getDay() !== 0) diasLaborables++;
        }

        db.query(`SELECT Id_Trabajador, NombreCompleto FROM trabajadores WHERE Activo = 1 ORDER BY NombreCompleto`, (errTrab, trabajadores) => {
            if (errTrab) return res.status(500).json({ error: errTrab.sqlMessage });
            if (trabajadores.length === 0) {
                return res.json({
                    anio: anioNum, mes: mesNum,
                    dias_laborables: diasLaborables,
                    porcentaje_minimo: config.porcentaje_minimo_asistencia,
                    mejor_desempeno: null,
                    incentivo: 0,
                    trabajadores: []
                });
            }

            const resultados = [];
            let completados = 0;

            trabajadores.forEach(trab => {
                const sqlAsist = `
                    SELECT COUNT(DISTINCT fecha) AS dias_asistidos
                    FROM asistencia_registros
                    WHERE id_vendedor = ? AND fecha BETWEEN ? AND ? AND hora_entrada IS NOT NULL
                `;
                db.query(sqlAsist, [trab.Id_Trabajador, primerDia, ultimoDia], (errA, asistR) => {
                    if (errA) { completados++; return; }

                    const diasAsistidos = (asistR[0] && asistR[0].dias_asistidos) || 0;
                    const porcentajeAsistencia = diasLaborables > 0
                        ? parseFloat(((diasAsistidos / diasLaborables) * 100).toFixed(2)) : 0;

                    const sqlVentas = `
                        SELECT 
                            COUNT(DISTINCT Num_Factura) AS total_facturas,
                            COALESCE(SUM(Monto), 0) AS total_monto
                        FROM compra
                        WHERE Id_Vendedor = ? AND Fecha BETWEEN ? AND ?
                    `;
                    db.query(sqlVentas, [trab.Id_Trabajador, primerDia, ultimoDia], (errV, ventasR) => {
                        if (errV) { completados++; return; }

                        const ventas = (ventasR && ventasR[0]) || { total_facturas: 0, total_monto: 0 };
                        const cumple = porcentajeAsistencia >= config.porcentaje_minimo_asistencia;
                        const puntaje = cumple
                            ? parseFloat(((ventas.total_facturas * 0.5) + (porcentajeAsistencia * 0.5)).toFixed(2))
                            : 0;

                        resultados.push({
                            id_trabajador: trab.Id_Trabajador,
                            nombre_completo: trab.NombreCompleto,
                            total_ventas: parseInt(ventas.total_facturas) || 0,
                            total_monto: parseFloat(ventas.total_monto) || 0,
                            dias_asistidos: diasAsistidos,
                            porcentaje_asistencia: porcentajeAsistencia,
                            cumple_asistencia: cumple,
                            puntaje: puntaje
                        });

                        completados++;
                        if (completados === trabajadores.length) {
                            resultados.sort((a, b) => b.puntaje - a.puntaje);
                            const elegibles = resultados.filter(r => r.cumple_asistencia);
                            let mejor = null;
                            let incentivoMonto = 0;

                            if (elegibles.length > 0) {
                                mejor = { ...elegibles[0] };
                                incentivoMonto = config.monto_incentivo_1;
                                mejor.incentivo = incentivoMonto;
                            }

                            res.json({
                                anio: anioNum,
                                mes: mesNum,
                                dias_laborables: diasLaborables,
                                porcentaje_minimo: config.porcentaje_minimo_asistencia,
                                mejor_desempeno: mejor,
                                incentivo: incentivoMonto,
                                monto_incentivo_1: config.monto_incentivo_1,
                                monto_incentivo_2: config.monto_incentivo_2,
                                monto_incentivo_3: config.monto_incentivo_3,
                                trabajadores: resultados
                            });
                        }
                    });
                });
            });
        });
    });
});

// Configuración de incentivos
app.get('/api/configuracion-incentivos', (req, res) => {
    db.query(`SELECT * FROM configuracion_incentivos WHERE id = 1`, (err, results) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        if (results.length === 0) {
            return res.json({
                porcentaje_minimo_asistencia: 80.00,
                monto_incentivo_1: 1500.00,
                monto_incentivo_2: 1000.00,
                monto_incentivo_3: 500.00
            });
        }
        res.json(results[0]);
    });
});

app.put('/api/configuracion-incentivos', (req, res) => {
    const { porcentaje_minimo_asistencia, monto_incentivo_1, monto_incentivo_2, monto_incentivo_3 } = req.body;

    if (porcentaje_minimo_asistencia === undefined || isNaN(porcentaje_minimo_asistencia)) {
        return res.status(400).json({ error: 'El porcentaje mínimo es requerido' });
    }
    if (porcentaje_minimo_asistencia < 0 || porcentaje_minimo_asistencia > 100) {
        return res.status(400).json({ error: 'El porcentaje debe estar entre 0 y 100' });
    }
    if (monto_incentivo_1 < 0 || monto_incentivo_2 < 0 || monto_incentivo_3 < 0) {
        return res.status(400).json({ error: 'Los montos no pueden ser negativos' });
    }

    const sql = `
        INSERT INTO configuracion_incentivos 
        (id, porcentaje_minimo_asistencia, monto_incentivo_1, monto_incentivo_2, monto_incentivo_3)
        VALUES (1, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            porcentaje_minimo_asistencia = VALUES(porcentaje_minimo_asistencia),
            monto_incentivo_1 = VALUES(monto_incentivo_1),
            monto_incentivo_2 = VALUES(monto_incentivo_2),
            monto_incentivo_3 = VALUES(monto_incentivo_3)
    `;

    db.query(sql, [porcentaje_minimo_asistencia, monto_incentivo_1, monto_incentivo_2, monto_incentivo_3], (err) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ success: true, message: 'Configuración actualizada correctamente' });
    });
});

// Reporte desempeño mensual
app.get('/api/desempeno-mensual', (req, res) => {
    const { anio, mes } = req.query;

    if (!anio || !mes) {
        return res.status(400).json({ error: 'Año y mes son requeridos' });
    }

    const anioNum = parseInt(anio);
    const mesNum = parseInt(mes);

    if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ error: 'Año o mes inválidos' });
    }

    const primerDia = `${anioNum}-${String(mesNum).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anioNum, mesNum, 0).toISOString().split('T')[0];

    db.query(`SELECT * FROM configuracion_incentivos WHERE id = 1`, (errConfig, configResults) => {
        if (errConfig) return res.status(500).json({ error: errConfig.sqlMessage });

        const config = (configResults && configResults[0]) || {
            porcentaje_minimo_asistencia: 80.00,
            monto_incentivo_1: 1500.00,
            monto_incentivo_2: 1000.00,
            monto_incentivo_3: 500.00
        };

        let diasLaborables = 0;
        const totalDias = new Date(anioNum, mesNum, 0).getDate();
        for (let d = 1; d <= totalDias; d++) {
            if (new Date(anioNum, mesNum - 1, d).getDay() !== 0) diasLaborables++;
        }

        db.query(`
            SELECT Id_Trabajador, NombreCompleto, Celular, es_cajero
            FROM trabajadores 
            WHERE Activo = 1
            ORDER BY NombreCompleto
        `, (errTrab, trabajadores) => {
            if (errTrab) return res.status(500).json({ error: errTrab.sqlMessage });
            if (trabajadores.length === 0) {
                return res.json({
                    anio: anioNum,
                    mes: mesNum,
                    dias_laborables: diasLaborables,
                    porcentaje_minimo: config.porcentaje_minimo_asistencia,
                    mejor_desempeno: null,
                    incentivo_1: config.monto_incentivo_1,
                    incentivo_2: config.monto_incentivo_2,
                    incentivo_3: config.monto_incentivo_3,
                    trabajadores: []
                });
            }

            const resultados = [];
            let completados = 0;

            trabajadores.forEach(trab => {
                const sqlAsistencia = `
                    SELECT COUNT(DISTINCT fecha) AS dias_asistidos
                    FROM asistencia_registros
                    WHERE id_vendedor = ?
                      AND fecha BETWEEN ? AND ?
                      AND hora_entrada IS NOT NULL
                `;

                db.query(sqlAsistencia, [trab.Id_Trabajador, primerDia, ultimoDia], (errAsist, asistResults) => {
                    if (errAsist) {
                        console.error('Error asistencia:', errAsist);
                        completados++;
                        return;
                    }

                    const diasAsistidos = (asistResults[0] && asistResults[0].dias_asistidos) || 0;
                    const porcentajeAsistencia = diasLaborables > 0
                        ? parseFloat(((diasAsistidos / diasLaborables) * 100).toFixed(2))
                        : 0;

                    const sqlVentas = `
                        SELECT 
                            COUNT(DISTINCT Num_Factura) AS total_facturas,
                            COALESCE(SUM(Monto), 0) AS total_monto,
                            COUNT(DISTINCT DATE(Fecha)) AS dias_con_ventas
                        FROM compra
                        WHERE Id_Vendedor = ?
                          AND Fecha BETWEEN ? AND ?
                    `;

                    db.query(sqlVentas, [trab.Id_Trabajador, primerDia, ultimoDia], (errVentas, ventasResults) => {
                        if (errVentas) {
                            console.error('Error ventas:', errVentas);
                            completados++;
                            return;
                        }

                        const ventas = (ventasResults && ventasResults[0]) || { total_facturas: 0, total_monto: 0, dias_con_ventas: 0 };
                        const totalFacturas = parseInt(ventas.total_facturas) || 0;
                        const totalMonto = parseFloat(ventas.total_monto) || 0;
                        const diasConVentas = parseInt(ventas.dias_con_ventas) || 0;
                        const promedioDiario = diasConVentas > 0
                            ? parseFloat((totalFacturas / diasConVentas).toFixed(2))
                            : 0;

                        const cumpleAsistencia = porcentajeAsistencia >= config.porcentaje_minimo_asistencia;

                        let puntaje = 0;
                        if (cumpleAsistencia) {
                            puntaje = parseFloat(
                                ((totalFacturas * 0.5) + (porcentajeAsistencia * 0.5)).toFixed(2)
                            );
                        }

                        resultados.push({
                            id_trabajador: trab.Id_Trabajador,
                            nombre_completo: trab.NombreCompleto,
                            es_cajero: trab.es_cajero === 1,
                            dias_asistidos: diasAsistidos,
                            dias_laborables: diasLaborables,
                            porcentaje_asistencia: porcentajeAsistencia,
                            total_facturas: totalFacturas,
                            total_monto: totalMonto,
                            dias_con_ventas: diasConVentas,
                            promedio_diario: promedioDiario,
                            cumple_asistencia: cumpleAsistencia,
                            puntaje: puntaje
                        });

                        completados++;

                        if (completados === trabajadores.length) {
                            resultados.sort((a, b) => {
                                if (a.cumple_asistencia && !b.cumple_asistencia) return -1;
                                if (!a.cumple_asistencia && b.cumple_asistencia) return 1;
                                return b.puntaje - a.puntaje;
                            });

                            const elegibles = resultados.filter(r => r.cumple_asistencia);
                            let mejorDesempeno = null;

                            if (elegibles.length > 0) {
                                mejorDesempeno = { ...elegibles[0] };
                                let nivelIncentivo = 1;
                                let montoIncentivo = config.monto_incentivo_1;

                                if (elegibles.length === 1) {
                                    nivelIncentivo = 1;
                                    montoIncentivo = config.monto_incentivo_1;
                                } else if (elegibles.length >= 3) {
                                    elegibles[0].incentivo = config.monto_incentivo_1;
                                    elegibles[0].posicion = 1;
                                    elegibles[1].incentivo = config.monto_incentivo_2;
                                    elegibles[1].posicion = 2;
                                    elegibles[2].incentivo = config.monto_incentivo_3;
                                    elegibles[2].posicion = 3;
                                } else if (elegibles.length === 2) {
                                    elegibles[0].incentivo = config.monto_incentivo_1;
                                    elegibles[0].posicion = 1;
                                    elegibles[1].incentivo = config.monto_incentivo_2;
                                    elegibles[1].posicion = 2;
                                }

                                mejorDesempeno.incentivo = montoIncentivo;
                                mejorDesempeno.posicion = nivelIncentivo;
                                mejorDesempeno.nombre = mejorDesempeno.nombre_completo;
                            }

                            res.json({
                                anio: anioNum,
                                mes: mesNum,
                                dias_laborables: diasLaborables,
                                porcentaje_minimo: config.porcentaje_minimo_asistencia,
                                mejor_desempeno: mejorDesempeno,
                                incentivo_1: config.monto_incentivo_1,
                                incentivo_2: config.monto_incentivo_2,
                                incentivo_3: config.monto_incentivo_3,
                                trabajadores: resultados
                            });
                        }
                    });
                });
            });
        });
    });
});

// =====================================================
// RUTAS DE ARCHIVOS HTML
// =====================================================
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
        return res.status(401).json({ autenticado: false, mensaje: 'No hay sesion activa' });
    }
    res.json({ autenticado: true });
});

// =====================================================
// RECUPERACIÓN UNIFICADA (ADMIN + TRABAJADOR)
// =====================================================
app.post('/api/recuperar-password-unificado', (req, res) => {
    const { email } = req.body;
    
    if (!email || email.trim() === '') {
        return res.status(400).json({ success: false, message: 'Por favor, ingrese su correo electronico' });
    }
    
    db.query(`SELECT id, usuario, email, 'admin' as tipo FROM usuarios_admin WHERE email = ?`, [email], (err, adminResults) => {
        if (err) {
            console.error('Error en recuperacion admin:', err);
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
                subject: 'Recuperacion de Contrasena - Tienda Chepita',
                html: `
                    <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                        <h2 style="color: #A63C89;">Recuperacion de Contrasena</h2>
                        <p>Hola <strong>${admin.usuario}</strong>,</p>
                        <p>Hemos recibido una solicitud para restablecer tu contrasena.</p>
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Restablecer Contrasena</a>
                        </div>
                        <p style="color: #666;">Este enlace es valido por 1 hora.</p>
                        <hr>
                        <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestion Comercial</p>
                    </div>
                `
            };
            
            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.error('Error al enviar email admin:', error);
                    return res.status(500).json({ success: false, message: 'Error al enviar el correo.' });
                }
                console.log(`Email de recuperacion enviado a ADMIN: ${email}`);
                res.json({ success: true, message: 'Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena.' });
            });
        } else {
            db.query(`SELECT Id_Trabajador, NombreCompleto, email, 'trabajador' as tipo FROM trabajadores WHERE email = ? AND Activo = 1`, [email], (err, trabajadoresResults) => {
                if (err) {
                    console.error('Error en recuperacion trabajador:', err);
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
                            subject: 'Recuperacion de Contrasena - Tienda Chepita',
                            html: `
                                <div style="font-family: Arial, sans-serif; border: 2px solid #A63C89; padding: 20px; border-radius: 10px;">
                                    <h2 style="color: #A63C89;">Recuperacion de Contrasena</h2>
                                    <p>Hola <strong>${trabajador.NombreCompleto}</strong>,</p>
                                    <p>Hemos recibido una solicitud para restablecer tu contrasena.</p>
                                    <div style="text-align: center; margin: 25px 0;">
                                        <a href="${resetLink}" style="background-color: #A63C89; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Restablecer Contrasena</a>
                                    </div>
                                    <p style="color: #666;">Este enlace es valido por 1 hora.</p>
                                    <hr>
                                    <p style="color: #999; font-size: 11px;">Tienda Chepita - Sistema de Gestion Comercial</p>
                                </div>
                            `
                        };
                        
                        transporter.sendMail(mailOptions, (error) => {
                            if (error) {
                                console.error('Error al enviar email trabajador:', error);
                                return res.status(500).json({ success: false, message: 'Error al enviar el correo.' });
                            }
                            console.log(`Email de recuperacion enviado a TRABAJADOR: ${email}`);
                            res.json({ success: true, message: 'Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena.' });
                        });
                    });
                } else {
                    console.log(`Correo no registrado: ${email}`);
                    res.json({ success: true, message: 'Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena.' });
                }
            });
        }
    });
});

app.get('/vendedor_app.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'vendedor_app.html'));
});

app.get('/admin_App.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin_App.html'));
});

// =====================================================
// INICIO DEL SERVIDOR
// =====================================================
setTimeout(() => {
    crearProcedimientosSiNoExisten();
    verificarEstructuraTabla();
}, 2000);

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    CAJA LOCAL - SISTEMA CHEPITA
    Puerto: ${PORT}
    URL: http://localhost:${PORT}
    Base de datos: XAMPP (local)
    Asistencia App Movil: ACTIVADA
    Sistema de Tickets: ACTIVADO
    Sistema de Puntos: ACTIVADO
    QR Vendedores: ACTIVADO
    Movimientos de Inventario: ACTIVADO
    Regalias Proveedores: ACTIVADO
    Ingreso de Mercancia: ACTIVADO
    Pagos Mixtos (REQ-FR-22): ACTIVADO
    Asistencia por Trabajador (REQ-FR-31): ACTIVADO
    Devoluciones a Proveedores: ACTIVADO
    `);
});