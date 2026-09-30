import { supabase, isSupabaseConfigured } from './supabase.ts';

/**
 * Convierte un dataUrl en formato Base64 a un objeto Blob
 */
function base64ToBlob(base64Data: string, defaultContentType = 'image/jpeg'): Blob {
  try {
    const parts = base64Data.split(';base64,');
    const contentType = parts[0].replace('data:', '') || defaultContentType;
    const raw = window.atob(parts[1] || parts[0]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  } catch (err) {
    console.warn('Error al convertir base64 a Blob:', err);
    return new Blob([], { type: defaultContentType });
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
    return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
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

    const fileName = `${userId}/${type}-${Date.now()}.${extension}`;
    const { data, error } = await supabase.storage
      .from('kyc-documents')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('Error al subir documento KYC a Storage:', error.message);
      return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
    }

    // Como es bucket privado, generamos una URL firmada válida por 48 horas
    const { data: signedData, error: signError } = await supabase.storage
      .from('kyc-documents')
      .createSignedUrl(data.path, 60 * 60 * 48);

    if (signError || !signedData) {
      return data.path;
    }

    return signedData.signedUrl;
  } catch (err: any) {
    console.warn('Excepción al subir documento KYC:', err);
    return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
  }
}

/**
 * Sube una captura facial biométrica al bucket privado 'kyc-biometrics'
 */
export async function uploadBiometricPhoto(
  fileOrBase64: File | Blob | string,
  userId: string
): Promise<string> {
  if (!isSupabaseConfigured()) {
    return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
  }

  try {
    const blob = typeof fileOrBase64 === 'string' ? base64ToBlob(fileOrBase64) : fileOrBase64;
    const fileName = `${userId}/face-${Date.now()}.jpg`;

    const { data, error } = await supabase.storage
      .from('kyc-biometrics')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('Error al subir selfie biométrica a Storage:', error.message);
      return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from('kyc-biometrics')
      .createSignedUrl(data.path, 60 * 60 * 48);

    if (signError || !signedData) {
      return data.path;
    }

    return signedData.signedUrl;
  } catch (err: any) {
    console.warn('Excepción al subir selfie biométrica:', err);
    return typeof fileOrBase64 === 'string' ? fileOrBase64 : URL.createObjectURL(fileOrBase64);
  }
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
