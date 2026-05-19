# 📦 SMT Inventory

Sistema de control de inventario para el área de manufactura SMT (Surface Mount Technology), desarrollado con Angular y Firebase.

---

## 🚀 Tecnologías

| Tecnología | Versión | Uso |
|---|---|---|
| Angular | 21.x | Framework frontend |
| @angular/fire | 20.x | Integración con Firebase |
| Firebase Auth | — | Autenticación de usuarios |
| Firestore | — | Base de datos en tiempo real |
| Firebase Hosting | — | Despliegue de la app |
| Cloud Functions | — | Lógica de servidor (crear/eliminar usuarios) |
| Bootstrap | 5.x | Estilos y componentes UI |
| Bootstrap Icons | — | Iconografía |
| @zxing/ngx-scanner | — | Escaneo de códigos de barras y QR |
| xlsx | — | Exportación a Excel |

---

## ✨ Funcionalidades

### 🔐 Autenticación
- Login con correo y contraseña
- Sin registro público — las cuentas son creadas por el administrador
- Roles: `admin` y `user`

### 👥 Usuarios (solo admin)
- Crear, editar y eliminar usuarios
- Cambio de roles
- Las operaciones se realizan mediante Cloud Functions para mantener la seguridad

### 🧵 SMT — Rollos
- Registro de rollos con número de parte, ubicación y cantidad
- Entrada y salida de rollos (manual o escáner de cámara)
- Si un número de parte llega con una ubicación diferente, se crea un nuevo registro
- Búsqueda por número de parte (parcial, en memoria)
- Paginado configurable: 5, 10, 20, 50 o todos
- Historial de movimientos por rollo
- Exportación a Excel

### 📋 BOM — Build of Materials
- Creación de recetas con múltiples números de parte y cantidades requeridas
- Soporte para números de parte no registrados en SMT (con notación visual)
- Carga masiva de componentes desde texto
- Búsqueda de BOMs por nombre o por número de parte
- Salida de BOM: descuenta el stock de todos los rollos de la receta
- Selección de ubicación cuando un número de parte está en múltiples lugares
- Historial de movimientos por BOM
- Exportación a Excel

### 🏗️ Subensambles
- Control de magazines con número de parte y cantidad
- Entrada por magazine (con soporte de escáner)
- Salida por magazine: muestra el contenido y permite confirmar la cantidad
- Reutilización de magazines con diferente número de parte
- Integración con el catálogo de Familias para mostrar descripción
- Búsqueda por magazine o número de parte
- Paginado configurable
- Historial de movimientos
- Exportación a Excel

### 🏷️ Familias (solo admin)
- Catálogo de familias asociadas a números de parte de subensambles
- Un número de parte solo puede pertenecer a una familia
- Carga masiva desde texto con formato `Nombre, Número de parte`
- La familia se muestra automáticamente en la vista de subensambles

### 📊 Historial General
- Vista unificada de todos los movimientos (SMT, BOM y Subensambles)
- Filtros por origen y por tipo (entrada/salida)
- Paginado con scroll infinito
- Exportación a Excel del historial filtrado

---

## 🏗️ Arquitectura

```
src/
├── app/
│   ├── core/
│   │   ├── guards/
│   │   │   ├── auth.guard.ts
│   │   │   └── admin.guard.ts
│   │   ├── models/
│   │   │   ├── user.model.ts
│   │   │   ├── smt.model.ts
│   │   │   ├── bom.model.ts
│   │   │   ├── subassembly.model.ts
│   │   │   └── family.model.ts
│   │   └── services/
│   │       ├── auth.service.ts
│   │       ├── user.service.ts
│   │       ├── smt.service.ts
│   │       ├── bom.service.ts
│   │       ├── subassembly.service.ts
│   │       ├── family.service.ts
│   │       └── export.service.ts
│   └── pages/
│       ├── login/
│       └── dashboard/
│           └── tabs/
│               ├── smt/
│               ├── bom/
│               ├── subassembly/
│               ├── families/
│               ├── history/
│               └── users/
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
functions/
├── src/
│   └── index.ts        ← Cloud Functions
└── package.json
```

---

## ⚙️ Instalación

### Prerrequisitos

- Node.js 22.x LTS
- Angular CLI 20.x
- Firebase CLI

```bash
npm install -g @angular/cli@20
npm install -g firebase-tools
```

### Clonar y configurar

```bash
git clone https://github.com/tu-usuario/smt-inventory.git
cd smt-inventory
npm install --legacy-peer-deps
```

### Configurar Firebase

1. Crea un proyecto en [console.firebase.google.com](https://console.firebase.google.com)
2. Copia el archivo de ejemplo y llena tus credenciales:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
```

```ts
// environment.ts
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: "TU_API_KEY",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "123456",
    appId: "1:123456:web:abcdef"
  }
};
```

### Instalar dependencias de Cloud Functions

```bash
cd functions
npm install
cd ..
```

---

## 🧑‍💻 Desarrollo local

```bash
# Terminal 1 — App Angular
npm start

# Terminal 2 — Emuladores Firebase
npm run emulators
```

### Crear el primer usuario admin

1. Ve a Firebase Console → Authentication → Add user
2. Ve a Firestore → Crea la colección `users` con el UID del usuario:
```json
{
  "email": "admin@tuapp.com",
  "displayName": "Administrador",
  "role": "admin"
}
```

---

## 📦 Scripts disponibles

```bash
npm start                 # Servidor de desarrollo
npm run build             # Build de producción
npm run deploy            # Build + deploy completo (hosting + functions + rules)
npm run deploy:hosting    # Solo frontend
npm run deploy:functions  # Solo Cloud Functions
npm run deploy:rules      # Solo reglas de Firestore
npm run emulators         # Emuladores locales de Firebase
```

---

## 🔒 Seguridad

- Las cuentas de usuario **solo pueden ser creadas por un administrador** mediante Cloud Functions
- Las reglas de Firestore restringen el acceso a usuarios autenticados
- El tab de **Familias** y **Usuarios** solo es visible para administradores
- La edición y eliminación de rollos SMT solo está disponible para administradores

---

## 📄 Licencia

MIT
