import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

export interface GiftCardData {
  amount: number;
  recipientName: string;
  recipientEmail: string;
  message?: string;
  backgroundImage: string;
  code: string;
}

// Función para descargar imagen desde URL y convertirla a PNG
async function downloadAndConvertImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    
    protocol.get(url, async (response) => {
      // Manejar redirecciones
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadAndConvertImage(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", async () => {
        try {
          const imageBuffer = Buffer.concat(chunks);
          
          // Usar sharp para convertir a PNG (formato que PDFKit maneja bien)
          const sharp = (await import("sharp")).default;
          const pngBuffer = await sharp(imageBuffer)
            .png()
            .toBuffer();
          
          resolve(pngBuffer);
        } catch (conversionError) {
          console.error("Error convirtiendo imagen:", conversionError);
          reject(conversionError);
        }
      });
      response.on("error", reject);
    }).on("error", reject);
  });
}

export async function generateGiftCardPDF(data: GiftCardData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      // Tamaño tipo tarjeta de regalo (proporción 16:9 aproximada)
      const doc = new PDFDocument({ size: [700, 400], margin: 0 });
      const buffers: Buffer[] = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      let backgroundApplied = false;

      // Intentar cargar imagen de fondo
      if (data.backgroundImage) {
        try {
          // Si es una URL de Cloudinary o externa
          if (data.backgroundImage.startsWith("http")) {
            console.log("Descargando imagen de fondo desde:", data.backgroundImage);
            const imageBuffer = await downloadAndConvertImage(data.backgroundImage);
            doc.image(imageBuffer, 0, 0, { width: 700, height: 400, cover: [700, 400] });
            backgroundApplied = true;
          } else {
            // Si es una ruta local
            const backgroundPath = path.join(
              process.cwd(),
              "client/public",
              data.backgroundImage
            );
            
            if (fs.existsSync(backgroundPath)) {
              // Convertir imagen local también a PNG
              const sharp = (await import("sharp")).default;
              const pngBuffer = await sharp(backgroundPath)
                .png()
                .toBuffer();
              doc.image(pngBuffer, 0, 0, { width: 700, height: 400, cover: [700, 400] });
              backgroundApplied = true;
            }
          }
        } catch (imgError) {
          console.error("Error cargando imagen de fondo:", imgError);
        }
      }

      // Fallback: color sólido si no se pudo cargar la imagen
      if (!backgroundApplied) {
        doc.rect(0, 0, 700, 400).fillOpacity(1).fill("#2F5233");
      }

      // Overlay semi-transparente solo en el lado izquierdo para mejorar legibilidad del texto
      doc.rect(0, 0, 350, 400).fillOpacity(0.35).fill("#000000");

      // Logo Cancagua (versión blanca) - descargado desde Cloudinary
      const logoWhiteUrl = "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769960664/cancagua/images/logo-cancagua-white.webp";
      const logoUrl = "https://res.cloudinary.com/dhuln9b1n/image/upload/v1770308861/cancagua/images/01_logo-cancagua.png";
      
      try {
        const sharp = (await import("sharp")).default;
        // Intentar descargar logo blanco primero
        let logoBuffer: Buffer | null = null;
        try {
          const resp = await fetch(logoWhiteUrl);
          if (resp.ok) {
            const arrayBuf = await resp.arrayBuffer();
            logoBuffer = await sharp(Buffer.from(arrayBuf)).png().toBuffer();
          }
        } catch {
          // Fallback al logo normal
          try {
            const resp = await fetch(logoUrl);
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              logoBuffer = await sharp(Buffer.from(arrayBuf)).png().toBuffer();
            }
          } catch { /* ignore */ }
        }
        if (logoBuffer) {
          doc.image(logoBuffer, 30, 25, { width: 100 });
        }
      } catch (logoError) {
        console.error("Error cargando logo:", logoError);
      }

      // Texto "Gift Card"
      doc
        .fillOpacity(1)
        .fillColor("#FFFFFF")
        .fontSize(14)
        .font("Helvetica")
        .text("Gift Card", 30, 100);

      // Monto - más grande y prominente
      doc
        .fontSize(52)
        .font("Helvetica-Bold")
        .fillColor("#FFFFFF")
        .text(
          new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
          }).format(data.amount),
          30,
          130
        );

      // Destinatario
      if (data.recipientName) {
        doc
          .fontSize(16)
          .font("Helvetica")
          .fillColor("#FFFFFF")
          .text(`Para: ${data.recipientName}`, 30, 200);
      }

      // Mensaje personalizado (si existe)
      if (data.message) {
        doc
          .fontSize(11)
          .font("Helvetica-Oblique")
          .fillColor("#E0E0E0")
          .text(`"${data.message}"`, 30, 235, {
            width: 300,
            align: "left",
          });
      }

      // Código de la gift card
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#CCCCCC")
        .text(`Código: ${data.code}`, 30, 340);

      // Información adicional en la parte inferior
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#AAAAAA")
        .text("Válida por 1 año | Cancagua Spa & Retreat Center", 30, 360);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
