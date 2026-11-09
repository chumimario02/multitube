# 🎬 MULTITUBE

Mira YouTube **sincronizado** con tus amigos. Crea una sala, comparte el link y el host elige los videos: play, pausa y salto se replican para todos en tiempo real.

## ✨ Qué incluye

- **Salas con código** de 5 caracteres y link de invitación.
- **Host único**: solo el host controla la reproducción (play/pausa/seek/siguiente).
- **Cola de videos** con búsqueda en YouTube y soporte para pegar links.
- **Buscador inmersivo** estilo YouTube (pantalla completa, chips, vistas, duración, scroll infinito).
- **API key compartida**: el host la guarda una vez y los invitados buscan con ella (toggle).
- **Sugerencias**: los invitados proponen videos y el host los acepta o rechaza.
- **Sincronización real** con heartbeat y corrección automática de desfase.
- **Chat en vivo** y lista de miembros.
- **Cambio de host automático** si el host se sale.
- **Diseño responsive** con animaciones, gradientes y glassmorphism.

## 🚀 Uso local

```bash
npm install
npm start
```

Abre http://localhost:3000

Para probar con otra persona en tu misma red Wi-Fi, comparte `http://TU-IP-LOCAL:3000`
(la IP la ves con `ipconfig` en Windows).

## 🔑 API key de YouTube (opcional)

Solo hace falta para el **buscador** del host. Para probar puedes pegar links directamente.

1. Entra a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto.
3. **APIs y servicios → Biblioteca** → habilita **YouTube Data API v3**.
4. **Credenciales → Crear credenciales → Clave de API**.
5. Pégala en MULTITUBE y pulsa **Guardar**.

La clave se guarda **solo en el navegador del host** (`localStorage`) y las búsquedas van directo a Google; nunca pasa por el servidor.

> Cuota gratuita: 10.000 unidades/día. Cada búsqueda cuesta 100 → ~100 búsquedas diarias.
> Recomendado restringir la clave a **YouTube Data API v3** y a los referrers de tu dominio.

## 🌐 Despliegue

### Render (recomendado)

Este proyecto necesita un servidor Node persistente por los WebSockets.

1. Sube el repo a GitHub.
2. En [Render](https://dashboard.render.com/) → **New → Web Service**.
3. Conecta el repo y usa:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Listo. Render inyecta `PORT` automáticamente.

> El plan free se duerme tras ~15 min sin tráfico; la primera visita puede tardar ~30-60 s en despertar.

### Vercel

Vercel soporta WebSockets en beta desde junio de 2026, pero con límite de ~5 minutos por conexión y sin memoria compartida entre instancias. Para una watch party larga no es una buena opción: usa Render o cualquier host con Node persistente (Railway, Fly.io, Koyeb).

## 🧱 Estructura

```
multitube/
├── server.js          # Express + Socket.IO (salas, sincronización, chat)
├── package.json
└── public/
    ├── index.html
    ├── styles.css
    ├── app.js
    └── favicon.svg
```

## 🔒 Notas

- No hay cuentas ni base de datos: las salas viven en memoria y expiran a las 12 h.
- Máximo 30 personas y 100 videos por sala.
- Los videos con reproducción incrustada desactivada se saltan automáticamente.
