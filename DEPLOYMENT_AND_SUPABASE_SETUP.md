# 🚀 Guía Completa de Configuración de Supabase y Despliegue (Deploy) - Spotly Chile

Esta guía detalla paso a paso la configuración de la base de datos PostgreSQL en Supabase, autenticación, almacenamiento seguro (Storage) y el despliegue tanto del Frontend (React + Vite + TypeScript) como del Backend (Node.js/Express + Gemini Vision AI).

---

## 📑 Tabla de Contenidos
1. [Paso 1: Configuración de Supabase](#paso-1-configuración-de-supabase)
   - [1.1 Crear Proyecto en Supabase](#11-crear-proyecto-en-supabase)
   - [1.2 Ejecutar el Script de Esquema SQL (Tablas, RLS y Triggers)](#12-ejecutar-el-script-de-esquema-sql)
   - [1.3 Configuración de Supabase Storage (Buckets y Políticas)](#13-configuración-de-supabase-storage)
   - [1.4 Configuración de Supabase Auth](#14-configuración-de-supabase-auth)
2. [Paso 2: Variables de Entorno](#paso-2-variables-de-entorno)
3. [Paso 3: Seguridad y Rate Limiting en Gemini API](#paso-3-seguridad-y-rate-limiting-en-gemini-api)
4. [Paso 4: Opciones de Despliegue (Deploy)](#paso-4-opciones-de-despliegue-deploy)
   - [Opción A: Despliegue Unificado en Vercel (Frontend + Serverless Functions)](#opción-a-despliegue-unificado-en-vercel)
   - [Opción B: Frontend en Vercel / Netlify + Backend en Render / Railway](#opción-b-frontend-en-vercel-y-backend-en-renderrailway)
   - [Opción C: Despliegue Completo en Render o Railway (Servicio Único)](#opción-c-despliegue-completo-en-render-o-railway)

---

## Paso 1: Configuración de Supabase

### 1.1 Crear Proyecto en Supabase
1. Ingresa a [supabase.com](https://supabase.com/) e inicia sesión o crea una cuenta.
2. Haz clic en **New Project**.
3. Asigna un nombre al proyecto (ej: `spotly-chile`), define una contraseña segura para la base de datos y selecciona la región más cercana (ej: `sa-east-1` São Paulo para menor latencia en Chile).
4. Espera aproximadamente 1-2 minutos a que el clúster PostgreSQL termine de aprovisionarse.

### 1.2 Ejecutar el Script de Esquema SQL
En el repositorio se ha creado el archivo [`supabase/schema.sql`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/supabase/schema.sql).

1. En tu panel de Supabase, ve a la pestaña **SQL Editor** (ícono de consola `>_` en la barra lateral izquierda).
2. Haz clic en **New query**.
3. Abre el archivo [`supabase/schema.sql`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/supabase/schema.sql), copia todo su contenido y pégalo en el editor de Supabase.
4. Presiona el botón verde **Run** (o `Ctrl + Enter`).

#### ¿Qué crea este script automáticamente?
- **`profiles`**: Tabla de perfiles sincronizada con `auth.users`, almacena nombres, RUT, rol (`tenant`, `owner`, `admin`), estado KYC (`unverified`, `pending_review`, `verified`, `rejected`), teléfonos y biometría.
- **`spaces`**: Catálogo de recintos y propiedades (oficinas, coworkings, eventos, estudios, etc.), modalidades de arriendo (hora, día, mes), precios en CLP, aforos y fotos.
- **`reservations`**: Reservas bajo la Ley 18.101 de Chile, estados, montos de garantía y comisiones de plataforma.
- **`contracts`**: Contratos digitales firmados con sello criptográfico SHA-256 inmutable, cláusulas legales y token de verificación.
- **`audit_logs`**: Trazabilidad completa con dirección IP, User-Agent, severidad y detalles en formato JSONB.
- **`disputes`**: Resolución y mediación de controversias entre arrendatarios y propietarios.
- **`visit_requests`**: Coordinación de visitas presenciales y virtuales a los recintos.
- **`saved_cards`**: Tarjetas de pago registradas.
- **Row Level Security (RLS)**: Políticas estrictas para que cada usuario solo modifique lo que le corresponde y los administradores puedan auditar todo.
- **Triggers**: Creación automática de perfil al registrarse (`handle_new_user`) y actualización de fechas `updated_at`.

### 1.3 Configuración de Supabase Storage
El script `schema.sql` crea e inicializa los 4 buckets requeridos:
1. **`spaces`** (Público): Para fotografías y galerías de propiedades y recintos comerciales.
2. **`kyc-documents`** (Privado): Para las fotos capturadas de la Cédula de Identidad (anverso/reverso) y Certificado de Antecedentes del Registro Civil.
3. **`kyc-biometrics`** (Privado): Para las selfies y fotogramas de reconocimiento facial biométrico.
4. **`contracts`** (Privado): Para los PDFs y actas firmadas de los contratos digitales.

*Nota:* Si deseas verificar los buckets visualmente, ve a la sección **Storage** en tu panel de Supabase.

### 1.4 Configuración de Supabase Auth
1. En Supabase, ve a **Authentication** -> **Providers** -> **Email**.
2. Asegúrate de que **Enable Email provider** esté activo.
3. Para pruebas y desarrollo rápido, puedes desactivar temporalmente **Confirm email** para que los usuarios puedan registrarse e ingresar inmediatamente sin esperar el correo de confirmación.
4. Ve a **Project Settings** -> **API** y copia:
   - **Project URL** (ej: `https://xyzcompany.supabase.co`) -> Será tu `VITE_SUPABASE_URL`
   - **Project API Keys** -> `anon` `public` -> Será tu `VITE_SUPABASE_ANON_KEY`

---

## Paso 2: Variables de Entorno

Crea tu archivo `.env` en la raíz del proyecto (basado en [`.env.example`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/.env.example)):

```env
# Claves de Supabase (Cliente Frontend)
VITE_SUPABASE_URL=https://tu-proyecto-id.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-de-supabase

# Google Gemini API (Backend Exclusivo para OCR y Biometría)
# Obtener en https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIzaSy...tu_clave_gemini_aqui

# Configuración del Servidor
PORT=3000
NODE_ENV=production
```

---

## Paso 3: Seguridad y Rate Limiting en Gemini API

Para proteger tu cuota de Google Gemini API y evitar ataques de denegación de servicio o sobrecostos, el backend [`server.ts`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/server.ts) incluye:
- **`express-rate-limit`**: Límite de **30 solicitudes por cada 10 minutos por dirección IP** en todas las rutas biométricas y de visión (`/api/verify-kyc`, `/api/verify-id-frame`, `/api/verify-face-frame`).
- Si un cliente supera este umbral, el servidor responde con código `HTTP 429` y un mensaje descriptivo en español solicitando esperar unos minutos.
- **Aislamiento de API Key**: `GEMINI_API_KEY` se procesa exclusivamente en el entorno de servidor (Node.js o Serverless Functions), impidiendo que la clave quede expuesta en el código del navegador.

---

## Paso 4: Opciones de Despliegue (Deploy)

### Opción A: Despliegue Unificado en Vercel (Recomendado)
Vercel compila el frontend con Vite y ejecuta automáticamente las Serverless Functions de la carpeta `api/`:

1. Sube tu código a un repositorio en **GitHub**, **GitLab** o **Bitbucket**.
2. Ingresa a [vercel.com](https://vercel.com/) y haz clic en **Add New...** -> **Project**.
3. Importa tu repositorio.
4. Configuración del proyecto en Vercel:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. En la sección **Environment Variables**, agrega:
   - `VITE_SUPABASE_URL`: `https://tu-proyecto.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `tu-clave-anon`
   - `GEMINI_API_KEY`: `tu-clave-gemini`
6. Haz clic en **Deploy**.
   - El frontend SPA se servirá en la raíz `/` con rutas fluidas.
   - Las rutas `/api/verify-kyc`, `/api/verify-id-frame`, `/api/verify-face-frame` y `/api/health` funcionarán directamente como funciones Serverless de Vercel.

---

### Opción B: Frontend en Vercel / Netlify y Backend en Render o Railway

Si prefieres tener el servidor Express [`server.ts`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/server.ts) corriendo continuamente en Render o Railway:

#### Despliegue del Backend en Render:
1. Ingresa a [render.com](https://render.com/) -> **New** -> **Web Service**.
2. Conecta tu repositorio.
3. Selecciona:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx tsx server.ts`
4. En **Environment Variables** en Render agrega:
   - `GEMINI_API_KEY`: tu clave de Gemini
   - `NODE_ENV`: `production`
   - `CORS_ORIGIN`: la URL de tu frontend en Vercel (ej: `https://spotly-chile.vercel.app`)
5. Render te dará una URL (ej: `https://spotly-backend.onrender.com`).

#### Configuración del Frontend en Vercel:
En las variables de entorno de tu proyecto Vercel, agrega:
- `VITE_API_URL`: `https://spotly-backend.onrender.com`
- `VITE_SUPABASE_URL`: tu URL de Supabase
- `VITE_SUPABASE_ANON_KEY`: tu clave anon de Supabase

La app también acepta las variables públicas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, habituales en proyectos conectados desde Vercel. Nunca uses `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

Para una base de datos que ya existe, aplica en el SQL Editor y en este orden las migraciones de `supabase/migrations/`: primero `20260930_add_profile_name_parts.sql` y luego `20260930_secure_profile_access.sql`. La segunda restringe la lectura de perfiles al propio usuario y a administradores; el perfil administrador debe tener `role = 'admin'`.

---

### Opción C: Despliegue Completo en Render o Railway (Servicio Único)
El archivo [`render.yaml`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/render.yaml) y el [`Dockerfile`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/Dockerfile) permiten desplegar la aplicación completa en un único servicio:

1. El comando `npm run build` compila los archivos estáticos en `dist/`.
2. El servidor [`server.ts`](file:///c:/Users/maris/Downloads/proyecto-titulo-main/server.ts) en modo producción sirve tanto los endpoints de la API (`/api/*`) como los archivos estáticos de la aplicación React desde `dist/`.
3. Todo corre en un solo dominio y puerto.

---

## 🔍 Verificación del Despliegue
Para confirmar que todo funciona correctamente:
1. Visita `/api/health` en tu dominio. Debe responder:
   ```json
   {
     "status": "ok",
     "service": "Spotly Chile Biometrics & KYC Backend",
     "geminiConfigured": true
   }
   ```
2. Registra un nuevo usuario en la página `/register`. Debe crearse en la tabla `auth.users` y en `public.profiles` de Supabase.
3. Inicia sesión en `/login` con el usuario creado.
4. Ingresa a la verificación de identidad en `/onboarding`, toma una foto de la cédula y rostro para validar el flujo completo de escaneo con Gemini AI y almacenamiento en Supabase Storage.
