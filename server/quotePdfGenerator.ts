import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

interface QuoteItem {
  productName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  scheduleTime?: string;
  sortOrder?: number;
}

export interface QuoteData {
  quoteNumber: string;
  date: string;
  clientName: string;
  clientEmail: string;
  clientCompany: string;
  clientPosition?: string;
  clientPhone?: string;
  numberOfPeople: number;
  items: QuoteItem[];
  subtotal: number;
  tax: number;
  total: number;
  validUntil?: string;
  notes?: string;
  termsOfPurchase?: string;
  dealName?: string;
}

const COLORS = {
  paper: "#F4F2ED",
  canvas: "#FCF9F9",
  ink: "#222221",
  stone: "#827D78",
  stoneDark: "#635E5A",
  sage: "#696F4D",
  indigo: "#4B5872",
  indigoDark: "#333D51",
  white: "#FFFFFF",
  border: "#DDD8D0",
};

function findBrandAsset(relativePath: string): string | undefined {
  const candidates = [
    path.join(process.cwd(), "client/public/brand", relativePath),
    path.join(process.cwd(), "dist/public/brand", relativePath),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const money = (value: number) => `$${value.toLocaleString("es-CL")}`;

export async function generateQuotePDF(data: QuoteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 32, bottom: 48, left: 42, right: 42 },
        bufferPages: true,
        info: {
          Title: `Cotización ${data.quoteNumber}`,
          Author: "Cancagua",
          Subject: data.dealName || data.clientCompany || data.clientName,
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = 42;
      const width = doc.page.width - left * 2;
      const contentBottom = 750;
      const logoPath = findBrandAsset("logo/cancagua-wordmark-large-black.png");
      const fontPaths = {
        body: findBrandAsset("fonts/CoFoSans-Regular.otf"),
        medium: findBrandAsset("fonts/CoFoSans-Medium.otf"),
        serif: findBrandAsset("fonts/P22MackinacPro-Book.otf"),
        serifItalic: findBrandAsset("fonts/P22MackinacPro-BookItalic.otf"),
      };
      const fonts = {
        body: "Helvetica",
        medium: "Helvetica-Bold",
        serif: "Times-Roman",
        serifItalic: "Times-Italic",
      };
      if (fontPaths.body) {
        doc.registerFont("CoFo", fontPaths.body);
        fonts.body = "CoFo";
      }
      if (fontPaths.medium) {
        doc.registerFont("CoFo Medium", fontPaths.medium);
        fonts.medium = "CoFo Medium";
      }
      if (fontPaths.serif) {
        doc.registerFont("Mackinac", fontPaths.serif);
        fonts.serif = "Mackinac";
      }
      if (fontPaths.serifItalic) {
        doc.registerFont("Mackinac Italic", fontPaths.serifItalic);
        fonts.serifItalic = "Mackinac Italic";
      }

      const drawHeader = () => {
        if (logoPath) {
          doc.image(logoPath, (doc.page.width - 155) / 2, 31, { width: 155 });
        } else {
          doc.font(fonts.medium).fontSize(18).fillColor(COLORS.ink)
            .text("CANCAGUA", left, 32, { align: "center", width, characterSpacing: 2 });
        }
        doc.font(fonts.serifItalic).fontSize(7.5).fillColor(COLORS.stoneDark)
          .text("Restore Spa & Nature", left, 56, { align: "center", width });
        doc.moveTo(left, 77).lineTo(left + width, 77)
          .strokeColor(COLORS.border).lineWidth(0.7).stroke();
      };

      const addPage = () => {
        doc.addPage();
        drawHeader();
        return 99;
      };

      const label = (text: string, y: number, x = left) => {
        doc.font(fonts.medium).fontSize(7.2).fillColor(COLORS.sage)
          .text(text.toUpperCase(), x, y, { characterSpacing: 1.3 });
      };

      const drawTableHeader = (y: number) => {
        const columns = { name: 257, qty: 58, price: 92, total: 104 };
        doc.roundedRect(left, y, width, 28, 3).fill(COLORS.indigoDark);
        doc.font(fonts.medium).fontSize(7).fillColor(COLORS.white);
        doc.text("SERVICIO Y DESCRIPCIÓN", left + 12, y + 10, { width: columns.name - 12, characterSpacing: 0.45 });
        doc.text("CANT.", left + columns.name, y + 10, { width: columns.qty, align: "center" });
        doc.text("PRECIO UNIT.", left + columns.name + columns.qty, y + 10, { width: columns.price, align: "right" });
        doc.text("TOTAL", left + columns.name + columns.qty + columns.price, y + 10, { width: columns.total - 10, align: "right" });
        return { y: y + 34, columns };
      };

      drawHeader();
      let y = 96;
      label("Cotización", y);
      y += 18;

      const title = data.dealName || data.clientCompany || data.clientName;
      doc.font(fonts.serif).fontSize(21).fillColor(COLORS.ink)
        .text(title, left, y, { width: width - 150 });
      doc.font(fonts.medium).fontSize(8).fillColor(COLORS.indigo)
        .text(data.quoteNumber, left + width - 140, y + 3, {
          align: "right",
          width: 140,
          characterSpacing: 0.6,
        });
      doc.font(fonts.serif).fontSize(21);
      y += Math.max(34, doc.heightOfString(title, { width: width - 150 }) + 10);

      const infoTop = y;
      const infoHeight = 112;
      doc.roundedRect(left, infoTop, width, infoHeight, 8).fill(COLORS.paper);
      doc.moveTo(left + 272, infoTop + 15).lineTo(left + 272, infoTop + infoHeight - 15)
        .strokeColor(COLORS.border).lineWidth(0.7).stroke();

      label("Preparado para", infoTop + 17, left + 15);
      doc.font(fonts.medium).fontSize(10.5).fillColor(COLORS.ink)
        .text(data.clientName, left + 15, infoTop + 35, { width: 235 });
      let clientY = infoTop + 52;
      [data.clientCompany, data.clientPosition, data.clientEmail, data.clientPhone]
        .filter(Boolean)
        .forEach((line) => {
          doc.font(fonts.body).fontSize(8.5).fillColor(COLORS.stoneDark)
            .text(String(line), left + 15, clientY, { width: 235 });
          clientY += 12;
        });

      const metaX = left + 292;
      label("Detalles", infoTop + 17, metaX);
      const metaRows: string[][] = [
        ["Referencia", data.quoteNumber],
        ["Fecha", data.date],
        ...(data.validUntil ? [["Vigente hasta", data.validUntil]] : []),
        ...(data.numberOfPeople ? [["Personas", String(data.numberOfPeople)]] : []),
      ];
      let metaY = infoTop + 36;
      metaRows.forEach(([rowLabel, value]) => {
        doc.font(fonts.body).fontSize(8).fillColor(COLORS.stone)
          .text(rowLabel, metaX, metaY, { width: 80 });
        doc.font(fonts.medium).fontSize(8.5).fillColor(COLORS.ink)
          .text(value, metaX + 82, metaY, { width: 122, align: "right" });
        metaY += 16;
      });
      y = infoTop + infoHeight + 18;

      if (data.notes) {
        doc.font(fonts.body).fontSize(8.8);
        const noteWidth = width - 30;
        const noteHeight = Math.max(66, doc.heightOfString(data.notes, { width: noteWidth }) + 44);
        if (y + noteHeight > contentBottom) y = addPage();
        doc.roundedRect(left, y, width, noteHeight, 8).fillAndStroke(COLORS.canvas, COLORS.border);
        label("Comentarios de Cancagua", y + 14, left + 15);
        doc.font(fonts.body).fontSize(8.8).fillColor(COLORS.stoneDark)
          .text(data.notes, left + 15, y + 33, { width: noteWidth, lineGap: 2 });
        y += noteHeight + 16;
      }

      const bankHeight = 82;
      if (y + bankHeight > contentBottom) y = addPage();
      doc.roundedRect(left, y, width, bankHeight, 8).fill(COLORS.indigoDark);
      doc.font(fonts.medium).fontSize(7.2).fillColor(COLORS.white)
        .text("DATOS BANCARIOS", left + 15, y + 15, { characterSpacing: 1.2 });
      doc.font(fonts.serif).fontSize(13).fillColor(COLORS.white)
        .text("Transferencia bancaria", left + 15, y + 34, { width: 185 });
      doc.font(fonts.body).fontSize(7.8).fillColor("#E7E9ED")
        .text("Santander · Cuenta corriente · 9569934-0", left + 215, y + 17, { width: 280 });
      doc.text("Cancagua Spa y Centro de Bienestar Limitada", left + 215, y + 34, { width: 280 });
      doc.text("RUT 77.926.863-2 · eventos@cancagua.cl", left + 215, y + 51, { width: 280 });
      y += bankHeight + 22;

      if (y + 70 > contentBottom) y = addPage();
      label("Detalle", y);
      doc.font(fonts.serif).fontSize(18).fillColor(COLORS.ink)
        .text("Servicios incluidos", left, y + 14);
      y += 44;

      let table = drawTableHeader(y);
      y = table.y;
      const columns = table.columns;
      const sortedItems = [...data.items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      sortedItems.forEach((item) => {
        const textWidth = columns.name - 24;
        doc.font(fonts.medium).fontSize(9.5);
        const nameHeight = doc.heightOfString(item.productName, { width: textWidth });
        doc.font(fonts.body).fontSize(8);
        const descriptionHeight = item.description
          ? doc.heightOfString(item.description, { width: textWidth })
          : 0;
        const scheduleHeight = item.scheduleTime
          ? doc.heightOfString(`Horario: ${item.scheduleTime}`, { width: textWidth })
          : 0;
        const rowHeight = 18 + nameHeight
          + (descriptionHeight ? descriptionHeight + 4 : 0)
          + (scheduleHeight ? scheduleHeight + 4 : 0);

        if (y + rowHeight > contentBottom) {
          y = addPage();
          label("Detalle (continuación)", y);
          table = drawTableHeader(y + 18);
          y = table.y;
        }

        doc.moveTo(left, y).lineTo(left + width, y)
          .strokeColor(COLORS.border).lineWidth(0.5).stroke();
        const rowTop = y + 8;
        let textY = rowTop;
        doc.font(fonts.medium).fontSize(9.5).fillColor(COLORS.ink)
          .text(item.productName, left + 10, textY, { width: textWidth });
        textY += nameHeight;
        if (item.description) {
          textY += 4;
          doc.font(fonts.body).fontSize(8).fillColor(COLORS.stoneDark)
            .text(item.description, left + 10, textY, { width: textWidth });
          textY += descriptionHeight;
        }
        if (item.scheduleTime) {
          textY += 4;
          doc.font(fonts.body).fontSize(8).fillColor(COLORS.sage)
            .text(`Horario: ${item.scheduleTime}`, left + 10, textY, { width: textWidth });
        }
        doc.font(fonts.body).fontSize(8.7).fillColor(COLORS.ink)
          .text(String(item.quantity), left + columns.name, rowTop, { width: columns.qty, align: "center" });
        doc.text(money(item.unitPrice), left + columns.name + columns.qty, rowTop, { width: columns.price, align: "right" });
        doc.text(money(item.total), left + columns.name + columns.qty + columns.price, rowTop, { width: columns.total - 10, align: "right" });
        y += rowHeight;
      });

      doc.moveTo(left, y).lineTo(left + width, y)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke();
      y += 20;

      if (y + 95 > contentBottom) y = addPage();
      const totalX = left + 316;
      const totalWidth = 195;
      doc.roundedRect(totalX, y - 8, totalWidth, 78, 7).fill(COLORS.paper);
      doc.font(fonts.body).fontSize(9).fillColor(COLORS.stoneDark)
        .text("Subtotal", totalX + 12, y, { width: 75 });
      doc.text(money(data.subtotal), totalX + 87, y, { width: 96, align: "right" });
      y += 20;
      doc.moveTo(totalX + 12, y).lineTo(totalX + totalWidth - 12, y)
        .strokeColor(COLORS.border).lineWidth(0.7).stroke();
      y += 11;
      doc.font(fonts.medium).fontSize(11.5).fillColor(COLORS.indigoDark)
        .text("Total", totalX + 12, y, { width: 75 });
      doc.text(money(data.total), totalX + 87, y, { width: 96, align: "right" });
      y += 47;

      const terms = data.termsOfPurchase || `Cotización válida por 10 días
Para garantizar la reserva se debe abonar el 50% del valor total
Valores IVA incluido`;
      doc.font(fonts.body).fontSize(8.5);
      const termsHeight = doc.heightOfString(terms, { width });
      if (y + termsHeight + 38 > contentBottom) y = addPage();
      label("Términos de la compra", y);
      y += 18;
      doc.font(fonts.body).fontSize(8.5).fillColor(COLORS.stoneDark)
        .text(terms, left, y, { width, lineGap: 2 });

      const pages = doc.bufferedPageRange();
      for (let index = 0; index < pages.count; index += 1) {
        doc.switchToPage(index);
        doc.moveTo(left, 775).lineTo(left + width, 775)
          .strokeColor(COLORS.border).lineWidth(0.6).stroke();
        doc.font(fonts.body).fontSize(7.2).fillColor(COLORS.stone)
          .text("Frutillar · Lago Llanquihue · contacto@cancagua.cl · +56 9 8224 3411", left, 784, {
            width: width - 45,
          });
        doc.text(`${index + 1} / ${pages.count}`, left + width - 45, 784, {
          width: 45,
          align: "right",
        });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
