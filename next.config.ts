import type { NextConfig } from "next";

// ─────────────────────────────────────────────────────────────────────────────
// Cabeceras de seguridad
//
// Se aplican a todas las rutas. `/:path*` incluye las anidadas, así que una
// sola entrada cubre páginas, API y estáticos.
//
// Lo que defiende cada una:
//
//   · Strict-Transport-Security — el navegador recuerda durante un año que
//     este dominio solo se sirve por HTTPS, así que un primer enlace en http://
//     no llega a viajar en claro. Sin `preload`: esa lista se solicita aparte y
//     salir de ella cuesta meses, de modo que no conviene comprometerse desde
//     la configuración.
//
//   · X-Frame-Options y frame-ancestors — impiden que otro sitio meta Kosmos
//     en un iframe invisible y engañe al trader para que pulse donde no cree
//     (clickjacking). Van las dos porque la primera es la antigua y la segunda
//     la que miran los navegadores actuales; donde se entienden ambas, gana
//     frame-ancestors.
//
//   · X-Content-Type-Options — obliga a respetar el Content-Type declarado.
//     Sin ella, un navegador puede "adivinar" que algo subido como texto es en
//     realidad un script y ejecutarlo.
//
//   · Referrer-Policy — al salir hacia otro dominio solo se manda el origen,
//     nunca la ruta completa. Importa aquí porque el enlace de confirmación
//     lleva el token en la query: sin esta cabecera, cualquier recurso externo
//     cargado desde /verify recibiría ese token en el Referer.
//
//   · Permissions-Policy — Kosmos no usa cámara, micrófono ni ubicación, así
//     que se deniegan de entrada y ningún script incrustado puede pedirlas.
//
// Falta una CSP completa (script-src / style-src). Hacerla bien en Next exige
// generar un nonce por petición desde proxy.ts, y eso obliga a renderizar en
// dinámico: /login, /register y /verify dejarían de ser estáticas. Queda
// pendiente como decisión aparte, no como olvido.
// ─────────────────────────────────────────────────────────────────────────────
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'",
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
]

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.30'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
