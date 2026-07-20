// ─────────────────────────────────────────────────────────────────────────────
// email.ts — envío de correo transaccional a través de Resend.
//
// Usamos la API HTTP de Resend con fetch en lugar de su SDK: es una única
// petición POST y así evitamos añadir una dependencia más al proyecto.
//
// Si RESEND_API_KEY no está configurada, en lugar de fallar se imprime el
// contenido por consola. Esto permite probar el registro y la verificación de
// extremo a extremo en local sin cuenta de Resend: el enlace aparece en el log
// del servidor y basta con pegarlo en el navegador. En producción la ausencia
// de la clave sí se considera un error, porque ahí nadie lee los logs a tiempo.
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// Remitente por defecto. onboarding@resend.dev es el dominio de pruebas de
// Resend: funciona sin configurar DNS, pero solo entrega correos a la dirección
// con la que se registró la cuenta. Para enviar a cualquier destinatario hay
// que verificar un dominio propio y ponerlo en RESEND_FROM.
const DEFAULT_FROM = 'Kosmos <onboarding@resend.dev>'

type SendEmailArgs = {
  to: string
  subject: string
  html: string
  // Alternativa en texto plano; se muestra en el log cuando no hay API key.
  text: string
}

export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY no está configurada: no se puede enviar el correo')
    }
    console.info(
      `\n──────── CORREO (modo desarrollo, sin RESEND_API_KEY) ────────\n` +
      `Para:    ${to}\n` +
      `Asunto:  ${subject}\n\n` +
      `${text}\n` +
      `──────────────────────────────────────────────────────────────\n`,
    )
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  })

  if (!res.ok) {
    // El cuerpo de error de Resend explica la causa (dominio sin verificar,
    // clave inválida, destinatario no permitido en el dominio de pruebas...).
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend respondió ${res.status}: ${detail}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Correo de confirmación de cuenta
// ─────────────────────────────────────────────────────────────────────────────

// ── Restricciones del maquetado de correo ───────────────────────────────────
// El HTML de un correo no es el de una página. Lo que se hace aquí y por qué:
//
//   · Tablas en lugar de flex/grid. Outlook usa el motor de Word, que no
//     soporta ninguno de los dos.
//   · Estilos en línea, no en <style>. Gmail descarta buena parte de las hojas
//     incrustadas, pero respeta el atributo style.
//   · Nada de SVG. Gmail, Outlook y Yahoo no lo renderizan, así que el
//     logotipo va como PNG (/kosmos-logo-email.png) servido desde una URL
//     absoluta: los clientes lo descargan desde fuera, no desde el mensaje.
//   · Nada de gradientes en texto. background-clip:text no existe en correo;
//     por eso el degradado del wordmark viene ya pintado en el PNG.
//   · El degradado del botón va como background-image con un bgcolor sólido
//     debajo: Outlook ignora el primero y se queda con el segundo.
//   · Nada de tipografías web. @font-face no carga en la mayoría de clientes:
//     Montserrat encabeza la pila pero lo normal es que se vea la alternativa
//     del sistema, así que el diseño no depende de ella.
//   · Colores calcados de globals.css para que el correo y la aplicación se
//     reconozcan como lo mismo.
export function verificationEmail(firstName: string, verifyUrl: string) {
  const subject = 'Confirma tu cuenta de Kosmos'

  const text =
    `Hola ${firstName},\n\n` +
    `Confirma tu dirección de correo para activar tu cuenta de Kosmos:\n\n` +
    `${verifyUrl}\n\n` +
    `El enlace caduca en 24 horas.\n\n` +
    `Si no creaste esta cuenta, ignora este mensaje.`

  // El logotipo se sirve desde la misma URL pública que el enlace de
  // verificación. Tiene que ser absoluta: el cliente de correo la descarga
  // desde fuera del mensaje, así que una ruta relativa nunca resolvería.
  //
  // En desarrollo esto apunta a localhost y la imagen NO se verá en un correo
  // real (el servidor no es accesible desde internet). El alt de respaldo
  // deja el nombre visible mientras tanto.
  const origin = new URL(verifyUrl).origin
  const logoUrl = `${origin}/kosmos-logo-email.png`

  // Degradado del botón. bgcolor es el tono medio que verá Outlook, que no
  // soporta background-image.
  const buttonSolid = '#8b5ea0'
  const buttonGradient =
    'linear-gradient(90deg,#227AA0 0%,#6D689E 34%,#C94A9C 70%,#9F85C3 100%)'

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:40px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e6e6ec;border-radius:20px;">

        <!-- Logotipo. width en el atributo además del style porque Outlook
             ignora el CSS de dimensiones en imágenes.
             Los estilos de tipografía y color NO son decorativos: cuando la
             imagen no carga —Outlook y Gmail bloquean las remotas por defecto,
             y en desarrollo la URL apunta a localhost— el cliente pinta el alt
             heredando esos estilos, así que el respaldo se lee como el wordmark
             en vez de como una etiqueta suelta. De ahí también el alt en
             mayúsculas y el espaciado entre letras. -->
        <tr>
          <td align="center" style="padding:40px 32px 0;">
            <img src="${logoUrl}" alt="KOSMOS" width="220"
                 style="display:block;margin:0 auto;width:220px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:24px;font-weight:600;letter-spacing:7px;color:#6d689e;text-align:center;">
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style="padding:34px 32px 0;">
            <h1 style="margin:0 0 14px;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:21px;font-weight:600;color:#1c1c28;">
              Hola ${firstName},
            </h1>
            <p style="margin:0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#55556a;">
              Confirma tu dirección de correo para activar tu cuenta y empezar a
              medir tu coherencia operativa.
            </p>
          </td>
        </tr>

        <!-- Botón. Va como tabla y no como <a> suelto para que Outlook
             respete el relleno: allí el padding de un enlace se ignora. -->
        <tr>
          <td align="center" style="padding:30px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${buttonSolid}"
                    style="border-radius:12px;background-color:${buttonSolid};background-image:${buttonGradient};">
                  <a href="${verifyUrl}"
                     style="display:inline-block;padding:15px 36px;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">
                    Confirmar mi cuenta
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Enlace de respaldo -->
        <tr>
          <td style="padding:30px 32px 0;">
            <p style="margin:0 0 6px;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a8a99;">
              El enlace caduca en 24 horas. Si el botón no funciona, copia esta dirección:
            </p>
            <p style="margin:0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8b5ea0;word-break:break-all;">
              ${verifyUrl}
            </p>
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td style="padding:26px 32px 34px;">
            <div style="height:1px;background-color:#e6e6ec;font-size:0;line-height:0;">&nbsp;</div>
            <p style="margin:20px 0 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a8a99;">
              Si no creaste esta cuenta, ignora este mensaje.
            </p>
          </td>
        </tr>

      </table>

      <p style="margin:22px 0 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:11px;color:#a0a0b0;letter-spacing:0.4px;">
        Kosmos · Mide tu coherencia operativa
      </p>

    </td>
  </tr>
</table>
  `.trim()

  return { subject, html, text }
}
