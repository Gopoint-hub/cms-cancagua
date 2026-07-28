function dateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Mes inválido");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1, 12);
  const end = new Date(year, monthNumber, 0, 12);
  return { start: dateString(start), end: dateString(end) };
}

export function nextCalendarMonth(value: string) {
  const month = value.slice(0, 7);
  const range = calendarMonthRange(month);
  const date = new Date(`${range.start}T12:00:00`);
  date.setMonth(date.getMonth() + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
