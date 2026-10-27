# Guía completa de Configuración de Supabase y Despliegue (Deploy) - Spotly Chile

Esta guía detalla paso a paso la configuración de la base de datos PostgreSQL en Supabase, autenticación, almacenamiento seguro (Storage) y el despliegue tanto del Frontend (React + Vite + TypeScript) como del Backend (Node.js/Express).

---

## Tabla de contenidos
1. [Paso 1: Configuración de Supabase](#paso-1-configuración-de-supabase)
   - [1.1 Crear Proyecto en Supabase](#11-crear-proyecto-en-supabase)
   - [1.2 Ejecutar el Script de Esquema SQL (Tablas, RLS y Triggers)](#12-ejecutar-el-script-de-esquema-sql)
   - [1.3 Configuración de Supabase Storage (Buckets y Políticas)](#13-configuración-de-supabase-storage)
   - [1.4 Configuración de Supabase Auth](#14-configuración-de-supabase-auth)
2. [Paso 2: Variables de Entorno](#paso-2-variables-de-entorno)
3. [Paso 3: Verificación de identidad](#paso-3-verificación-de-identidad)
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
En el repositorio se ha creado el archivo [`supabase/schema.sql`](supabase/schema.sql).

1. En tu panel de Supabase, ve a la pestaña **SQL Editor** (ícono de consola `>_` en la barra lateral izquierda).
2. Haz clic en **New query**.
3. Abre el archivo [`supabase/schema.sql`](supabase/schema.sql), copia todo su contenido y pégalo en el editor de Supabase.
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

Crea tu archivo `.env` en la raíz del proyecto (basado en [`.env.example`](.env.example)):

```env
# Claves de Supabase (Cliente Frontend)
VITE_SUPABASE_URL=https://tu-proyecto-id.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-de-supabase

# Configuración del Servidor
PORT=3000
NODE_ENV=production
```

---

## Paso 3: Verificación de identidad

La verificación no usa servicios de IA externos. En `/onboarding` el usuario:
1. Fotografía el frente y el reverso de su cédula.
2. Se toma una selfie.
3. Sube su certificado de antecedentes.

Los archivos se guardan en Supabase Storage y la solicitud queda pendiente. Un administrador revisa los documentos en el panel de administración y aprueba o rechaza la solicitud indicando el motivo.

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
6. Haz clic en **Deploy**.
   - El frontend SPA se servirá en la raíz `/` con rutas fluidas.
   - Las rutas de `api/` (`/api/webpay`, `/api/auth`, `/api/client-ip` y `/api/health`) funcionarán como funciones Serverless de Vercel.

---

### Opción B: Frontend en Vercel / Netlify y Backend en Render o Railway

Si prefieres tener el servidor Express [`server.ts`](server.ts) corriendo continuamente en Render o Railway:

#### Despliegue del Backend en Render:
1. Ingresa a [render.com](https://render.com/) -> **New** -> **Web Service**.
2. Conecta tu repositorio.
3. Selecciona:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx tsx server.ts`
4. En **Environment Variables** en Render agrega:
   - `NODE_ENV`: `production`
   - `CORS_ORIGIN`: la URL de tu frontend en Vercel (ej: `https://spotly-chile.vercel.app`)
5. Render te dará una URL (ej: `https://spotly-backend.onrender.com`).

#### Configuración del Frontend en Vercel:
En las variables de entorno de tu proyecto Vercel, agrega:
- `VITE_API_URL`: `https://spotly-backend.onrender.com`
- `VITE_SUPABASE_URL`: tu URL de Supabase
- `VITE_SUPABASE_ANON_KEY`: tu clave anon de Supabase

La app también acepta las variables públicas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, habituales en proyectos conectados desde Vercel. Nunca uses `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

Toda la base de datos se crea con un único script: `supabase/reset-and-setup.sql`. El perfil administrador debe tener `role = 'admin'`.

---

### Opción C: Despliegue Completo en Render o Railway (Servicio Único)
El archivo [`render.yaml`](render.yaml) permite desplegar la aplicación completa en un único servicio:

1. El comando `npm run build` compila los archivos estáticos en `dist/`.
2. El servidor [`server.ts`](server.ts) en modo producción sirve tanto los endpoints de la API (`/api/*`) como los archivos estáticos de la aplicación React desde `dist/`.
3. Todo corre en un solo dominio y puerto.

---

## Verificación del despliegue
Para confirmar que todo funciona correctamente:
1. Visita `/api/health` en tu dominio. Debe responder:
   ```json
   {
     "status": "ok",
     "service": "Spotly API"
   }
   ```
2. Registra un nuevo usuario en la página `/register`. Debe crearse en la tabla `auth.users` y en `public.profiles` de Supabase.
3. Inicia sesión en `/login` con el usuario creado.
4. Ingresa a la verificación de identidad en `/onboarding`, fotografía la cédula, tómate la selfie y sube el certificado de antecedentes. Revisa que los archivos queden en Supabase Storage y que la solicitud aparezca en el panel de administración.

---

## Actualización 2026-10-12: cumplimiento del informe (v5)

### 1. Base de datos (Supabase)
Toda la base está en un único archivo: `supabase/reset-and-setup.sql`.
Cópialo completo en **Supabase → SQL Editor** y ejecútalo una sola vez.

Incluye las tablas base y los módulos de cumplimiento del informe: restricción
de exclusión anti-sobreventa, tablas `payments`, `reviews`, `favorites`,
`notifications`, `kyc_verifications`, `user_reports`, `discount_codes`,
`space_views` y `login_attempts`, guardas de servidor sobre reservas, espacios y
perfiles, auditoría de solo adición con IP real y la función `admin_kpis()`.

**Es destructivo:** borra los datos de las tablas de Spotly (conserva las cuentas
de `auth.users` y los archivos de Storage). Respalda antes de ejecutarlo.

### 2. Variables de entorno del backend (Vercel → Settings → Environment Variables)

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase (puede omitirse si existe `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (Project Settings → API). **Solo backend.** |
| `WEBPAY_ENV` | `integration` (por defecto). `production` solo con credenciales reales |
| `WEBPAY_COMMERCE_CODE` / `WEBPAY_API_KEY` | Solo para producción |
| `PUBLIC_APP_URL` | Opcional: URL pública (por ejemplo `https://tu-app.vercel.app`) |
| `VITE_SUPABASE_ANON_KEY` | Ya existente; el backend de login también la usa |

Sin `SUPABASE_SERVICE_ROLE_KEY` el pago responde 503 y la reserva no puede pagarse.

### Seguridad de la base de datos
- **Datos privados de espacios:** `owner_rut` y `address` no son legibles por `anon` ni
  `authenticated` (privilegios por columna). Solo los obtienen el propietario, administración
  y quien tiene una reserva o visita en el espacio, mediante `get_spaces_private_details()`.
- **Bloqueo de acceso:** el inicio de sesión pasa por `/api/auth`. Las funciones de bloqueo
  solo las ejecuta el backend (`service_role`); el contador es por correo + IP, con un límite
  adicional por IP. No existe consulta pública de existencia de RUT.
- **Auditoría:** el cliente no puede insertar, modificar ni borrar en `audit_logs`; los
  registros los escriben triggers y el backend.
- **Descuentos:** la validación y el consumo del cupo ocurren en un solo `UPDATE` con bloqueo
  de fila, y un `CHECK` impide superar `max_uses`.
- **Límite de Supabase Auth:** como el login pasa por el backend, Supabase ve la IP del servidor.
  Revisa en *Authentication → Rate Limits* que el límite de inicios de sesión sea suficiente.

### Rendimiento para muchos usuarios
- Las políticas RLS evalúan `auth.uid()` e `is_admin()` una sola vez por consulta
  (`(SELECT auth.uid())`), no una vez por fila.
- Índices para el catálogo (espacios activos por fecha, comuna y categoría), historiales
  de reservas por arrendatario y propietario, pagos, notificaciones no leídas, visitas al
  detalle y auditoría.
- La tabla de intentos de acceso se purga sola (registros de más de 1 día).
- Todo está en el único script `supabase/reset-and-setup.sql`.

### 3. Pago de prueba (ambiente de integración de Transbank)
- Tarjeta VISA `4051 8856 0044 6623`, CVV `123`, cualquier fecha futura.
- En la autenticación del banco: RUT `11.111.111-1`, clave `123`.

### 4. Pruebas
```
npm test              # 30 pruebas unitarias
npm run test:coverage # cobertura de la lógica crítica (umbral 60 %)
```

### 5. Documentación de la API
Especificación OpenAPI en `public/openapi.yaml` (publicada en `/openapi.yaml`).

## Actualización: categorías en español, garantía mensual opcional y billetera

**Base de datos:** todo el esquema está en un único script, `supabase/reset-and-setup.sql`. En Supabase → SQL Editor pégalo completo y presiona Run. Es destructivo (borra los datos de Spotly, conserva las cuentas de `auth.users` y los archivos de Storage) y corre en una sola transacción: si algo falla no se aplica nada. Después vuelve a asignar tu administrador con `UPDATE public.profiles SET role = 'admin' WHERE email = 'TU_CORREO';`.

El script incluye:

- Categorías de espacio en español (departamento, casa, cabaña, quincho, sala de reuniones, etc.).
- Garantía **solo en arriendos mensuales** y solo si el propietario la pide.
- Billetera (`wallet_cards`) y columnas de Oneclick en `payments`.
- Seguridad: RLS en todas las tablas, permisos mínimos por tabla, columna y función, `search_path` fijo en todas las funciones, sin SQL dinámico con datos del usuario (protección contra inyección SQL), validaciones de largo y rango en los campos y unicidad para evitar duplicados (RUT, espacios repetidos, visitas repetidas, tarjetas repetidas).

**Disponibilidad 24/7:** `vercel.json` programa una llamada diaria a `/api/health` (Vercel Cron), que consulta la base y evita que un proyecto gratuito de Supabase se pause por inactividad. Para producción real se recomienda el plan Pro de Supabase (sin pausas y con respaldos diarios).

**Billetera (Transbank Oneclick Mall):** la función `api/wallet.ts` inscribe tarjetas, las elimina y cobra reservas con una tarjeta guardada. En el ambiente de integración usa las credenciales públicas de prueba de Transbank, sin configurar nada. Para producción agrega en Vercel:

| Variable | Valor |
|---|---|
| `ONECLICK_COMMERCE_CODE` | Código del comercio mall Oneclick |
| `ONECLICK_CHILD_COMMERCE_CODE` | Código de la tienda hija que recibe los pagos |
| `ONECLICK_API_KEY` | Llave secreta entregada por Transbank |

Spotly nunca recibe el número de la tarjeta: Transbank entrega un identificador (`tbk_user`) que solo lee el backend.

## Actualización 2026-10-27: verificación de correo, recuperación de contraseña y sesión en cookie

### Qué cambió
- **Registro con código:** al registrarse la cuenta se crea **sin activar** y se envía un código de 6 dígitos al correo. Solo al escribir el código en `/verificar-correo` la cuenta queda activa y con sesión. Las cuentas que no validan su correo se eliminan a las 24 h.
- **Recuperar contraseña:** en `/forgot-password` se escribe el correo y llega un enlace de un solo uso (vence en 1 h) que abre `/restablecer-contrasena`. Al guardar la nueva contraseña se cierran todas las sesiones de la cuenta.
- **Contraseñas:** Supabase Auth las guarda solo como hash **bcrypt** con sal (irreversible). Spotly nunca las guarda ni las registra. Política: 8 a 72 caracteres, minúscula, mayúscula, número, sin nombre/correo/RUT y no comunes (se valida en el navegador y en el servidor).
- **Sesión en cookie protegida:** el token largo vive en la cookie `spotly_rt` con `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`. JavaScript no puede leerla. El navegador solo guarda en memoria el token de acceso de 1 hora. Ya no hay tokens en `localStorage`.
- **Anti-CSRF:** `/api/auth` exige la cabecera `X-Spotly-Request` y un `Origin` del mismo sitio.
- **Cabeceras de seguridad:** Content-Security-Policy estricta (sin scripts en línea), HSTS, COOP, CORP, X-Frame-Options, Referrer-Policy y Permissions-Policy (`vercel.json` y `server.ts`, generadas desde `api/_security.ts`).
- **Bloqueo por intentos:** login (5 por correo + IP), códigos (5 por correo + IP), reenvíos y enlaces de recuperación.

### 1. Base de datos
Si tu base ya tiene datos, ejecuta en **SQL Editor** el parche no destructivo `supabase/patch-2026-10-27-seguridad-acceso.sql`. (Si ejecutas `reset-and-setup.sql` completo, ya viene incluido.)

### 2. Supabase → Authentication
1. **Sign In / Providers → Email:** activa **Confirm email**. Deja **Email OTP Length = 6** y **Email OTP Expiration = 900** segundos (15 min).
2. **Password requirements:** mínimo **8** y *Lowercase, uppercase letters and digits*. En plan Pro activa **Prevent use of leaked passwords**.
3. **URL Configuration:** **Site URL** = tu dominio (ej. `https://proyecto.vercel.app`) y en **Redirect URLs** agrega `https://TU-DOMINIO/restablecer-contrasena` y `https://TU-DOMINIO/verificar-correo` (y `http://localhost:3000/...` para desarrollo).

### 3. Envío de correos (elige una opción)
**Opción A — Resend (recomendada, correos con la marca Spotly):**
1. Crea una cuenta en resend.com, verifica tu dominio y crea una API key.
2. En Vercel agrega `RESEND_API_KEY` y `EMAIL_FROM` (ej. `Spotly <no-responder@tudominio.cl>`).
   Sin dominio propio, Resend solo permite enviar a tu propio correo (sirve para pruebas).

**Opción B — Correos de Supabase:**
1. **Authentication → Emails → SMTP Settings:** configura un SMTP propio (por ejemplo Gmail con una *contraseña de aplicación*: host `smtp.gmail.com`, puerto `465`). El SMTP incluido en Supabase solo entrega correos a los miembros del equipo del proyecto.
2. **Email Templates → Confirm signup:** el cuerpo debe incluir el código:
   ```html
   <h2>Confirma tu correo en Spotly</h2>
   <p>Tu código de verificación es:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Vence en 15 minutos. Si no fuiste tú, ignora este correo.</p>
   ```
3. **Email Templates → Reset password:**
   ```html
   <h2>Restablece tu contraseña de Spotly</h2>
   <p><a href="{{ .SiteURL }}/restablecer-contrasena?token_hash={{ .TokenHash }}&type=recovery">Crear nueva contraseña</a></p>
   <p>El enlace vence en 1 hora y solo funciona una vez.</p>
   ```

### 4. Despliegue
La web y `/api` deben estar en el **mismo dominio** (Vercel lo hace por defecto) para que la cookie `SameSite=Strict` funcione. Si separas la API, define `CORS_ORIGIN` con el dominio exacto del frontend.

### 5. Comprobar
- Registrarte con un correo real: debe llegar el código y la cuenta no debe poder entrar antes de validarlo.
- En las herramientas del navegador (F12 → Application → Cookies) la cookie `spotly_rt` aparece con **HttpOnly**, **Secure** y **SameSite Strict**, y `localStorage` no contiene tokens.
- `npm test` (88 pruebas, incluidas las de `/api/auth` y las cabeceras de seguridad).
