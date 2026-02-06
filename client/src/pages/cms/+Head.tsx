export default function Head() {
  return (
    <>
      {/* Bloquear indexación de todas las páginas del CMS */}
      <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
      <meta name="googlebot" content="noindex, nofollow" />
      <title>CMS Cancagua</title>
    </>
  );
}
