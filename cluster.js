/**
 * Cluster mode para escalar horizontalmente
 * Permite usar múltiples procesos de Node.js para manejar más conexiones
 * 
 * Uso: node cluster.js
 */

import cluster from 'cluster';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`🖥️  Proceso maestro iniciado (PID: ${process.pid})`);
  console.log(`🔧 Iniciando ${numCPUs} workers...`);

  // Crear un worker por cada CPU
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️  Worker ${worker.process.pid} murió. Reiniciando...`);
    cluster.fork();
  });

  // Opcional: Escalar dinámicamente
  // Puedes ajustar el número de workers según la carga
  console.log(`✅ ${numCPUs} workers iniciados`);
} else {
  // Los workers ejecutan el servidor
  import('./server.js');
}


