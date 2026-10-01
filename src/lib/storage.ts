import { supabase, isSupabaseConfigured } from './supabase.ts';

/**
 * Convierte un dataUrl en formato Base64 a un objeto Blob
 */
function base64ToBlob(base64Data: string, defaultContentType = 'image/jpeg'): Blob {
  const parts = base64Data.split(';base64,');
  if (parts.length !== 2) throw new Error('El archivo seleccionado no tiene un formato válido.');
  const contentType = parts[0].replace('data:', '') || defaultContentType;
  try {
    const raw = window.atob(parts[1]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: contentType });
  } catch {
    throw new Error('No se pudo leer el archivo seleccionado. Vuelve a cargarlo.');
  }
}

const KYC_MAX_FILE_SIZE = 10 * 1024 * 1024;
const KYC_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function getKycFileExtension(blob: Blob): string {
  if (blob.type === 'application/pdf') return 'pdf';
  if (blob.type === 'image/png') return 'png';
  if (blob.type === 'image/jpeg') return 'jpg';
  throw new Error('Formato no permitido. Usa una imagen JPG/PNG o un archivo PDF.');
}

function validateKycBlob(blob: Blob, allowedTypes = KYC_ALLOWED_TYPES): void {
  if (!blob.size) throw new Error('El archivo está vacío o no se pudo leer.');
  if (blob.size > KYC_MAX_FILE_SIZE) throw new Error('El archivo supera el límite de 10 MB.');
  if (!allowedTypes.has(blob.type)) {
    throw new Error('Formato no permitido. Usa una imagen JPG/PNG o un archivo PDF.');
  }
}

/**
 * Sube una imagen de propiedad al bucket público 'spaces'
 */
export async function uploadSpaceImage(
  fileOrBase64: File | Blob | string,
  spaceId: string
): Promise<string> {
  if (!isSupabaseConfigured()) {
    if (typeof fileOrBase64 === 'string') return fileOrBase64;
    return URL.createObjectURL(fileOrBase64);
  }

  try {
    let blob: Blob;
    let extension = 'jpg';

    if (typeof fileOrBase64 === 'string') {
      blob = base64ToBlob(fileOrBase64);
    } else {
      blob = fileOrBase64;
      if (fileOrBase64 instanceof File) {
        extension = fileOrBase64.name.split('.').pop() || 'jpg';
      }
    }

    const fileName = `${spaceId}/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${extension}`;
    const { data, error } = await supabase.storage
      .from('spaces')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('Error al subir imagen de espacio a Storage:', error.message);
      return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
    }

    const { data: publicUrlData } = supabase.storage
      .from('spaces')
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err: any) {
    console.warn('Excepción al subir imagen a Supabase Storage:', err);
    return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
  }
}

/**
 * Sube una foto de cédula o certificado de antecedentes al bucket privado 'kyc-documents'
 */
export async function uploadKycDocument(
  fileOrBase64: File | Blob | string,
  userId: string,
  type: 'front' | 'back' | 'criminal_record'
): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no está configurado. No se pueden guardar los documentos todavía.');
  }

  const blob = typeof fileOrBase64 === 'string' ? base64ToBlob(fileOrBase64) : fileOrBase64;
  validateKycBlob(
    blob,
    type === 'criminal_record' ? KYC_ALLOWED_TYPES : new Set(['image/jpeg', 'image/png'])
  );
  const extension = getKycFileExtension(blob);
  const fileName = `${userId}/${type}-${Date.now()}.${extension}`;
  const { data, error } = await supabase.storage.from('kyc-documents').upload(fileName, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: blob.type,
  });

  if (error) {
    console.error('Error al subir documento KYC a Storage:', error.message);
    throw new Error(`No se pudo guardar el documento (${error.message}). Verifica la conexión y las políticas de Storage en Supabase.`);
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from('kyc-documents')
    .createSignedUrl(data.path, 60 * 60 * 48);
  if (signError || !signedData) {
    console.error('Error al generar enlace privado para documento KYC:', signError?.message);
    throw new Error('El archivo se subió, pero no se pudo preparar el acceso privado para su revisión.');
  }
  return signedData.signedUrl;
}

/**
 * Sube una captura facial biométrica al bucket privado 'kyc-biometrics'
 */
export async function uploadBiometricPhoto(
  fileOrBase64: File | Blob | string,
  userId: string
): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no está configurado. No se puede guardar la foto biométrica todavía.');
  }

  const blob = typeof fileOrBase64 === 'string' ? base64ToBlob(fileOrBase64) : fileOrBase64;
  validateKycBlob(blob, new Set(['image/jpeg', 'image/png', 'image/webp']));
  const extension = getKycFileExtension(blob);
  const fileName = `${userId}/face-${Date.now()}.${extension}`;
  const { data, error } = await supabase.storage.from('kyc-biometrics').upload(fileName, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: blob.type,
  });

  if (error) {
    console.error('Error al subir selfie biométrica a Storage:', error.message);
    throw new Error(`No se pudo guardar la foto biométrica (${error.message}). Verifica las políticas de Storage en Supabase.`);
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from('kyc-biometrics')
    .createSignedUrl(data.path, 60 * 60 * 48);
  if (signError || !signedData) {
    console.error('Error al generar enlace privado para foto biométrica:', signError?.message);
    throw new Error('La foto se subió, pero no se pudo preparar el acceso privado para su revisión.');
  }
  return signedData.signedUrl;
}

/**
 * Sube un PDF o comprobante de contrato firmado al bucket privado 'contracts'
 */
export async function uploadContractPdf(
  fileOrBlob: Blob | File,
  contractId: string
): Promise<string> {
  if (!isSupabaseConfigured()) {
    return URL.createObjectURL(fileOrBlob);
  }

  try {
    const fileName = `${contractId}/contrato-${contractId}.pdf`;
    const { data, error } = await supabase.storage
      .from('contracts')
      .upload(fileName, fileOrBlob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('Error al subir contrato PDF a Storage:', error.message);
      return URL.createObjectURL(fileOrBlob);
    }

    const { data: signedData } = await supabase.storage
      .from('contracts')
      .createSignedUrl(data.path, 60 * 60 * 72);

    return signedData?.signedUrl || data.path;
  } catch (err: any) {
    console.warn('Excepción al subir contrato PDF:', err);
    return URL.createObjectURL(fileOrBlob);
  }
}
