import PDFDocument from "pdfkit";
import { Readable } from "stream";

interface QuoteItem {
  productName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  scheduleTime?: string;
  sortOrder?: number;
}

interface QuoteData {
  quoteNumber: string;
  date: string;
  clientName: string;
  clientEmail: string;
  clientCompany: string;
  clientPosition?: string;
  clientPhone?: string;
  clientWhatsapp?: string;
  clientRut?: string;
  clientAddress?: string;
  clientGiro?: string;
  numberOfPeople: number;
  eventDate?: string;
  eventDescription?: string;
  itinerary?: string;
  items: QuoteItem[];
  subtotal: number;
  tax: number;
  total: number;
  validUntil?: string;
  notes?: string;
  termsOfPurchase?: string;
  dealName?: string;
  sellerName?: string;
  sellerEmail?: string;
  sellerPhone?: string;
}

// Colores de marca Cancagua
const COLORS = {
  primary: "#4A5D23", // Verde Cancagua
  secondary: "#D4A574", // Dorado/Arena
  headerBg: "#F5E6D3", // Fondo beige claro
  text: "#333333",
  textLight: "#666666",
  white: "#FFFFFF",
  border: "#E5E5E5",
};

export async function generateQuotePDF(data: QuoteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = 515; // A4 width - margins
      const leftCol = 40;
      const rightCol = 300;

      // ============================================
      // HEADER - Estilo HubSpot
      // ============================================
      
      // Logo y nombre de la empresa
      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .text("Cancagua Spa & Retreat Center", leftCol, 40, { align: "center", width: pageWidth });

      // Línea decorativa
      doc
        .moveTo(leftCol, 70)
        .lineTo(leftCol + pageWidth, 70)
        .strokeColor(COLORS.secondary)
        .lineWidth(2)
        .stroke();

      // ============================================
      // BLOQUE DE INFORMACIÓN DEL CLIENTE (Estilo HubSpot)
      // ============================================
      
      let yPos = 90;
      
      // Fondo beige para el bloque del cliente
      doc
        .rect(leftCol, yPos, pageWidth, 100)
        .fillColor(COLORS.headerBg)
        .fill();

      yPos += 15;

      // Nombre del negocio/cotización (título grande)
      const displayName = data.dealName || data.clientCompany || data.clientName;
      doc
        .fontSize(16)
        .fillColor(COLORS.text)
        .text(displayName, leftCol + 15, yPos, { width: pageWidth - 30 });

      yPos += 25;

      // Información del cliente (columna izquierda)
      doc.fontSize(9).fillColor(COLORS.textLight);
      
      doc.text(data.clientName, leftCol + 15, yPos);
      yPos += 12;
      
      doc.text(data.clientEmail, leftCol + 15, yPos);
      yPos += 12;
      
      if (data.clientPhone) {
        doc.text(data.clientPhone, leftCol + 15, yPos);
        yPos += 12;
      }

      // Información de referencia (columna derecha)
      let rightYPos = 105;
      doc.fontSize(9).fillColor(COLORS.textLight);
      
      doc.text(`Referencia: ${data.quoteNumber}`, rightCol, rightYPos, { align: "right", width: 215 });
      rightYPos += 12;
      
      doc.text(`Creación del presupuesto: ${data.date}`, rightCol, rightYPos, { align: "right", width: 215 });
      rightYPos += 12;
      
      if (data.validUntil) {
        doc.text(`Caducidad del presupuesto: ${data.validUntil}`, rightCol, rightYPos, { align: "right", width: 215 });
        rightYPos += 12;
      }
      
      doc.text("Presupuesto creado por: Cancagua Spa &", rightCol, rightYPos, { align: "right", width: 215 });
      rightYPos += 10;
      doc.text("Retreat Center", rightCol, rightYPos, { align: "right", width: 215 });
      rightYPos += 15;
      
      // Contacto de Cancagua
      doc.fillColor(COLORS.primary);
      doc.text("contacto@cancagua.cl", rightCol, rightYPos, { align: "right", width: 215 });
      rightYPos += 10;
      doc.text("+56 9 8224 3411", rightCol, rightYPos, { align: "right", width: 215 });

      yPos = 200;

      // ============================================
      // BLOQUE DE COMENTARIOS/NOTAS (si existen)
      // ============================================
      
      if (data.notes) {
        doc
          .rect(leftCol, yPos, pageWidth, 80)
          .strokeColor(COLORS.border)
          .lineWidth(1)
          .stroke();

        yPos += 10;
        doc
          .fontSize(10)
          .fillColor(COLORS.text)
          .text("Comentarios de Cancagua Spa & Retreat Center", leftCol + 15, yPos);

        yPos += 15;
        doc
          .fontSize(9)
          .fillColor(COLORS.textLight)
          .text(data.notes, leftCol + 15, yPos, { width: pageWidth - 30 });

        yPos += Math.min(doc.heightOfString(data.notes, { width: pageWidth - 30 }), 50) + 20;
      }

      // ============================================
      // DATOS BANCARIOS (Información de pago)
      // ============================================
      
      const bankInfo = `Cuenta Bancaria
Banco: Santander
Cuenta: Corriente
No de Cuenta: 9569934-0
Nombre: Cancagua Spa y Centro de Bienestar Limitada
RUT: 77.926.863-2
Correo: eventos@cancagua.cl`;

      doc
        .rect(leftCol, yPos, pageWidth, 90)
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .stroke();

      yPos += 10;
      doc
        .fontSize(9)
        .fillColor(COLORS.textLight)
        .text(bankInfo, leftCol + 15, yPos, { width: pageWidth - 30 });

      yPos += 100;

      // ============================================
      // TABLA DE PRODUCTOS Y SERVICIOS
      // ============================================
      
      // Verificar si necesitamos nueva página
      if (yPos > 500) {
        doc.addPage();
        yPos = 40;
      }

      doc
        .fontSize(11)
        .fillColor(COLORS.text)
        .text("Productos y servicios", leftCol, yPos);

      yPos += 20;

      // Encabezado de tabla
      const colWidths = {
        name: 250,
        qty: 60,
        price: 80,
        total: 85,
      };

      // Fondo del encabezado
      doc
        .rect(leftCol, yPos, pageWidth, 25)
        .fillColor("#F8F8F8")
        .fill();

      doc
        .fontSize(8)
        .fillColor(COLORS.textLight);

      doc.text("Artículo y descripción", leftCol + 10, yPos + 8, { width: colWidths.name });
      doc.text("Cantidad", leftCol + colWidths.name, yPos + 8, { width: colWidths.qty, align: "center" });
      doc.text("Precio unitario", leftCol + colWidths.name + colWidths.qty, yPos + 8, { width: colWidths.price, align: "right" });
      doc.text("Total", leftCol + colWidths.name + colWidths.qty + colWidths.price, yPos + 8, { width: colWidths.total, align: "right" });

      yPos += 30;

      // Ordenar items por sortOrder si existe
      const sortedItems = [...data.items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      // Items de la tabla
      sortedItems.forEach((item, index) => {
        // Verificar si necesitamos nueva página
        if (yPos > 700) {
          doc.addPage();
          yPos = 40;
        }

        const itemHeight = item.description ? 45 : 30;

        // Línea separadora
        doc
          .moveTo(leftCol, yPos)
          .lineTo(leftCol + pageWidth, yPos)
          .strokeColor(COLORS.border)
          .lineWidth(0.5)
          .stroke();

        yPos += 8;

        // Nombre del producto
        doc
          .fontSize(10)
          .fillColor(COLORS.primary)
          .text(item.productName, leftCol + 10, yPos, { width: colWidths.name - 20 });

        // Descripción (si existe)
        if (item.description) {
          doc
            .fontSize(8)
            .fillColor(COLORS.textLight)
            .text(item.description, leftCol + 10, yPos + 14, { width: colWidths.name - 20 });
        }

        // Hora del itinerario (si existe)
        if (item.scheduleTime) {
          const descOffset = item.description ? 26 : 14;
          doc
            .fontSize(8)
            .fillColor(COLORS.textLight)
            .text(`⏰ ${item.scheduleTime}`, leftCol + 10, yPos + descOffset, { width: colWidths.name - 20 });
        }

        // Cantidad
        doc
          .fontSize(9)
          .fillColor(COLORS.text)
          .text(item.quantity.toString(), leftCol + colWidths.name, yPos, { width: colWidths.qty, align: "center" });

        // Precio unitario
        doc.text(`$${item.unitPrice.toLocaleString("es-CL")}`, leftCol + colWidths.name + colWidths.qty, yPos, { width: colWidths.price, align: "right" });

        // Total
        doc.text(`$${item.total.toLocaleString("es-CL")}`, leftCol + colWidths.name + colWidths.qty + colWidths.price, yPos, { width: colWidths.total, align: "right" });

        yPos += itemHeight;
      });

      // Línea final de la tabla
      doc
        .moveTo(leftCol, yPos)
        .lineTo(leftCol + pageWidth, yPos)
        .strokeColor(COLORS.border)
        .lineWidth(0.5)
        .stroke();

      yPos += 20;

      // ============================================
      // TOTALES
      // ============================================
      
      const totalsX = leftCol + 350;
      const totalsWidth = 165;

      // Subtotal
      doc
        .fontSize(10)
        .fillColor(COLORS.text);

      doc.text("Subtotal", totalsX, yPos, { width: 80 });
      doc.text(`$${data.subtotal.toLocaleString("es-CL")}`, totalsX + 80, yPos, { width: 85, align: "right" });

      yPos += 20;

      // Línea separadora
      doc
        .moveTo(totalsX, yPos)
        .lineTo(totalsX + totalsWidth, yPos)
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .stroke();

      yPos += 10;

      // Total
      doc
        .fontSize(12)
        .fillColor(COLORS.primary);

      doc.text("Total", totalsX, yPos, { width: 80 });
      doc.text(`$${data.total.toLocaleString("es-CL")}`, totalsX + 80, yPos, { width: 85, align: "right" });

      yPos += 40;

      // ============================================
      // TÉRMINOS DE COMPRA
      // ============================================
      
      if (yPos > 650) {
        doc.addPage();
        yPos = 40;
      }

      const terms = data.termsOfPurchase || `Cotización válida por 10 días
Para garantizar reserva se debe abonar el 50% del valor total
Valores IVA incluido`;

      doc
        .fontSize(10)
        .fillColor(COLORS.text)
        .text("Términos de la compra", leftCol, yPos);

      yPos += 15;

      doc
        .fontSize(9)
        .fillColor(COLORS.textLight)
        .text(terms, leftCol, yPos, { width: pageWidth });

      // ============================================
      // FOOTER
      // ============================================
      
      const footerY = 780;
      
      doc
        .fontSize(8)
        .fillColor(COLORS.textLight)
        .text(
          "Cancagua Spa & Retreat Center | Frutillar, Chile | contacto@cancagua.cl | +56 9 8224 3411",
          leftCol,
          footerY,
          { align: "center", width: pageWidth }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Función para generar PDF con el estilo antiguo (mantener compatibilidad)
export async function generateQuotePDFLegacy(data: QuoteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header - Logo y título
      doc
        .fontSize(24)
        .fillColor("#4A5D23")
        .text("CANCAGUA", 50, 50)
        .fontSize(10)
        .fillColor("#666666")
        .text("Spa & Retreat Center", 50, 78)
        .text("Frutillar, Chile", 50, 92);

      // Número de cotización y fecha
      doc
        .fontSize(14)
        .fillColor("#4A5D23")
        .text("COTIZACIÓN", 350, 50, { align: "right" })
        .fontSize(12)
        .fillColor("#666666")
        .text(data.quoteNumber, 350, 68, { align: "right" })
        .fontSize(10)
        .text(`Fecha: ${data.date}`, 350, 85, { align: "right" });

      if (data.validUntil) {
        doc.text(`Válida hasta: ${data.validUntil}`, 350, 100, {
          align: "right",
        });
      }

      // Línea separadora
      doc
        .moveTo(50, 120)
        .lineTo(545, 120)
        .strokeColor("#4A5D23")
        .lineWidth(2)
        .stroke();

      // Información del cliente
      let yPos = 140;
      doc
        .fontSize(12)
        .fillColor("#4A5D23")
        .text("DATOS DEL CLIENTE", 50, yPos);

      yPos += 20;
      doc.fontSize(10).fillColor("#333333");

      if (data.clientCompany) {
        doc.text(`Empresa: ${data.clientCompany}`, 50, yPos);
        yPos += 15;
      }

      if (data.clientRut) {
        doc.text(`RUT: ${data.clientRut}`, 50, yPos);
        yPos += 15;
      }

      if (data.clientGiro) {
        doc.text(`Giro: ${data.clientGiro}`, 50, yPos);
        yPos += 15;
      }

      doc.text(`Contacto: ${data.clientName}`, 50, yPos);
      yPos += 15;

      if (data.clientPosition) {
        doc.text(`Cargo: ${data.clientPosition}`, 50, yPos);
        yPos += 15;
      }

      doc.text(`Email: ${data.clientEmail}`, 50, yPos);
      yPos += 15;

      if (data.clientPhone) {
        doc.text(`Teléfono: ${data.clientPhone}`, 50, yPos);
        yPos += 15;
      }

      if (data.clientAddress) {
        doc.text(`Dirección: ${data.clientAddress}`, 50, yPos);
        yPos += 15;
      }

      doc.text(`Número de personas: ${data.numberOfPeople}`, 50, yPos);
      yPos += 25;

      // Descripción de la jornada
      if (data.eventDescription) {
        doc.fontSize(12).fillColor("#4A5D23").text("DESCRIPCIÓN", 50, yPos);
        yPos += 20;
        doc
          .fontSize(10)
          .fillColor("#333333")
          .text(data.eventDescription, 50, yPos, { width: 495 });
        yPos += doc.heightOfString(data.eventDescription, { width: 495 }) + 20;
      }

      // Itinerario
      if (data.itinerary) {
        doc.fontSize(12).fillColor("#4A5D23").text("ITINERARIO", 50, yPos);
        yPos += 20;
        doc
          .fontSize(10)
          .fillColor("#333333")
          .text(data.itinerary, 50, yPos, { width: 495 });
        yPos += doc.heightOfString(data.itinerary, { width: 495 }) + 25;
      }

      // Verificar si necesitamos nueva página
      if (yPos > 650) {
        doc.addPage();
        yPos = 50;
      }

      // Tabla de productos/servicios
      doc.fontSize(12).fillColor("#4A5D23").text("DETALLE DE SERVICIOS", 50, yPos);
      yPos += 20;

      // Encabezado de tabla
      doc
        .fontSize(9)
        .fillColor("#FFFFFF")
        .rect(50, yPos, 495, 20)
        .fillAndStroke("#4A5D23", "#4A5D23");

      doc.text("Servicio", 55, yPos + 5, { width: 200 });
      doc.text("Cantidad", 260, yPos + 5, { width: 60, align: "center" });
      doc.text("Precio Unit.", 325, yPos + 5, { width: 80, align: "right" });
      doc.text("Total", 410, yPos + 5, { width: 130, align: "right" });

      yPos += 25;

      // Items
      doc.fontSize(9).fillColor("#333333");
      data.items.forEach((item, index) => {
        // Verificar si necesitamos nueva página
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        // Fondo alternado
        if (index % 2 === 0) {
          doc.rect(50, yPos - 2, 495, 30).fillAndStroke("#F5F5F5", "#F5F5F5");
        }

        doc.fillColor("#333333");
        doc.text(item.productName, 55, yPos, { width: 200 });
        
        if (item.description) {
          doc
            .fontSize(8)
            .fillColor("#666666")
            .text(item.description, 55, yPos + 12, { width: 200 });
        }

        doc
          .fontSize(9)
          .fillColor("#333333")
          .text(item.quantity.toString(), 260, yPos, {
            width: 60,
            align: "center",
          });

        doc.text(`$${item.unitPrice.toLocaleString("es-CL")}`, 325, yPos, {
          width: 80,
          align: "right",
        });

        doc.text(`$${item.total.toLocaleString("es-CL")}`, 410, yPos, {
          width: 130,
          align: "right",
        });

        yPos += 35;
      });

      // Línea separadora
      yPos += 5;
      doc
        .moveTo(50, yPos)
        .lineTo(545, yPos)
        .strokeColor("#CCCCCC")
        .lineWidth(1)
        .stroke();

      yPos += 15;

      // Totales
      doc.fontSize(10).fillColor("#333333");

      doc.text("Subtotal:", 380, yPos, { width: 100, align: "right" });
      doc.text(`$${data.subtotal.toLocaleString("es-CL")}`, 485, yPos, {
        width: 60,
        align: "right",
      });

      yPos += 20;
      doc.text("IVA (19%):", 380, yPos, { width: 100, align: "right" });
      doc.text(`$${data.tax.toLocaleString("es-CL")}`, 485, yPos, {
        width: 60,
        align: "right",
      });

      yPos += 25;
      doc
        .fontSize(12)
        .fillColor("#4A5D23")
        .text("TOTAL:", 380, yPos, { width: 100, align: "right" });
      doc.text(`$${data.total.toLocaleString("es-CL")}`, 485, yPos, {
        width: 60,
        align: "right",
      });

      // Términos y condiciones
      yPos += 40;
      if (yPos > 650) {
        doc.addPage();
        yPos = 50;
      }

      doc
        .fontSize(10)
        .fillColor("#4A5D23")
        .text("TÉRMINOS Y CONDICIONES", 50, yPos);

      yPos += 20;
      doc
        .fontSize(8)
        .fillColor("#666666")
        .text(
          "• Esta cotización tiene una validez de 15 días desde la fecha de emisión.",
          50,
          yPos,
          { width: 495 }
        );

      yPos += 15;
      doc.text(
        "• Los precios incluyen IVA y están sujetos a disponibilidad.",
        50,
        yPos,
        { width: 495 }
      );

      yPos += 15;
      doc.text(
        "• Se requiere confirmación con al menos 48 horas de anticipación.",
        50,
        yPos,
        { width: 495 }
      );

      yPos += 15;
      doc.text(
        "• Políticas de cancelación: 100% de reembolso con 7 días de anticipación, 50% con 3 días, sin reembolso con menos de 48 horas.",
        50,
        yPos,
        { width: 495 }
      );

      // Footer
      const footerY = 750;
      doc
        .fontSize(8)
        .fillColor("#999999")
        .text(
          "Cancagua Spa & Retreat Center | Frutillar, Chile",
          50,
          footerY,
          { align: "center", width: 495 }
        );

      doc.text("contacto@cancagua.cl | +56 9 8224 3411", 50, footerY + 12, {
        align: "center",
        width: 495,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
