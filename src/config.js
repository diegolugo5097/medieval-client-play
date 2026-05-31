// URL del backend.
// - En local: "http://localhost:4000"
// - En producción (Vercel): se toma de la variable de entorno VITE_API_URL
//   que configuras en el panel de Vercel.
export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";
