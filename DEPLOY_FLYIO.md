# 🚀 Guía de Deployment a Fly.io

Esta guía te llevará paso a paso para deployar tu backend de Bingo a Fly.io.

## 📋 Prerrequisitos

1. **Cuenta en Fly.io**: Si no tienes una, créala en [fly.io](https://fly.io)
2. **Fly CLI instalado**: Necesitas instalar la herramienta de línea de comandos de Fly.io

## 🔧 Paso 1: Instalar Fly CLI

### macOS (usando Homebrew):
```bash
brew install flyctl
```

### O usando el script de instalación:
```bash
curl -L https://fly.io/install.sh | sh
```

### Verificar instalación:
```bash
flyctl version
```

## 🔐 Paso 2: Iniciar sesión en Fly.io

```bash
flyctl auth login
```

Esto abrirá tu navegador para autenticarte. Si no se abre automáticamente, sigue el enlace que aparece en la terminal.

## 📦 Paso 3: Preparar tu proyecto

Los archivos necesarios ya están creados:
- ✅ `fly.toml` - Configuración de Fly.io
- ✅ `config.js` - Actualizado para usar variables de entorno
- ✅ `.dockerignore` - Para optimizar el build

## 🚀 Paso 4: Crear la aplicación en Fly.io

Desde el directorio de tu proyecto (`/Users/edenarielguzmanandia/Projects/Juego/Backend`), ejecuta:

```bash
flyctl launch
```

Este comando:
- Te pedirá un nombre para tu app (o usa el que está en `fly.toml`: `bingo-backend`)
- Te preguntará si quieres configurar una base de datos (puedes decir "no" por ahora)
- Te preguntará si quieres desplegar ahora (puedes decir "no" primero para revisar)

**Nota**: Si ya existe una app con ese nombre, Fly.io te sugerirá otro o puedes especificar uno diferente.

## ⚙️ Paso 5: Configurar variables de entorno (opcional)

Si necesitas configurar variables de entorno específicas:

```bash
flyctl secrets set NODE_ENV=production
```

## 🚢 Paso 6: Desplegar tu aplicación

```bash
flyctl deploy
```

Este comando:
1. Construirá tu aplicación
2. Creará una imagen Docker
3. La desplegará en Fly.io
4. Te dará la URL de tu aplicación

## 🌐 Paso 7: Verificar el despliegue

Una vez completado el deploy, verás algo como:
```
Deployed as bingo-backend.fly.dev
```

Puedes verificar que funciona visitando:
```
https://bingo-backend.fly.dev
```

Deberías ver un JSON con el estado del servidor.

## 📊 Paso 8: Ver logs y monitorear

### Ver logs en tiempo real:
```bash
flyctl logs
```

### Ver el estado de tu app:
```bash
flyctl status
```

### Ver información detallada:
```bash
flyctl info
```

## 🔄 Comandos útiles para el futuro

### Actualizar tu aplicación:
```bash
flyctl deploy
```

### Abrir tu app en el navegador:
```bash
flyctl open
```

### Ver métricas:
```bash
flyctl metrics
```

### Escalar tu aplicación:
```bash
# Ver opciones de escalado
flyctl scale show

# Escalar a 2 instancias
flyctl scale count 2

# Cambiar recursos (CPU/Memoria)
flyctl scale vm shared-cpu-2x --memory 1024
```

### Reiniciar tu aplicación:
```bash
flyctl apps restart bingo-backend
```

## 🔧 Configuración de Socket.IO para producción

Para que Socket.IO funcione correctamente en Fly.io, asegúrate de que:

1. **CORS esté configurado correctamente**: Ya está configurado en tu `server.js`
2. **El frontend apunte a la URL correcta**: Actualiza la URL del backend en tu frontend a `https://bingo-backend.fly.dev`

## 🐛 Solución de problemas

### Si el deploy falla:
```bash
# Ver logs detallados
flyctl logs --app bingo-backend

# Verificar el estado
flyctl status
```

### Si necesitas acceder a la consola:
```bash
flyctl ssh console
```

### Si quieres cambiar la región:
Edita `fly.toml` y cambia `primary_region` a una región más cercana:
- `iad` - Washington D.C., USA
- `sjc` - San Jose, USA
- `gru` - São Paulo, Brasil
- `lhr` - London, UK
- `cdg` - Paris, France
- `nrt` - Tokyo, Japan

Luego ejecuta:
```bash
flyctl deploy
```

## 💰 Planes y costos

Fly.io tiene un plan gratuito generoso:
- **Free tier**: 3 VMs compartidas con 256MB RAM cada una
- Tu configuración actual usa 1 VM con 512MB RAM

Para más información sobre planes: https://fly.io/docs/about/pricing/

## ✅ Checklist final

- [ ] Fly CLI instalado
- [ ] Autenticado en Fly.io
- [ ] Aplicación creada con `flyctl launch`
- [ ] Desplegado con `flyctl deploy`
- [ ] Verificado que funciona en la URL proporcionada
- [ ] Frontend actualizado con la nueva URL del backend

## 🎉 ¡Listo!

Tu backend de Bingo ahora está desplegado en Fly.io y accesible desde cualquier parte del mundo.

