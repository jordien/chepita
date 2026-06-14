import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import QRCode from 'react-native-qrcode-svg';
import { CountdownCircleTimer } from 'react-native-countdown-circle-timer';

let API_URL = null;

// Funciones de almacenamiento
const guardarDato = async (key, value) => {
  await SecureStore.setItemAsync(key, value);
};

const obtenerDato = async (key) => {
  return await SecureStore.getItemAsync(key);
};

const eliminarDato = async (key) => {
  await SecureStore.deleteItemAsync(key);
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vendedor, setVendedor] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [qrExpira, setQrExpira] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [generando, setGenerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const [serverIp, setServerIp] = useState('192.168.1.100');
  const [serverPort, setServerPort] = useState('3000');

  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      const savedIp = await obtenerDato('server_ip');
      const savedPort = await obtenerDato('server_port');
      if (savedIp && savedPort) {
        setServerIp(savedIp);
        setServerPort(savedPort);
        API_URL = `http://${savedIp}:${savedPort}/api`;
        setShowConfig(false);
        verificarSesion();
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
    }
  };

  const guardarConfiguracion = async () => {
    if (!serverIp.trim()) {
      Alert.alert('Error', 'Ingresa una IP válida');
      return;
    }
    await guardarDato('server_ip', serverIp);
    await guardarDato('server_port', serverPort);
    API_URL = `http://${serverIp}:${serverPort}/api`;
    setShowConfig(false);
    verificarSesion();
  };

  const verificarSesion = async () => {
    try {
      const token = await obtenerDato('token_vendedor');
      const vendedorData = await obtenerDato('vendedor');
      if (token && vendedorData && API_URL) {
        setVendedor(JSON.parse(vendedorData));
        setIsLoggedIn(true);
        cargarQRActivo();
      }
    } catch (error) {
      console.error('Error verificando sesión:', error);
    }
  };

  const iniciarSesion = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Ingresa tu correo y contraseña');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/trabajadores/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_usuario: email, password: password })
      });
      const data = await response.json();
      if (data.success) {
        await guardarDato('token_vendedor', data.token);
        await guardarDato('vendedor', JSON.stringify(data.trabajador));
        setVendedor(data.trabajador);
        setIsLoggedIn(true);
        setEmail('');
        setPassword('');
        cargarQRActivo();
      } else {
        Alert.alert('Error', data.message || 'Credenciales incorrectas');
      }
    } catch (error) {
      Alert.alert('Error de conexión', `No se pudo conectar a ${API_URL}`);
    } finally {
      setLoading(false);
    }
  };

  const cargarQRActivo = async () => {
    try {
      const token = await obtenerDato('token_vendedor');
      if (!vendedor) return;
      const response = await fetch(`${API_URL}/vendedor/qr-activo/${vendedor.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.tiene_qr_activo && new Date(data.expira) > new Date()) {
        setQrCode(data.codigo);
        setQrExpira(new Date(data.expira));
      }
    } catch (error) {
      console.error('Error cargando QR:', error);
    }
  };

  const generarQR = async () => {
    if (!vendedor) return;
    setGenerando(true);
    try {
      const token = await obtenerDato('token_vendedor');
      const response = await fetch(`${API_URL}/vendedor/generar-qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id_vendedor: vendedor.id, duracion_minutos: 60 })
      });
      const data = await response.json();
      if (data.success) {
        setQrCode(data.codigo);
        setQrExpira(new Date(data.expira));
        Alert.alert('Éxito', 'QR generado correctamente');
      } else {
        Alert.alert('Error', data.message || 'No se pudo generar el QR');
      }
    } catch (error) {
      Alert.alert('Error', 'Error de conexión al generar QR');
    } finally {
      setGenerando(false);
    }
  };

  const enviarQREmail = async () => {
    if (!qrCode) {
      Alert.alert('Error', 'Primero genera un QR');
      return;
    }
    if (!vendedor?.email) {
      Alert.alert('Error', 'Tu cuenta no tiene correo registrado');
      return;
    }
    setEnviando(true);
    try {
      const response = await fetch(`${API_URL}/vendedor/enviar-qr-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: vendedor.email,
          codigo: qrCode,
          nombre_vendedor: vendedor.nombre
        })
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('Éxito', 'QR enviado a tu correo electrónico');
      } else {
        Alert.alert('Error', data.message || 'No se pudo enviar el email');
      }
    } catch (error) {
      Alert.alert('Error', 'Error de conexión al enviar email');
    } finally {
      setEnviando(false);
    }
  };

  const cerrarSesion = async () => {
    await eliminarDato('token_vendedor');
    await eliminarDato('vendedor');
    setVendedor(null);
    setQrCode(null);
    setQrExpira(null);
    setIsLoggedIn(false);
  };

  const getTiempoRestante = () => {
    if (!qrExpira) return 0;
    const diff = (qrExpira - new Date()) / 1000;
    return diff > 0 ? diff : 0;
  };

  // Pantalla de Configuración
  if (showConfig) {
    return (
      <SafeAreaView style={styles.configContainer}>
        <View style={styles.configCard}>
          <Text style={styles.configTitle}>⚙️ Configuración</Text>
          <Text style={styles.configSubtitle}>Conecta tu app al servidor</Text>
          
          <Text style={styles.configLabel}>IP del Servidor:</Text>
          <TextInput
            style={styles.configInput}
            placeholder="Ej: 192.168.1.100"
            value={serverIp}
            onChangeText={setServerIp}
            autoCapitalize="none"
          />
          
          <Text style={styles.configLabel}>Puerto:</Text>
          <TextInput
            style={styles.configInput}
            placeholder="3000"
            value={serverPort}
            onChangeText={setServerPort}
            keyboardType="numeric"
          />
          
          <TouchableOpacity style={styles.configButton} onPress={guardarConfiguracion}>
            <Text style={styles.configButtonText}>🔌 Conectar</Text>
          </TouchableOpacity>
          
          <Text style={styles.configInfo}>
            Asegúrate que:{'\n'}
            1. Tu PC tenga el servidor corriendo{'\n'}
            2. Celular y PC estén en la misma WiFi{'\n'}
            3. La IP sea correcta (usa 'ipconfig' en CMD)
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Pantalla de Login
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>🏪</Text>
            </View>
            <Text style={styles.title}>Chepita</Text>
            <Text style={styles.subtitle}>App de Ventas</Text>
            <TouchableOpacity onPress={() => setShowConfig(true)} style={styles.configLink}>
              <Text style={styles.configLinkText}>⚙️ Cambiar servidor</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            
            <TouchableOpacity style={styles.loginButton} onPress={iniciarSesion} disabled={loading}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.loginButtonText}>Iniciar Sesión</Text>}
            </TouchableOpacity>
            
            <Text style={styles.infoText}>Servidor: {serverIp}:{serverPort}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const tiempoRestante = getTiempoRestante();
  const qrExpirado = tiempoRestante <= 0;

  // Pantalla principal
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.vendedorCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatar}>👤</Text>
          </View>
          <Text style={styles.vendedorNombre}>{vendedor?.nombre}</Text>
          <Text style={styles.vendedorId}>ID: {vendedor?.id}</Text>
          <Text style={styles.vendedorEmail}>{vendedor?.email}</Text>
        </View>

        <View style={styles.qrCard}>
          <Text style={styles.qrTitle}>Tu Código QR</Text>
          
          {qrCode ? (
            <View style={styles.qrWrapper}>
              <QRCode value={qrCode} size={200} color="#A63C89" backgroundColor="white" />
              {qrExpirado && (
                <View style={styles.qrOverlay}>
                  <Text style={styles.qrExpiradoText}>EXPIRADO</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.qrWrapper, styles.qrPlaceholder]}>
              <Text style={styles.qrPlaceholderText}>QR no generado</Text>
            </View>
          )}
          
          <Text style={styles.codigoTexto} selectable>{qrCode || '---'}</Text>
        </View>

        {qrCode && !qrExpirado && (
          <View style={styles.timerCard}>
            <CountdownCircleTimer
              isPlaying={true}
              duration={3600}
              initialRemainingTime={tiempoRestante}
              colors={['#10b981', '#f59e0b', '#ef4444']}
              colorsTime={[1800, 600, 0]}
              size={80}
              strokeWidth={6}
            >
              {({ remainingTime }) => (
                <View style={styles.timerContent}>
                  <Text style={styles.timerLabel}>Válido por</Text>
                  <Text style={styles.timerTime}>
                    {Math.floor(remainingTime / 60)}:{String(remainingTime % 60).padStart(2, '0')}
                  </Text>
                </View>
              )}
            </CountdownCircleTimer>
          </View>
        )}

        {qrExpirado && qrCode && (
          <View style={[styles.timerCard, styles.timerExpired]}>
            <Text style={styles.timerExpiredText}>⚠️ QR Expirado</Text>
            <Text style={styles.timerExpiredSubtext}>Genera uno nuevo para seguir vendiendo</Text>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.btnPrimary, (!qrExpirado && qrCode) && styles.btnDisabled]} 
          onPress={generarQR} 
          disabled={generando || (!qrExpirado && qrCode)}
        >
          {generando ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>{(!qrExpirado && qrCode) ? 'QR Activo' : 'Generar Nuevo QR'}</Text>}
        </TouchableOpacity>

        <View style={styles.rowButtons}>
          <TouchableOpacity 
            style={[styles.btnSecondary, (!qrCode || qrExpirado) && styles.btnDisabled]} 
            onPress={enviarQREmail} 
            disabled={!qrCode || qrExpirado || enviando}
          >
            {enviando ? <ActivityIndicator color="#A63C89" /> : <Text style={styles.btnSecondaryText}>📧 Enviar por Email</Text>}
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.btnDanger} onPress={cerrarSesion}>
            <Text style={styles.btnText}>🚪 Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => setShowConfig(true)} style={styles.configButtonSmall}>
          <Text style={styles.configButtonSmallText}>⚙️ Configurar servidor</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0ff' },
  configContainer: { flex: 1, backgroundColor: '#f5f0ff', justifyContent: 'center', padding: 20 },
  configCard: { backgroundColor: 'white', borderRadius: 32, padding: 24, alignItems: 'center' },
  configTitle: { fontSize: 24, fontWeight: '800', color: '#A63C89', marginBottom: 8 },
  configSubtitle: { fontSize: 14, color: '#8a6e9b', marginBottom: 24 },
  configLabel: { fontSize: 14, fontWeight: '600', color: '#4a1d6d', alignSelf: 'flex-start', marginBottom: 8 },
  configInput: { backgroundColor: '#f8f9ff', borderRadius: 24, padding: 14, width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#f0d9e8' },
  configButton: { backgroundColor: '#A63C89', borderRadius: 40, padding: 16, width: '100%', alignItems: 'center', marginTop: 8 },
  configButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  configInfo: { fontSize: 12, color: '#999', marginTop: 20, textAlign: 'center' },
  scrollContainer: { padding: 20, paddingBottom: 40 },
  logoContainer: { alignItems: 'center', marginTop: 20, marginBottom: 30 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#A63C89', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoText: { fontSize: 45 },
  title: { fontSize: 32, fontWeight: '800', color: '#A63C89' },
  subtitle: { fontSize: 14, color: '#8a6e9b', marginTop: 4 },
  configLink: { marginTop: 12 },
  configLinkText: { color: '#A63C89', fontSize: 12 },
  formContainer: { backgroundColor: 'white', borderRadius: 32, padding: 24, shadowColor: '#A63C89', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  input: { backgroundColor: '#f8f9ff', borderRadius: 24, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f0d9e8' },
  loginButton: { backgroundColor: '#A63C89', borderRadius: 40, padding: 16, alignItems: 'center', marginTop: 8 },
  loginButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  infoText: { textAlign: 'center', marginTop: 16, fontSize: 12, color: '#999' },
  vendedorCard: { backgroundColor: '#A63C89', borderRadius: 32, padding: 24, alignItems: 'center', marginBottom: 24 },
  avatarContainer: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatar: { fontSize: 36 },
  vendedorNombre: { fontSize: 22, fontWeight: '800', color: 'white', marginBottom: 4 },
  vendedorId: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  vendedorEmail: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  qrCard: { backgroundColor: 'white', borderRadius: 32, padding: 24, alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  qrTitle: { fontSize: 16, fontWeight: '600', color: '#A63C89', marginBottom: 20 },
  qrWrapper: { position: 'relative' },
  qrPlaceholder: { width: 200, height: 200, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  qrPlaceholderText: { color: '#999' },
  qrOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  qrExpiradoText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  codigoTexto: { fontFamily: 'monospace', fontSize: 11, backgroundColor: '#f5f5f5', padding: 10, borderRadius: 20, marginTop: 16, color: '#666', textAlign: 'center' },
  timerCard: { backgroundColor: '#e8f5e9', borderRadius: 24, padding: 16, alignItems: 'center', marginBottom: 20 },
  timerExpired: { backgroundColor: '#ffebee' },
  timerContent: { alignItems: 'center' },
  timerLabel: { fontSize: 12, color: '#2e7d32' },
  timerTime: { fontSize: 20, fontWeight: '800', fontFamily: 'monospace', color: '#2e7d32' },
  timerExpiredText: { fontSize: 16, fontWeight: 'bold', color: '#c62828' },
  timerExpiredSubtext: { fontSize: 12, color: '#c62828', marginTop: 4 },
  btnPrimary: { backgroundColor: '#A63C89', borderRadius: 40, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnSecondary: { backgroundColor: '#f0f0f0', borderRadius: 40, padding: 16, alignItems: 'center', flex: 1, marginRight: 8 },
  btnDanger: { backgroundColor: '#fee2e2', borderRadius: 40, padding: 16, alignItems: 'center', flex: 1, marginLeft: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  btnSecondaryText: { color: '#A63C89', fontSize: 14, fontWeight: '600' },
  rowButtons: { flexDirection: 'row', marginBottom: 20 },
  configButtonSmall: { marginTop: 16, alignItems: 'center' },
  configButtonSmallText: { color: '#A63C89', fontSize: 12 },
});