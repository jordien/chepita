// ============================================================
// APP.JS - CHEPITA VENDEDOR
// ============================================================
// Este archivo contiene toda la aplicación en un solo lugar
// con comentarios detallados para facilitar su comprensión
// y modificación.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
// ============================================================
// IMPORTS DE REACT NATIVE
// ============================================================
import {
  View,           // Contenedor principal (similar a <div>)
  Text,           // Para mostrar texto
  TextInput,      // Campo de entrada de texto
  TouchableOpacity, // Botón con efecto táctil
  StyleSheet,     // Para estilos (similar a CSS)
  Image,          // Para mostrar imágenes
  Modal,          // Ventana emergente
  Alert,          // Alertas nativas
  ActivityIndicator, // Círculo de carga
  ScrollView,     // Para scroll
  KeyboardAvoidingView, // Evita que el teclado tape campos
  Platform,       // Detecta si es iOS o Android
  Animated,       // Para animaciones
  Dimensions,     // Para obtener tamaño de pantalla
} from 'react-native';

// ============================================================
// IMPORTS DE DEPENDENCIAS EXTERNAS
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
// ^ Guarda datos localmente en el teléfono (similar a localStorage)

// ============================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================

// Obtener dimensiones de la pantalla para diseño responsive
const { width, height } = Dimensions.get('window');

// URL de tu API - CAMBIA ESTO POR TU IP LOCAL
// Ejemplo: http://192.168.1.100:3000
const API_URL = 'http://192.168.1.100:3000';

// ============================================================
// PALETA DE COLORES (igual a tu PAG.css)
// ============================================================
const COLORS = {
  primary: '#c02e8a',        // Color principal (rosa/morado)
  primaryLight: '#d96bb3',   // Rosa más claro
  secondary: '#caa0d8',      // Morado claro
  dark: '#6b4c7a',           // Morado oscuro
  text: '#1e293b',           // Color de texto principal
  textLight: '#64748b',      // Texto secundario
  white: '#ffffff',          // Blanco
  error: '#dc2626',          // Rojo para errores
  warning: '#d97706',        // Amarillo para advertencias
  background: '#f5f0f8',     // Fondo general
};

