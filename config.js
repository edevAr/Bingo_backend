/**
 * Configuración del juego de Bingo
 */
export const config = {
  // Delay en milisegundos entre cada número generado
  // Por defecto: 3 segundos (3000ms)
  // Puedes ajustar este valor según tus necesidades
  numberGenerationDelay: 3000,
  
  // Rango de números del bingo (1-75 es estándar)
  minNumber: 1,
  maxNumber: 75,
  
  // Puerto del servidor (usa variable de entorno en producción)
  port: process.env.PORT || 3000
};



