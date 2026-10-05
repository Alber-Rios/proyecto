import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';

export type LegalDocument = 'terms' | 'privacy' | 'cookies';

const documentLinks: Array<{ id: LegalDocument; href: string; label: string }> = [
  { id: 'terms', href: '/terminos', label: 'Términos y condiciones' },
  { id: 'privacy', href: '/privacidad', label: 'Política de privacidad' },
  { id: 'cookies', href: '/cookies', label: 'Política de cookies' },
];

const lawLinks = [
  {
    href: 'https://www.bcn.cl/leychile/navegar?idNorma=141599',
    label: 'Ley N.º 19.628 sobre protección de la vida privada',
  },
  {
    href: 'https://www.bcn.cl/leychile/Navegar?idNorma=1209272',
    label: 'Ley N.º 21.719 sobre protección de datos personales',
  },
  {
    href: 'https://www.bcn.cl/leychile/navegar?idNorma=1165504',
    label: 'Decreto N.º 6 de 2021, Reglamento de Comercio Electrónico',
  },
];

const pages: Record<LegalDocument, { title: string; intro: string }> = {
  terms: {
    title: 'Términos y condiciones',
    intro: 'Reglas para usar Spotly, explorar espacios, publicar anuncios y enviar solicitudes de arriendo.',
  },
  privacy: {
    title: 'Política de privacidad',
    intro: 'Información sobre los datos personales que Spotly trata, para qué los usa y cómo puedes ejercer tus derechos.',
  },
  cookies: {
    title: 'Política de cookies y tecnologías similares',
    intro: 'Qué tecnologías utiliza actualmente la aplicación para mantener la sesión y el funcionamiento del servicio.',
  },
};

function DraftNotice() {
  return (
    <aside className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5" role="note">
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="space-y-2 text-sm text-amber-950">
          <p className="font-bold">Borrador para completar antes de operar públicamente</p>
          <p>
            Falta identificar al responsable legal de Spotly y completar su RUT, domicilio y correo de contacto. También deben definirse los plazos de conservación de datos, los proveedores y regiones de alojamiento, y las reglas finales de cancelación y reembolso. No publiques estos textos como versión definitiva sin completar y revisar esos datos.
          </p>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-slate-200 py-6 last:border-0">
      <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-slate-700">{children}</div>
    </section>
  );
}