// ============================================================
// COMPONENTE PRINCIPAL - LOGIN
// ============================================================
const App = () => {
  // ==========================================================
  // ESTADOS (State) - Variables que cambian y afectan la UI
  // ==========================================================
  
  // Estados para el formulario de login
  const [usuario, setUsuario] = useState('');        // Usuario ingresado
  const [password, setPassword] = useState('');      // Contraseña ingresada
  const [loading, setLoading] = useState(false);     // Muestra carga
  const [error, setError] = useState('');            // Mensaje de error
  
  // Estados para búsqueda de usuarios (como en tu PAG.html)
  const [busqueda, setBusqueda] = useState('');                // Texto de búsqueda
  const [usuarios, setUsuarios] = useState([]);               // Lista de usuarios
  const [sugerencias, setSugerencias] = useState([]);         // Sugerencias filtradas
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false); // Mostrar/ocultar
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null); // Usuario elegido
  
  // Estados para recuperación de contraseña
  const [modalVisible, setModalVisible] = useState(false);    // Mostrar modal
  const [emailRecuperacion, setEmailRecuperacion] = useState(''); // Email ingresado
  const [resultadoRecuperacion, setResultadoRecuperacion] = useState(''); // Mensaje resultado
  
  // Estados para fecha y hora (como en tu login)
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  
  // ==========================================================
  // ANIMACIONES
  // ==========================================================
  const fadeAnim = useRef(new Animated.Value(0)).current;     // Animación de opacidad
  const scaleAnim = useRef(new Animated.Value(0.95)).current; // Animación de escala

  // ==========================================================
  // EFECTOS (useEffect) - Se ejecutan en momentos específicos
  // ==========================================================
  
  // Efecto 1: Al cargar la pantalla
  useEffect(() => {
    cargarUsuarios();           // Carga la lista de usuarios
    actualizarFechaHora();      // Muestra fecha y hora actual
    const interval = setInterval(actualizarFechaHora, 60000); // Actualiza cada minuto

    // Animación de entrada (fade in + scale)
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Limpieza del intervalo cuando el componente se destruye
    return () => clearInterval(interval);
  }, []);

  // ==========================================================
  // FUNCIONES - LÓGICA DE NEGOCIO
  // ==========================================================

  /**
   * FUNCIÓN: actualizarFechaHora
   * Actualiza la fecha y hora actual en los estados
   * Similar a la función en tu PAG.html
   */
  const actualizarFechaHora = () => {
    const ahora = new Date();
    const opcionesFecha = { year: 'numeric', month: 'long', day: 'numeric' };
    setFecha(ahora.toLocaleDateString('es-ES', opcionesFecha));
    setHora(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
  };

  /**
   * FUNCIÓN: cargarUsuarios
   * Obtiene la lista de trabajadores activos desde la API
   * Similar a tu función cargarUsuarios() en PAG.html
   */
  const cargarUsuarios = async () => {
    try {
      const response = await fetch(`${API_URL}/api/trabajadores/activos`);
      const data = await response.json();
      setUsuarios(data);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
    }
  };

  /**
   * FUNCIÓN: mostrarSugerencias
   * Filtra usuarios según el texto de búsqueda
   * Solo muestra cajeros (es_cajero = 1) + administrador
   * Similar a tu función mostrarSugerencias() en PAG.html
   */
  const mostrarSugerencias = (texto) => {
    const busquedaLower = texto.toLowerCase().trim();
    setBusqueda(texto);

    // Si el campo está vacío, ocultar sugerencias
    if (busquedaLower === '') {
      setMostrarSugerencias(false);
      setSugerencias([]);
      return;
    }

    let coincidencias = [];

    // Administrador virtual (como en tu PAG.html)
    if (busquedaLower === 'admin' || busquedaLower === 'administrador') {
      coincidencias.push({
        Id_Trabajador: 0,
        NombreCompleto: 'Administrador',
        tipo: 'admin',
        es_cajero: 0,
      });
    }

    // Filtrar SOLO cajeros (es_cajero = 1)
    const trabajadoresCoincidentes = usuarios.filter(
      (t) =>
        t.es_cajero === 1 &&
        t.NombreCompleto.toLowerCase().includes(busquedaLower)
    );
    coincidencias = [...coincidencias, ...trabajadoresCoincidentes];

    setSugerencias(coincidencias);
    setMostrarSugerencias(coincidencias.length > 0);
  };

  /**
   * FUNCIÓN: seleccionarUsuario
   * Cuando el usuario hace clic en una sugerencia
   * Similar a tu función seleccionarUsuario() en PAG.html
   */
  const seleccionarUsuario = (usuario) => {
    setUsuarioSeleccionado(usuario);
    setBusqueda(usuario.NombreCompleto);
    setMostrarSugerencias(false);
    setError('');
  };

  /**
   * FUNCIÓN: limpiarSeleccion
   * Limpia la selección de usuario
   * Similar a tu función limpiarSeleccion() en PAG.html
   */
  const limpiarSeleccion = () => {
    setUsuarioSeleccionado(null);
    setBusqueda('');
    setPassword('');
    setError('');
  };

  /**
   * FUNCIÓN: handleLogin - LA MÁS IMPORTANTE
   * Maneja el inicio de sesión
   * Mantiene tu lógica actual de autenticación
   */
  const handleLogin = async () => {
    // Validaciones (como en tu PAG.html)
    if (!usuarioSeleccionado) {
      setError('Seleccione un usuario de la lista');
      return;
    }

    if (!password) {
      setError('Ingrese su contraseña');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let response;

      // LOGIN DE ADMINISTRADOR
      if (usuarioSeleccionado.tipo === 'admin') {
        response = await fetch(`${API_URL}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: 'admin', password }),
        });
      } 
      // LOGIN DE TRABAJADOR (CAJERO)
      else {
        response = await fetch(`${API_URL}/api/trabajadores/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre_usuario: usuarioSeleccionado.NombreCompleto,
            password,
          }),
        });
      }

      const data = await response.json();

      // Si el login fue exitoso
      if (data.success) {
        // Guardar datos en AsyncStorage (como localStorage en web)
        await AsyncStorage.setItem('token', data.token);
        await AsyncStorage.setItem('sesionIniciada', 'true');

        // Redirigir según el tipo de usuario
        if (usuarioSeleccionado.tipo === 'admin') {
          await AsyncStorage.setItem('tipoUsuario', 'admin');
          // Aquí iría la navegación a menu_admin
          Alert.alert('Éxito', 'Bienvenido Administrador');
        } else {
          await AsyncStorage.setItem('tipoUsuario', 'caja');
          await AsyncStorage.setItem('trabajador', JSON.stringify(data.trabajador));
          // Aquí iría la navegación a menu_caja
          Alert.alert('Éxito', `Bienvenido ${usuarioSeleccionado.NombreCompleto}`);
        }
      } else {
        // Mostrar mensaje de error (como en tu PAG.html)
        const mensaje = data.message || 'Contraseña incorrecta';
        if (mensaje.includes('bloqueada') || mensaje.includes('intento')) {
          setError(mensaje);
        } else {
          setError(mensaje);
        }
        setPassword('');
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  /**
   * FUNCIÓN: solicitarRecuperacion
   * Maneja la recuperación de contraseña
   * Similar a tu función solicitarRecuperacion() en PAG.html
   */
  const solicitarRecuperacion = async () => {
    if (!emailRecuperacion) {
      setResultadoRecuperacion('Ingrese su correo electrónico');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/recuperar-password-unificado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailRecuperacion }),
      });

      const data = await response.json();
      setResultadoRecuperacion(
        data.message || 'Si el correo está registrado, recibirás un enlace'
      );
    } catch (error) {
      setResultadoRecuperacion('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  /**
   * FUNCIÓN: renderSugerencia
   * Renderiza cada ítem de la lista de sugerencias
   * Similar a tu HTML dinámico en PAG.html
   */
  const renderSugerencia = (item) => {
    const esAdmin = item.tipo === 'admin' || item.Id_Trabajador === 0;
    const rol = esAdmin ? 'Administrador' : 'Cajero';

    return (
      <TouchableOpacity
        key={item.Id_Trabajador || 'admin'}
        style={styles.sugerenciaItem}
        onPress={() => seleccionarUsuario(item)}
      >
        <View style={styles.sugerenciaInfo}>
          <Text style={styles.sugerenciaNombre}>{item.NombreCompleto}</Text>
          <Text style={styles.sugerenciaRol}>
            {rol}
            {!esAdmin && <Text style={styles.badgeCajero}> Caja</Text>}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ==========================================================
  // RENDER - INTERFAZ DE USUARIO (UI)
  // ==========================================================

  return (
    // ==========================================================
    // CONTENEDOR PRINCIPAL
    // ==========================================================
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ==========================================================
          FONDO DECORATIVO (Círculos animados como en PAG.css)
          ========================================================== */}
      <View style={styles.fondoDecorativo}>
        <View style={[styles.circulo, styles.circulo1]} />
        <View style={[styles.circulo, styles.circulo2]} />
        <View style={[styles.circulo, styles.circulo3]} />
        <View style={[styles.circulo, styles.circulo4]} />
      </View>

      {/* ==========================================================
          TARJETA PRINCIPAL (Glassmorphism como en PAG.css)
          ========================================================== */}
      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* ==========================================================
              HEADER - LOGO Y TÍTULO
              ========================================================== */}
          <View style={styles.loginHeader}>
            {/* Logo de la empresa */}
            <Image
              source={require('./assets/LOGOCHEPITA.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Bienvenido</Text>
            <Text style={styles.subtitle}>
              Sistema de Gestión de Variedades Chepita
            </Text>
            
            {/* Fecha y hora (como en tu PAG.html) */}
            <View style={styles.fechaContainer}>
              <Text style={styles.fechaTexto}>{fecha}</Text>
              <Text style={styles.fechaTexto}>·</Text>
              <Text style={styles.fechaTexto}>{hora}</Text>
            </View>
          </View>

          {/* ==========================================================
              USUARIO SELECCIONADO
              ========================================================== */}
          {usuarioSeleccionado && (
            <View style={styles.selectedUser}>
              <View style={styles.selectedUserInfo}>
                <Text style={styles.selectedUserNombre}>
                  {usuarioSeleccionado.NombreCompleto}
                </Text>
                <Text style={styles.selectedUserRol}>
                  {usuarioSeleccionado.tipo === 'admin' ? 'Administrador' : 'Cajero'}
                </Text>
              </View>
              <TouchableOpacity onPress={limpiarSeleccion}>
                <Text style={styles.selectedUserClear}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ==========================================================
              CAMPO DE BÚSQUEDA DE USUARIO
              ========================================================== */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>BUSCAR USUARIO</Text>
            <View style={styles.searchWrapper}>
              <TextInput
                style={[styles.input, mostrarSugerencias && styles.inputAbierto]}
                placeholder="Escriba su nombre..."
                placeholderTextColor={COLORS.textLight}
                value={busqueda}
                onChangeText={mostrarSugerencias}
                onFocus={() => busqueda.trim() && setMostrarSugerencias(true)}
              />
              
              {/* Lista de sugerencias (como en tu PAG.html) */}
              {mostrarSugerencias && sugerencias.length > 0 && (
                <View style={styles.sugerenciasContainer}>
                  <ScrollView nestedScrollEnabled>
                    {sugerencias.map(renderSugerencia)}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          {/* ==========================================================
              CAMPO DE CONTRASEÑA
              ========================================================== */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>CONTRASEÑA</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingrese su contraseña"
              placeholderTextColor={COLORS.textLight}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!!usuarioSeleccionado}
            />
          </View>

          {/* ==========================================================
              BOTÓN DE INICIO DE SESIÓN
              ========================================================== */}
          <TouchableOpacity
            style={styles.btnSubmit}
            onPress={handleLogin}
            disabled={loading}
          >
            <View style={styles.gradientButton}>
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.btnText}>Iniciar Sesión</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* ==========================================================
              MENSAJES DE ERROR
              ========================================================== */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ==========================================================
              LINK OLVIDÉ CONTRASEÑA
              ========================================================== */}
          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => {
              setModalVisible(true);
              setEmailRecuperacion('');
              setResultadoRecuperacion('');
            }}
          >
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

        </ScrollView>
      </Animated.View>

      {/* ==========================================================
          MODAL DE RECUPERACIÓN DE CONTRASEÑA
          ========================================================== */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Recuperar Contraseña</Text>

            {!resultadoRecuperacion ? (
              <>
                <Text style={styles.modalText}>
                  Ingresa tu correo electrónico registrado:
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor={COLORS.textLight}
                  value={emailRecuperacion}
                  onChangeText={setEmailRecuperacion}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                    onPress={solicitarRecuperacion}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <Text style={styles.modalBtnText}>Enviar enlace</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSecondary]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.modalBtnTextSecondary}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalText}>{resultadoRecuperacion}</Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                    onPress={() => {
                      setModalVisible(false);
                      setResultadoRecuperacion('');
                    }}
                  >
                    <Text style={styles.modalBtnText}>Cerrar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// ============================================================
// ESTILOS (Equivalente a tu PAG.css)
// ============================================================
const styles = StyleSheet.create({
  // ==========================================================
  // CONTENEDOR PRINCIPAL
  // ==========================================================
  container: {
    flex: 1,                      // Ocupa todo el espacio disponible
    backgroundColor: COLORS.background,
    justifyContent: 'center',     // Centra verticalmente
    alignItems: 'center',         // Centra horizontalmente
  },

  // ==========================================================
  // FONDO DECORATIVO (Círculos)
  // ==========================================================
  fondoDecorativo: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  circulo: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.25,
  },
  circulo1: {
    width: 350,
    height: 350,
    backgroundColor: 'rgba(192, 46, 138, 0.25)',
    top: -80,
    right: -100,
  },
  circulo2: {
    width: 280,
    height: 280,
    backgroundColor: 'rgba(107, 76, 122, 0.18)',
    bottom: -80,
    left: -80,
  },
  circulo3: {
    width: 220,
    height: 220,
    backgroundColor: 'rgba(192, 46, 138, 0.20)',
    top: '20%',
    left: -80,
  },
  circulo4: {
    width: 180,
    height: 180,
    backgroundColor: 'rgba(192, 46, 138, 0.12)',
    bottom: '15%',
    right: 10,
  },

  // ==========================================================
  // TARJETA PRINCIPAL (Glassmorphism)
  // ==========================================================
  card: {
    width: width * 0.9,           // 90% del ancho de la pantalla
    maxWidth: 500,                // Máximo 500px
    padding: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // Efecto glass
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.15,
    shadowRadius: 60,
    elevation: 15,                // Sombra en Android
    maxHeight: height * 0.9,
  },

  // ==========================================================
  // HEADER - LOGO Y TÍTULO
  // ==========================================================
  loginHeader: {
    alignItems: 'center',
    marginBottom: 25,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 10,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 38,
    fontWeight: '700',
    color: COLORS.dark,
  },
  subtitle: {
    color: COLORS.textLight,
    fontSize: 15,
    textAlign: 'center',
  },
  fechaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  fechaTexto: {
    color: COLORS.dark,
    fontSize: 15,
    fontWeight: '600',
  },

  // ==========================================================
  // CAMPOS DE ENTRADA
  // ==========================================================
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: COLORS.textLight,
    marginBottom: 8,
  },
  input: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    fontSize: 17,
    backgroundColor: 'rgba(255, 240, 250, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    color: COLORS.text,
  },
  inputAbierto: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: 'transparent',
  },

  // ==========================================================
  // SUGERENCIAS (como en tu PAG.html)
  // ==========================================================
  searchWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  sugerenciasContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: '#d8b9d8',
    borderTopWidth: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    maxHeight: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.08,
    shadowRadius: 35,
    elevation: 5,
    zIndex: 20,
  },
  sugerenciaItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sugerenciaInfo: {
    flex: 1,
  },
  sugerenciaNombre: {
    fontWeight: '600',
    color: COLORS.text,
    fontSize: 15,
  },
  sugerenciaRol: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  badgeCajero: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    fontSize: 9,
    borderWidth: 1,
    borderColor: '#93c5fd',
    marginLeft: 5,
  },

  // ==========================================================
  // USUARIO SELECCIONADO
  // ==========================================================
  selectedUser: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.secondary,
  },
  selectedUserInfo: {
    flex: 1,
  },
  selectedUserNombre: {
    fontWeight: '700',
    fontSize: 15,
    color: COLORS.text,
  },
  selectedUserRol: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  selectedUserClear: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // ==========================================================
  // BOTÓN DE LOGIN
  // ==========================================================
  btnSubmit: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
    elevation: 8,
  },
  gradientButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary, // Color sólido (puedes usar gradiente con librería)
  },
  btnText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },

  // ==========================================================
  // MENSAJES DE ERROR
  // ==========================================================
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 14,
    marginTop: 15,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
  },

  // ==========================================================
  // LINK OLVIDÉ CONTRASEÑA
  // ==========================================================
  forgotLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotText: {
    color: COLORS.secondary,
    fontSize: 13,
  },

  // ==========================================================
  // MODAL DE RECUPERACIÓN
  // ==========================================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 28,
    width: '85%',
    maxWidth: 380,
  },
  modalTitle: {
    color: COLORS.secondary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalText: {
    color: COLORS.textLight,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 15,
  },
  modalInput: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    marginBottom: 18,
    color: COLORS.text,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 40,
    minWidth: 100,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.secondary,
  },
  modalBtnSecondary: {
    backgroundColor: '#e2e8f0',
  },
  modalBtnText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 13,
  },
  modalBtnTextSecondary: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
});

// ============================================================
// EXPORTACIÓN DEL COMPONENTE
// ============================================================
export default App;