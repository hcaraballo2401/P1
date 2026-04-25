# BioLife — Aplicación de Identificación de Biodiversidad

Aplicación móvil desarrollada con **Expo SDK 54** (React Native) para identificar animales mediante inteligencia artificial.

## 📋 Requisitos del Sistema

| Requisito | Versión Mínima | Recomendada |
|-----------|----------------|-------------|
| Node.js | 18.x | 20.x LTS |
| npm | 9.x | 10.x |
| Java (JDK) | 17 | 17 (LTS) |
| Android Studio | - | Latest |
| Expo CLI | - | Latest |

---

## 🛠️ Aplicaciones Requeridas

### 1. Node.js

**Descargar:** https://nodejs.org/

- Seleccionar la versión **LTS** (20.x)
- Durante la instalación, marcar la opción **"Add to PATH"**

**Verificar instalación:**
```bash
node --version
npm --version
```

### 2. Java Development Kit (JDK 17)

**Windows:**
- Descargar desde: https://adoptium.net/
- Seleccionar **JDK 17 (LTS)** → **Windows x64** → **MSI Installer**

**Verificar instalación:**
```bash
java -version
```

### 3. Android Studio

**Descargar:** https://developer.android.com/studio

**Componentes a instalar:**
- Android SDK
- Android SDK Build-Tools
- Android SDK Platform-Tools
- Android SDK Command-line Tools

**Configuración de variables de entorno:**

Agregar al **PATH** del sistema:
```
C:\Program Files\Android\Android Studio\jbr\bin
C:\Users\TU_USUARIO\AppData\Local\Android\Sdk\platform-tools
C:\Users\TU_USUARIO\AppData\Local\Android\Sdk\cmdline-tools\latest\bin
```

**Variable de entorno ANDROID_HOME:**
```
ANDROID_HOME=C:\Users\TU_USUARIO\AppData\Local\Android\Sdk
```

### 4. Expo CLI (Opcional - ya incluido en el proyecto)

```bash
npm install -g expo
```

---

## 🚀 Pasos de Instalación

### Paso 1: Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd P1
```

### Paso 2: Instalar dependencias

```bash
npm install
```

### Paso 3: Configurar el entorno

#### Windows: Configurar variables de entorno

1. Buscar **"Variables de entorno"** en el menú inicio
2. Click en **"Variables de entorno"**
3. En **"Variables del sistema"**, click en **"Nueva"**
4. Agregar:
   - Nombre: `ANDROID_HOME`
   - Valor: `C:\Users\TU_USUARIO\AppData\Local\Android\Sdk`

5. Editar la variable `Path` y agregar:
   - `C:\Users\TU_USUARIO\AppData\Local\Android\Sdk\platform-tools`
   - `C:\Users\TU_USUARIO\AppData\Local\Android\Sdk\cmdline-tools\latest\bin`

### Paso 4: Ejecutar la aplicación

#### Opción A: Modo Desarrollo (Recomendado)

```bash
npm start
```

Esto abrirá **Expo Dev Tools** en el navegador con un código QR.

#### Opción B: Ejecutar en Android (USB)

```bash
npm run android
```

**Requisitos:**
- Teléfono Android conectado por USB
- Driver USB instalado (consultar fabricante)
- **Depuración USB** habilitada en el teléfono (Configuración → Opciones de desarrollador)

#### Opción C: Ejecutar en Emulador

```bash
npm run android
```

**Requisitos:**
- Android Studio instalado y configurado
- AVD (Android Virtual Device) creado
- Emulador iniciado desde Android Studio

---

## 📱 Configuración del Dispositivo

### Habilitar Depuración USB (Android)

1. Ir a **Configuración** → **Acerca del teléfono**
2. Tocar **Número de compilación** 7 veces
3. Volver a **Configuración** → **Opciones de desarrollador**
4. Habilitar **Depuración USB**
5. Autorizar la computadora cuando se solicite

### Instalar Expo Go en el teléfono

1. Abrir **Google Play Store**
2. Buscar **"Expo Go"**
3. Instalar la aplicación

### Conectar al servidor de desarrollo

1. Conectar teléfono y computadora a la **misma red WiFi**
2. Ejecutar `npm start` en la computadora
3. Escanear el código QR con **Expo Go**
4. La aplicación se cargará automáticamente

---

## 🔧 Solución de Problemas

### Error: "Java not found"

**Solución:**
```bash
# Verificar JAVA_HOME
echo $JAVA_HOME

# Si no está configurado
setx JAVA_HOME "C:\Program Files\Java\jdk-17"
```

### Error: "Android SDK not found"

**Solución:**
1. Abrir Android Studio
2. Ir a **More Actions** → **SDK Manager**
3. Instalar los componentes faltantes
4. Verificar que `ANDROID_HOME` apunte a la ruta correcta

### Error: "npm command not found"

**Solución:**
- Reiniciar la terminal después de instalar Node.js
- Verificar que npm esté en el PATH: `where npm`

### Error: "EACCES: permission denied"

**Solución (Windows - ejecutar como administrador):**
```powershell
Start-Process powershell -Verb RunAs
```

### Error: Metro bundler no inicia

**Solución:**
```bash
# Limpiar caché
npx expo start --clear

# O eliminar node_modules y reinstalar
rm -rf node_modules
npm install
```

---

## 📂 Estructura del Proyecto

```
P1/
├── assets/              # Imágenes, iconos, fuentes
├── src/
│   ├── app/            # Pantallas (Expo Router)
│   │   ├── _layout.tsx # Layout principal
│   │   ├── index.tsx   # Pantalla principal
│   │   ├── search.tsx  # Búsqueda
│   │   ├── discover.tsx# Descubrir
│   │   ├── favorites.tsx# Favoritos
│   │   └── settings.tsx# Configuración
│   └── types/
│       └── api.ts      # Tipos TypeScript
├── android/            # Proyecto nativo Android
├── ios/                # Proyecto nativo iOS
├── app.json            # Configuración Expo
├── package.json        # Dependencias npm
└── tsconfig.json       # Configuración TypeScript
```

---

## 🔗 Recursos Adicionales

- **Documentación Expo:** https://docs.expo.dev/
- **React Native:** https://reactnative.dev/
- **Android Studio:** https://developer.android.com/studio
- **Node.js:** https://nodejs.org/
- **Java JDK:** https://adoptium.net/

---

## 📞 Soporte

Si tienes problemas durante la instalación, consulta:
1. La documentación oficial de Expo
2. Los issues del repositorio
3. La comunidad de Expo en Discord

---