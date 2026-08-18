import { customAlphabet } from "nanoid";

// El alfabeto por defecto de nanoid incluye "-" y "_", y con `nanoid(6)` eso
// producía códigos como BIO-20260818--TGS6T: doble guión cuando el sufijo
// empezaba con "-". Acá el alfabeto es solo mayúsculas y dígitos.
//
// Se excluyen además I, O, 0 y 1, que se confunden al dictar un código de
// reserva por teléfono o al leerlo de una pantalla.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const bookingCodeSuffix = customAlphabet(ALFABETO, 6);

/** Arma un código de reserva a partir de un prefijo y la fecha de la reserva. */
export function buildBookingCode(prefix: string, bookingDate: unknown): string {
  const fecha = String(bookingDate).slice(0, 10).replaceAll("-", "");
  return `${prefix}-${fecha}-${bookingCodeSuffix()}`;
}
