# Sistema de diseño Cancagua en el CMS

Esta carpeta conserva la fuente de verdad entregada en `Cancagua Design System.zip` para que los generadores actuales y futuros no vuelvan a reconstruir la marca desde prompts aislados.

- `foundations.md`: voz, color, tipografía, composición, logo y componentes.
- `email-system.md`: reglas específicas para mailings compatibles con clientes de correo.
- `social-composition.md`: composición para piezas de redes sociales.
- `colors.css`, `spacing.css`, `typography.css`: tokens originales.

La versión ejecutable que se inyecta en la IA vive en `server/brand/cancaguaDesignSystem.ts`. Los binarios licenciados y logos usados por las piezas están en `client/public/brand/` y se publican bajo `https://cms.cancagua.cl/brand/`.

Al agregar un nuevo generador visual, debe importar la fuente central del servidor correspondiente; no debe crear una paleta, una voz o una jerarquía tipográfica paralela.