export function LegalPage({ document }: { document: LegalDocument }) {
  const page = pages[document];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Información legal · Spotly Chile</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{page.title}</h1>
          </div>
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-600">{page.intro}</p>
        <p className="mt-3 text-xs text-slate-500">Borrador · Versión 1.0 · 5 de octubre de 2026</p>
      </header>

      <nav aria-label="Documentos legales" className="my-5 flex flex-wrap gap-2">
        {documentLinks.map((item) => (
          <Link
            key={item.id}
            to={item.href}
            aria-current={document === item.id ? 'page' : undefined}
            className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${document === item.id ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <DraftNotice />

      <article className="rounded-3xl border border-slate-200 bg-white px-5 py-2 shadow-sm sm:px-8">
        {document === 'terms' && <TermsContent />}
        {document === 'privacy' && <PrivacyContent />}
        {document === 'cookies' && <CookiesContent />}
      </article>

      <footer className="mt-7 rounded-2xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
        <p className="font-bold text-slate-800">Normas de referencia</p>
        <ul className="mt-2 flex flex-col gap-2">
          {lawLinks.map((law) => (
            <li key={law.href}>
              <a href={law.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-blue-700 underline underline-offset-2 hover:text-blue-900">
                {law.label} <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}

function TermsContent() {
  return (
    <>
      <Section title="1. Quién ofrece Spotly y alcance">
        <p>Spotly es el nombre de la plataforma que permite consultar publicaciones de espacios y gestionar flujos de cuenta, publicación y solicitud de arriendo. La entidad que operará el servicio debe identificarse antes de aceptar reservas: <strong>[razón social o nombre completo del responsable]</strong>, RUT <strong>[RUT]</strong>, domicilio <strong>[domicilio en Chile]</strong>, correo <strong>[correo de contacto]</strong> y teléfono <strong>[teléfono]</strong>.</p>
        <p>La relación concreta entre Spotly, el propietario y quien arrienda debe indicarse claramente antes de confirmar cada operación. La publicación debe identificar quién ofrece el espacio y quién responde por sus condiciones.</p>
      </Section>

      <Section title="2. Requisitos y cuenta">
        <p>Para crear una cuenta debes tener al menos 18 años, entregar información exacta y mantenerla actualizada. Eres responsable de resguardar tus credenciales y de las acciones realizadas desde tu cuenta; avísanos mediante <strong>[correo de contacto]</strong> si sospechas un uso no autorizado.</p>
        <p>No crees cuentas en nombre de otra persona, no suplantes identidades ni uses Spotly para infringir la ley o los derechos de terceros.</p>
      </Section>

      <Section title="3. Publicaciones de espacios">
        <p>El propietario debe tener autorización para publicar y ofrecer el espacio. Debe proporcionar información veraz y actual sobre ubicación, características, fotografías, capacidad, equipamiento, precio, disponibilidad y reglas de uso; también debe mantenerla actualizada y responder por los permisos que le correspondan.</p>
        <p>Las fotografías y textos publicados pueden ser visibles para visitantes. No incluyas datos personales de otras personas ni contenido que no tengas derecho a compartir. Spotly puede revisar, pausar o retirar publicaciones que incumplan estos términos o la ley aplicable, sujeto a los derechos de las partes.</p>
      </Section>

      <Section title="4. Solicitudes, precios y reservas">
        <p>Antes de enviar una solicitud, revisa la publicación, las fechas, modalidad, precio total, cargos y reglas del espacio. Una solicitud pendiente no equivale por sí sola a una reserva confirmada. La pantalla debe indicar expresamente cuándo se acepta una solicitud y cuándo nace una obligación de pago.</p>
        <p>La política específica de cancelación, reembolso, cargos de servicio, impuestos y eventuales depósitos debe mostrarse antes de confirmar: <strong>[definir y publicar estas condiciones para cada operación]</strong>. Los derechos irrenunciables de consumidores establecidos por la ley prevalecen sobre cualquier cláusula de estos términos.</p>
      </Section>

      <Section title="5. Pagos y versión de prueba">
        <p>En la versión actual, el flujo denominado Webpay es una <strong>simulación</strong>: no procesa pagos con Transbank ni confirma una transacción bancaria real. No ingreses números reales de tarjeta, códigos de seguridad, claves bancarias ni otros datos financieros. Los códigos y estados que muestra este flujo pueden ser ficticios y no constituyen comprobantes de pago.</p>
        <p>Spotly no debe anunciar pagos, garantías, reembolsos ni custodia de fondos como operativos hasta integrar y comprobar el servicio real y explicar sus condiciones.</p>
      </Section>

      <Section title="6. Contratos y firma">
        <p>Los documentos que la versión actual genera o muestra son herramientas de apoyo y pueden contener datos incompletos. La generación de un PDF o una imagen de firma en pantalla no acredita por sí sola una firma electrónica avanzada ni sustituye la revisión de las partes. Revisa las condiciones y obtén asesoría independiente si lo necesitas antes de aceptar un contrato.</p>
      </Section>

      <Section title="7. Identidad y verificación">
        <p>El flujo de verificación puede solicitar imágenes de cédula, selfie u otros antecedentes. La interfaz y algunas respuestas del sistema todavía pueden operar en modo de prueba; no uses una aprobación mostrada por esta versión como certificación de identidad ni como decisión definitiva de elegibilidad.</p>
        <p>Cuando exista verificación real, Spotly informará antes de capturar los datos qué se recopila, para qué, qué proveedores lo procesan y cuánto tiempo se conserva. Al abrir el paso de verificación, el navegador puede solicitar acceso a la cámara; puedes rechazar ese permiso y no continuar con ese flujo.</p>
      </Section>

      <Section title="8. Uso responsable y contenido">
        <p>Usa Spotly de buena fe, respeta las reglas del espacio, los derechos de otras personas y las instrucciones de seguridad del propietario. No publiques contenido ilegal, discriminatorio, engañoso, dañino o que infrinja propiedad intelectual o privacidad.</p>
      </Section>

      <Section title="9. Disponibilidad, reclamos y cambios">
        <p>La plataforma puede cambiar, interrumpirse o contener errores durante su etapa de desarrollo. Esto no elimina los derechos que te reconoce la ley ni las obligaciones que Spotly o el oferente hayan asumido expresamente.</p>
        <p>Para consultas o reclamos escribe a <strong>[correo de atención]</strong> o llama al <strong>[teléfono de atención]</strong>. Domicilio del proveedor: <strong>[domicilio legal]</strong>. Spotly informará los cambios materiales a estos términos y su fecha de vigencia antes de aplicarlos a nuevas operaciones.</p>
      </Section>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <Section title="1. Responsable del tratamiento">
        <p>El responsable que debe completar y mantener esta política es <strong>[razón social o nombre completo]</strong>, RUT <strong>[RUT]</strong>, con domicilio en <strong>[domicilio en Chile]</strong>. Solicitudes de privacidad: <strong>[correo de privacidad]</strong>. Estos datos de contacto deben completarse antes de publicar la política.</p>
      </Section>

      <Section title="2. Datos que puede tratar la aplicación">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Cuenta:</strong> nombres, apellidos, RUT, correo, teléfono, fecha de nacimiento, género declarado, rol y datos de inicio de sesión gestionados por Supabase Auth.</li>
          <li><strong>Uso del servicio:</strong> publicaciones de espacios, ubicación, dirección que ingresa el propietario, fotos, precios, disponibilidad, favoritos, solicitudes de visita, reservas, contratos, mensajes de soporte y disputas.</li>
          <li><strong>Pagos de prueba:</strong> la simulación puede manejar en pantalla número de tarjeta y CVV ingresados por quien la usa, y generar metadatos ficticios como marca, últimos cuatro dígitos, titular, vencimiento, cuotas y códigos de autorización. No ingreses datos bancarios reales: este flujo no procesa pagos reales.</li>
          <li><strong>Verificación:</strong> según el flujo elegido, imágenes del frente y reverso de la cédula, selfie, RUT, nombre, número de serie, certificado u otros antecedentes aportados, resultados automáticos y notas de revisión. Estos archivos pueden incluir datos sensibles o biométricos.</li>
          <li><strong>Datos técnicos:</strong> el estado de sesión se conserva en el almacenamiento local del navegador. Los proveedores de alojamiento y autenticación pueden tratar datos técnicos necesarios para prestar, proteger y diagnosticar el servicio; deben precisarse según la configuración desplegada.</li>
        </ul>
      </Section>

      <Section title="3. Para qué se utilizan">
        <p>La aplicación usa los datos para crear y autenticar cuentas; permitir publicar y consultar espacios; gestionar solicitudes, visitas, reservas y documentos; mostrar el estado de una operación; prestar soporte; realizar revisiones de identidad cuando el usuario inicia ese proceso; prevenir abuso, mantener la seguridad y cumplir obligaciones legales.</p>
        <p>Los campos de publicación —que pueden incluir fotos, ubicación y nombre de propietario— son visibles a otras personas en el catálogo según la configuración de la aplicación. No publiques datos de terceros ni información personal que no quieras hacer pública.</p>
      </Section>

      <Section title="4. Proveedores y comunicaciones">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase:</strong> autenticación, base de datos y almacenamiento de archivos. El proyecto utiliza un bucket público para imágenes de espacios y buckets privados para documentos de verificación, biometría y contratos, sujetos a la configuración vigente del proyecto.</li>
          <li><strong>Vercel:</strong> alojamiento de la aplicación y ejecución de funciones de servidor.</li>
          <li><strong>Google Gemini API:</strong> cuando la clave de ese proveedor está configurada, las funciones de verificación pueden enviar imágenes de cédula, selfie y datos de referencia como nombre o RUT para análisis automatizado. Las condiciones de uso, retención y ubicación dependen del tipo de cuenta y configuración del proyecto de Google, que el responsable debe confirmar antes de procesar datos reales.</li>
          <li><strong>Transbank:</strong> la versión revisada no realiza una conexión real con Transbank; el flujo mostrado es simulado. No se debe interpretar la pantalla como pago procesado.</li>
        </ul>
        <p>Los proveedores pueden alojar o procesar datos fuera de Chile. Deben identificarse las regiones efectivas de Supabase, Vercel y Google y evaluarse las condiciones aplicables antes de operar con personas reales.</p>
      </Section>

      <Section title="5. Conservación y seguridad">
        <p>Los documentos de identidad, biometría y contratos se almacenan en buckets configurados como privados; las imágenes de espacios usan almacenamiento público. La aplicación genera enlaces temporales para revisar ciertos documentos privados. Ninguna medida técnica elimina por completo los riesgos de seguridad.</p>
        <p>El código no define un plazo automático general para borrar perfiles, documentos KYC, selfies, contratos o registros de reservas. El responsable debe establecer por escrito un plazo para cada categoría, aplicar borrado o anonimización cuando corresponda y documentar cualquier obligación de conservación: <strong>[completar plazos de retención]</strong>.</p>
      </Section>

      <Section title="6. Tus derechos y cómo solicitarlos">
        <p>Puedes solicitar información sobre el tratamiento de tus datos, acceso, corrección y, cuando proceda, eliminación, oposición, bloqueo o portabilidad conforme a la normativa aplicable. Envía la solicitud a <strong>[correo de privacidad]</strong> e identifica la cuenta involucrada. El responsable debe definir un proceso para comprobar la identidad del solicitante y responder dentro de los plazos legales.</p>
        <p>La Ley N.º 21.719 fue publicada con entrada en vigencia general el 1 de diciembre de 2026. Esta política debe revisarse y actualizarse antes de esa fecha, además de mantenerse conforme a la normativa vigente en cada momento.</p>
      </Section>

      <Section title="7. Menores, cambios y contacto">
        <p>El registro de Spotly está destinado a personas de 18 años o más y el formulario bloquea cuentas de personas menores de esa edad. Si detectas una cuenta de un menor, contacta a <strong>[correo de privacidad]</strong>.</p>
        <p>Responsable: <strong>[razón social y RUT]</strong>. Dirección: <strong>[domicilio legal]</strong>. Correo de privacidad: <strong>[correo]</strong>. Teléfono: <strong>[teléfono]</strong>. Fecha de actualización: 5 de octubre de 2026.</p>
      </Section>
    </>
  );
}

function CookiesContent() {
  return (
    <>
      <Section title="1. Qué encontramos en la versión actual">
        <p>La revisión del código de la aplicación no encontró llamadas propias a <code>document.cookie</code>, píxeles publicitarios ni herramientas de analítica como Google Analytics. Esto debe comprobarse nuevamente en el sitio desplegado, porque Vercel, Supabase u otros servicios pueden cambiar su comportamiento según la configuración.</p>
        <p>La autenticación de Supabase está configurada para mantener la sesión. El cliente de Supabase persiste por defecto la sesión en el almacenamiento local del navegador (<code>localStorage</code>), que es una tecnología distinta de una cookie.</p>
      </Section>

      <Section title="2. Tecnologías necesarias">
        <p>El almacenamiento local permite recordar que iniciaste sesión y renovar la sesión según la configuración de Supabase. Si borras los datos del sitio desde tu navegador, es posible que se cierre tu sesión y debas volver a ingresar.</p>
        <p>El navegador también puede guardar datos técnicos de red o funcionamiento para cargar la aplicación. La lista exacta de cookies o almacenamiento de terceros debe comprobarse en la versión de producción y actualizarse aquí si cambia.</p>
      </Section>

      <Section title="3. Analítica, publicidad y preferencias">
        <p>En el código revisado no se identificó analítica publicitaria ni cookies de seguimiento propias. Spotly no debe incorporar cookies no esenciales hasta informar sus finalidades, identificar a sus proveedores y habilitar el mecanismo de elección que corresponda.</p>
      </Section>

      <Section title="4. Cómo gestionar el almacenamiento">
        <p>Puedes revisar o borrar cookies y datos locales desde la configuración de tu navegador. La eliminación de datos esenciales puede cerrar tu sesión o impedir funciones que dependen de ella.</p>
        <p>Responsable: <strong>[razón social y RUT]</strong>. Consultas sobre privacidad y tecnologías de almacenamiento: <strong>[correo de privacidad]</strong>. Última actualización: 5 de octubre de 2026.</p>
      </Section>
    </>
  );
}
