// Separa cada cláusula ("PRIMERO (TÍTULO): texto") en número, título y cuerpo
// para mostrarla con encabezados reales. El texto guardado y sellado con
// SHA-256 no cambia: esto es solo presentación.

export interface ParsedClause {
  /** "Primero", "Segundo"… o null si la cláusula no sigue el formato. */
  ordinal: string | null;
  /** "Comparecencia y personería legal", o null. */
  title: string | null;
  body: string;
}

const CLAUSE_RE = /^\s*([A-ZÁÉÍÓÚÑ]+)\s*\(([^)]+)\)\s*:\s*([\s\S]*)$/;

const sentenceCase = (text: string) => {
  const lower = text.toLocaleLowerCase('es-CL').trim();
  return lower.charAt(0).toLocaleUpperCase('es-CL') + lower.slice(1);
};

export function parseClause(clause: string): ParsedClause {
  const match = CLAUSE_RE.exec(clause);
  if (!match) return { ordinal: null, title: null, body: clause.trim() };
  return {
    ordinal: sentenceCase(match[1]),
    title: sentenceCase(match[2]),
    body: match[3].trim(),
  };
}
