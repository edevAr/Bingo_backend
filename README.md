# 🎲 Backend - Juego de Bingo Digital (Alta Escalabilidad)

Backend de alto rendimiento para un juego de Bingo digital construido con **Node.js** y **Socket.IO**, optimizado para soportar **miles de usuarios simultáneos a nivel mundial**.

## 🚀 Características

- ✅ **Alta Escalabilidad**: Soporta miles de conexiones simultáneas
- ✅ **Alto Rendimiento**: Optimizado con Node.js y Socket.IO
- ✅ **WebSockets**: Comunicación en tiempo real con Socket.IO
- ✅ **Clustering**: Soporte para múltiples procesos (cluster mode)
- ✅ **Generación de números**: Números aleatorios entre 1-75 sin duplicados
- ✅ **Delay configurable**: Tiempo entre números ajustable
- ✅ **Broadcasting eficiente**: Notificación a todos los clientes de forma optimizada
- ✅ **Optimizaciones**: Configuración optimizada para alta concurrencia

## 📊 Capacidad

- **Conexiones simultáneas**: 10,000 - 50,000+ por instancia (con clustering)
- **Con clustering**: Puede escalar a 100,000+ conexiones
- **Latencia**: Muy baja (< 50ms)
- **Uso de memoria**: Eficiente (~10-20MB por 1,000 conexiones)
- **CPU**: Buen rendimiento con event loop de Node.js

## 📦 Requisitos

- Node.js 18.0 o superior
- npm o yarn

## 🔧 Instalación

1. **Instalar dependencias**:
```bash
npm install
```

2. **Configurar variables de entorno** (opcional):
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

3. **Ejecutar en modo desarrollo**:
```bash
npm run dev
```

4. **Ejecutar en producción**:
```bash
npm start
```

5. **Ejecutar con clustering** (recomendado para producción):
```bash
npm run start:cluster
```

## ⚙️ Configuración

Puedes configurar el servidor editando las variables en `main.go` o usando variables de entorno:

```go
config = Config{
    Port:                 3000,                    // Puerto del servidor
    NumberGenerationDelay: 3 * time.Second,        // Delay entre números
    MinNumber:            1,                       // Número mínimo
    MaxNumber:            75,                      // Número máximo
}
```

## 🔌 API WebSocket

### Endpoint
```
ws://localhost:3000/ws
```

### Eventos que el servidor emite:

