import * as db from "./db";

/**
 * Genera el siguiente número de cotización disponible
 * Formato: COT-1000, COT-1001, etc.
 */
export async function generateQuoteNumber(): Promise<string> {
  const allQuotes = await db.getAllQuotes();
  
  if (allQuotes.length === 0) {
    return "COT-1000";
  }
  
  // Extraer números de todas las cotizaciones existentes
  const numbers = allQuotes
    .map(q => {
      const match = q.quoteNumber.match(/COT-(\d+)/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(n => n > 0);
  
  const maxNumber = Math.max(...numbers, 999);
  const nextNumber = maxNumber + 1;
  
  return `COT-${nextNumber}`;
}

/**
 * Genera un itinerario automático basado en los productos seleccionados
 */
export function generateItinerary(items: Array<{ productName: string; duration?: number }>, numberOfPeople: number): string {
  const lines: string[] = [];
  
  lines.push(`ITINERARIO PROPUESTO - ${numberOfPeople} personas\n`);
  lines.push("Horario de atención: 10:00 - 18:00\n");
  
  let currentTime = "10:00";
  
  // Ordenar items por duración para crear un flujo lógico
  const sortedItems = [...items].sort((a, b) => {
    const durationA = a.duration || 0;
    const durationB = b.duration || 0;
    return durationB - durationA;
  });
  
  for (const item of sortedItems) {
    if (item.duration && item.duration > 0) {
      const durationHours = Math.floor(item.duration / 60);
      const durationMins = item.duration % 60;
      const durationStr = durationHours > 0 
        ? `${durationHours}h ${durationMins > 0 ? durationMins + 'min' : ''}`
        : `${durationMins}min`;
      
      lines.push(`${currentTime} - ${item.productName} (${durationStr})`);
      
      // Calcular siguiente hora (simplificado)
      const [hours, mins] = currentTime.split(":").map(Number);
      const totalMins = hours * 60 + mins + item.duration;
      const nextHours = Math.floor(totalMins / 60);
      const nextMins = totalMins % 60;
      currentTime = `${String(nextHours).padStart(2, '0')}:${String(nextMins).padStart(2, '0')}`;
    } else {
      lines.push(`• ${item.productName}`);
    }
  }
  
  lines.push("\n*El itinerario puede ajustarse según las necesidades del grupo");
  
  return lines.join("\n");
}

/**
 * Calcula la fecha de validez de la cotización (10 días desde hoy)
 */
export function calculateValidUntil(): string {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return date.toISOString().split('T')[0];
}
