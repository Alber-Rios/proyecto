// Resultados de la validación local de encuadre en los escáneres de cámara.
// La verificación de identidad la hace el administrador revisando la cédula,
// la selfie y el certificado de antecedentes que sube el usuario.

export interface IdFrameVerificationResult {
  success: boolean;
  provider: string;
  isIdCardPresent: boolean;
  isChileanCedula?: boolean;
  detectedSide?: 'front' | 'back' | 'unknown';
  confidence: number;
  feedbackMessage: string;
  extractedRut?: string;
}

export interface FaceFrameVerificationResult {
  success: boolean;
  provider: string;
  isFacePresent: boolean;
  isCentered: boolean;
  livenessLikely: boolean;
  confidence: number;
  feedbackMessage: string;
}