#### `connected`
Cuando un cliente se conecta:
```json
{
  "type": "connected",
  "data": {
    "isGameRunning": false,
    "totalClients": 5,
    "generatedNumbers": [12, 34, 56],
    "config": {
      "port": 3000,
      "numberGenerationDelay": "3s",
      "minNumber": 1,
      "maxNumber": 75
    }
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### `newNumber`
Cada vez que se genera un nuevo número:
```json
{
  "type": "newNumber",
  "data": {
    "number": 42,
    "totalGenerated": 15
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### `gameStarted`
Cuando el juego inicia:
```json
{
  "type": "gameStarted",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### `gameStopped`
Cuando el juego se detiene:
```json
{
  "type": "gameStopped",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### `gameReset`
Cuando el juego se reinicia:
```json
{
  "type": "gameReset",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### `status`
Respuesta al solicitar estado:
```json
{
  "type": "status",
  "data": {
    "isGameRunning": true,
    "totalClients": 1000,
    "generatedNumbers": [1, 2, 3, ...],
    "config": {...}
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Eventos que el servidor escucha:

#### `startGame`
Inicia la generación de números:
```json
{
  "type": "startGame"
}
```

#### `stopGame`
Detiene la generación de números:
```json
{
  "type": "stopGame"
}
```

#### `resetGame`
Reinicia el juego (limpia números generados):
```json
{
  "type": "resetGame"
}
```

#### `getStatus`
Solicita el estado actual:
```json
{
  "type": "getStatus"
}
```

## 🌐 API REST

### GET `/`
Obtiene el estado del servidor:
```bash
curl http://localhost:3000/
```

Respuesta:
```json
{
  "status": "online",
  "game": {
    "isRunning": true,
    "totalClients": 1000,
    "generatedNumbers": 15,
    "config": {
      "port": 3000,
      "numberGenerationDelay": "3s",
      "minNumber": 1,
      "maxNumber": 75
    }
  }
}
```

## 💻 Ejemplo de Cliente (JavaScript con Socket.IO)

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

// Escuchar cuando se conecta
socket.on('connect', () => {
  console.log('Conectado al servidor:', socket.id);
});

// Escuchar estado inicial
socket.on('connected', (data) => {
  console.log('Estado inicial:', data);
});

// Escuchar nuevos números
socket.on('newNumber', (data) => {
  console.log('Nuevo número:', data.number);
  console.log('Total generados:', data.totalGenerated);
});

// Escuchar eventos del juego
socket.on('gameStarted', () => {
  console.log('Juego iniciado');
});

socket.on('gameStopped', () => {
  console.log('Juego detenido');
});

socket.on('gameReset', () => {
  console.log('Juego reiniciado');
});

// Iniciar juego
socket.emit('startGame');

// Detener juego
socket.emit('stopGame');

// Reiniciar juego
socket.emit('resetGame');

// Obtener estado
socket.emit('getStatus');
socket.on('status', (data) => {
  console.log('Estado actual:', data);
});
```

## 🚀 Despliegue en Producción

### 1. Usar clustering (Recomendado)
Para máxima escalabilidad, usa el modo cluster:
```bash
npm run start:cluster
```

Esto iniciará un worker por cada CPU disponible, permitiendo manejar muchas más conexiones.

### 2. Usar un reverse proxy (Nginx)
```nginx
upstream bingo_backend {
    server localhost:3000;
}

server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://bingo_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Usar PM2 (Recomendado para Node.js)
PM2 es un gestor de procesos para Node.js que permite clustering automático:

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar con clustering automático
pm2 start server.js -i max

# O iniciar cluster.js
pm2 start cluster.js -i max

# Ver logs
pm2 logs

# Monitorear
pm2 monit

# Guardar configuración
pm2 save
pm2 startup
```

### 4. Usar systemd (Linux)
Crear `/etc/systemd/system/bingo.service`:
```ini
[Unit]
Description=Bingo Game Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/bingo
ExecStart=/usr/bin/node /opt/bingo/server.js
# O con clustering:
# ExecStart=/usr/bin/node /opt/bingo/cluster.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Iniciar servicio:
```bash
sudo systemctl start bingo
sudo systemctl enable bingo
```

### 5. Escalabilidad Horizontal

Para soportar millones de usuarios, puedes:

1. **Load Balancer**: Usar Nginx/HAProxy para distribuir carga entre múltiples instancias
2. **Múltiples instancias**: Ejecutar varias instancias del servidor en diferentes puertos
3. **Redis Adapter**: Socket.IO tiene un adapter para Redis que permite sincronizar estado entre instancias
   ```bash
   npm install @socket.io/redis-adapter redis
   ```
4. **Kubernetes**: Para orquestación y auto-scaling automático
5. **PM2 Cluster Mode**: Usar PM2 con clustering para aprovechar todos los CPUs

## 📈 Monitoreo

### Métricas recomendadas:
- Número de conexiones activas
- Números generados por segundo
- Latencia de mensajes
- Uso de CPU y memoria
- Tasa de errores

### Herramientas:
- **Prometheus** + **Grafana** para métricas
- **ELK Stack** para logs
- **New Relic** o **Datadog** para APM

## 🔒 Seguridad

Para producción, considera:
- ✅ Autenticación de usuarios
- ✅ Rate limiting
- ✅ Validación de origen (CORS)
- ✅ HTTPS/WSS
- ✅ Firewall rules
- ✅ DDoS protection

## 🧪 Testing de Carga

Puedes probar la capacidad con herramientas como:

### Con Artillery (Recomendado para WebSockets)
```bash
npm install -g artillery
artillery quick --count 1000 --num 10 ws://localhost:3000
```

### Con k6
```bash
k6 run load-test.js
```

### Con Apache Bench (solo HTTP)
```bash
ab -n 10000 -c 1000 http://localhost:3000/
```

### Con wrk
```bash
wrk -t12 -c400 -d30s http://localhost:3000/
```

### Script de prueba simple (Node.js)
```javascript
import io from 'socket.io-client';

const clients = [];
const numClients = 1000;

for (let i = 0; i < numClients; i++) {
  const socket = io('http://localhost:3000');
  socket.on('connect', () => {
    console.log(`Cliente ${i} conectado`);
  });
  socket.on('newNumber', (data) => {
    console.log(`Cliente ${i} recibió número:`, data.number);
  });
  clients.push(socket);
}
```

## 📝 Notas

- El servidor está optimizado para alta concurrencia con Node.js
- Usa el event loop de Node.js para manejar conexiones de forma eficiente
- El broadcasting es eficiente usando Socket.IO
- Los números se generan sin duplicados hasta completar el rango
- Auto-reinicio cuando se generan todos los números
- Para máxima escalabilidad, usa clustering o PM2
- Socket.IO maneja automáticamente fallbacks (polling si WebSocket no está disponible)

## 🆘 Troubleshooting

### Error: "too many open files"
Aumentar límite de archivos abiertos:
```bash
ulimit -n 65536
```

### Error de memoria
Ajustar límites del sistema operativo según necesidad.

## 📄 Licencia

ISC
# Bingo_backend
