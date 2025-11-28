import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Configuración optimizada de Socket.IO para alta concurrencia
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Optimizaciones para alta escalabilidad
  transports: ['websocket', 'polling'], // Permitir ambos transportes
  pingTimeout: 60000, // 60 segundos
  pingInterval: 25000, // 25 segundos
  maxHttpBufferSize: 1e6, // 1MB
  allowEIO3: true, // Compatibilidad con versiones anteriores
  // Configuración de conexiones
  connectTimeout: 45000,
  // Optimización de polling
  httpCompression: true,
  // Límites
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    threshold: 1024
  }
});

// Estados de juego por sala
const roomGameStates = {}; // { roomId: { generatedNumbers: Set, generatedNumbersList: [], gameInterval: null, isGameRunning: false, gameEnded: false, winners: [] } }
let roomPools = {}; // Pozo acumulado por sala: { roomId: { total: number, purchases: [] } }
let playerNames = {}; // Mapeo de clientId a playerName

// Configuración del porcentaje de la casa (configurable)
const HOUSE_PERCENTAGE = 0.10; // 10% por defecto

// Función para obtener o crear el estado de juego de una sala
function getRoomGameState(roomId) {
  if (!roomId) return null;
  
  if (!roomGameStates[roomId]) {
    roomGameStates[roomId] = {
      generatedNumbers: new Set(),
      generatedNumbersList: [],
      gameInterval: null,
      isGameRunning: false,
      gameEnded: false,
      winners: []
    };
  }
  
  return roomGameStates[roomId];
}

/**
 * Genera un número aleatorio entre min y max (inclusive)
 * que no haya sido generado antes para una sala específica
 * Optimizado para mejor rendimiento
 */
function generateRandomNumber(roomId, min, max) {
  const gameState = getRoomGameState(roomId);
  if (!gameState) return null;
  
  const { generatedNumbers, generatedNumbersList } = gameState;
  const totalNumbers = max - min + 1;
  
  // Si ya se generaron todos los números, reiniciar
  if (generatedNumbers.size >= totalNumbers) {
    generatedNumbers.clear();
    generatedNumbersList.length = 0;
    console.log(`🔄 Todos los números han sido generados en sala ${roomId}. Reiniciando...`);
  }

  // Optimización: si quedan pocos números, usar array shuffle
  const remaining = totalNumbers - generatedNumbers.size;
  if (remaining <= 10) {
    // Para los últimos números, generar lista y elegir aleatoriamente
    const available = [];
    for (let i = min; i <= max; i++) {
      if (!generatedNumbers.has(i)) {
        available.push(i);
      }
    }
    const number = available[Math.floor(Math.random() * available.length)];
    generatedNumbers.add(number);
    generatedNumbersList.push(number);
    return number;
  }

  // Para la mayoría de números, usar método aleatorio
  let number;
  let attempts = 0;
  const maxAttempts = 100; // Prevenir loops infinitos
  
  do {
    number = Math.floor(Math.random() * totalNumbers) + min;
    attempts++;
    if (attempts > maxAttempts) {
      // Fallback: buscar el primer número disponible
      for (let i = min; i <= max; i++) {
        if (!generatedNumbers.has(i)) {
          number = i;
          break;
        }
      }
      break;
    }
  } while (generatedNumbers.has(number));

  generatedNumbers.add(number);
  generatedNumbersList.push(number);
  return number;
}

/**
 * Inicia la generación automática de números para una sala específica
 */
function startNumberGeneration(roomId) {
  if (!roomId) {
    console.log('⚠️ No se puede iniciar el juego sin roomId');
    return;
  }

  const gameState = getRoomGameState(roomId);
  if (!gameState) {
    console.log(`⚠️ No se pudo obtener el estado de juego para sala ${roomId}`);
    return;
  }

  if (gameState.isGameRunning) {
    console.log(`⚠️ El juego ya está en ejecución en la sala ${roomId}`);
    return;
  }

  // Resetear estado del juego de la sala
  gameState.gameEnded = false;
  gameState.winners = [];
  gameState.isGameRunning = true;
  
  console.log(`🎮 Iniciando juego de Bingo en sala ${roomId} con delay de ${config.numberGenerationDelay}ms`);
  
  // Notificar a TODOS los clientes sobre el cambio de estado de la sala
  const roomsStatus = getAllRoomsStatus();
  io.emit('roomStatusChanged', {
    roomId: parseInt(roomId),
    status: roomsStatus[parseInt(roomId)],
    allRoomsStatus: roomsStatus
  });

  gameState.gameInterval = setInterval(() => {
    // No generar números si el juego terminó o no está corriendo
    if (gameState.gameEnded || !gameState.isGameRunning) {
      if (gameState.gameInterval) {
        clearInterval(gameState.gameInterval);
        gameState.gameInterval = null;
        console.log(`🛑 Deteniendo generación de números en sala ${roomId} (juego terminado o detenido)`);
      }
      return;
    }

    const number = generateRandomNumber(roomId, config.minNumber, config.maxNumber);
    
    if (number === null) {
      console.log(`⚠️ No se pudo generar número para sala ${roomId}`);
      return;
    }
    
    console.log(`🎲 Número generado en sala ${roomId}: ${number}`);
    
    // Notificar solo a los clientes en esta sala
    const socketRoomId = `room_${roomId}`;
    io.to(socketRoomId).emit('newNumber', {
      number: number,
      timestamp: new Date().toISOString(),
      totalGenerated: gameState.generatedNumbers.size,
      roomId: roomId
    });
  }, config.numberGenerationDelay);
}

/**
 * Detiene la generación de números para una sala específica
 */
function stopNumberGeneration(roomId) {
  if (!roomId) {
    console.log('⚠️ No se puede detener el juego sin roomId');
    return;
  }

  const gameState = getRoomGameState(roomId);
  if (!gameState || !gameState.isGameRunning) {
    return;
  }

  if (gameState.gameInterval) {
    clearInterval(gameState.gameInterval);
    gameState.gameInterval = null;
  }
  
  gameState.isGameRunning = false;
  console.log(`⏸️ Juego detenido en sala ${roomId}`);
  
  // Notificar solo a los clientes en esta sala
  const socketRoomId = `room_${roomId}`;
  io.to(socketRoomId).emit('gameStopped');
  
  // Notificar a TODOS los clientes sobre el cambio de estado de la sala
  const roomsStatus = getAllRoomsStatus();
  io.emit('roomStatusChanged', {
    roomId: parseInt(roomId),
    status: roomsStatus[parseInt(roomId)],
    allRoomsStatus: roomsStatus
  });
}

/**
 * Reinicia el juego para una sala específica (limpia números generados y detiene)
 */
function resetGame(roomId) {
  if (!roomId) {
    console.log('⚠️ No se puede reiniciar el juego sin roomId');
    return;
  }

  stopNumberGeneration(roomId);
  
  const gameState = getRoomGameState(roomId);
  if (gameState) {
    gameState.generatedNumbers.clear();
    gameState.generatedNumbersList.length = 0;
    gameState.gameEnded = false;
    gameState.winners = [];
  }
  
  // No limpiar roomPools para mantener el historial
  console.log(`🔄 Juego reiniciado en sala ${roomId} - Todos los números han sido limpiados`);
  
  // Notificar solo a los clientes en esta sala
  const socketRoomId = `room_${roomId}`;
  io.to(socketRoomId).emit('gameReset');
  
  // Notificar a TODOS los clientes sobre el cambio de estado de la sala
  const roomsStatus = getAllRoomsStatus();
  io.emit('roomStatusChanged', {
    roomId: parseInt(roomId),
    status: roomsStatus[parseInt(roomId)],
    allRoomsStatus: roomsStatus
  });
}

/**
 * Calcula el premio para los ganadores
 */
function calculatePrizes(roomId, winnerCount) {
  if (!roomPools[roomId] || roomPools[roomId].total === 0) {
    return { totalPrize: 0, prizePerWinner: 0, houseCut: 0 };
  }

  const totalPool = roomPools[roomId].total;
  const houseCut = totalPool * HOUSE_PERCENTAGE;
  const prizePool = totalPool - houseCut;
  const prizePerWinner = winnerCount > 0 ? prizePool / winnerCount : 0;

  return {
    totalPrize: prizePool,
    prizePerWinner: prizePerWinner,
    houseCut: houseCut,
    totalPool: totalPool
  };
}

/**
 * Maneja cuando un jugador gana (Bingo)
 * Soporta múltiples ganadores simultáneos por sala
 */
function handleBingo(socket, winnerData) {
  const clientId = socket.id;
  const playerName = winnerData.playerName || playerNames[clientId] || `Jugador ${clientId.substring(0, 8)}`;
  const roomId = winnerData.roomId || null;
  
  if (!roomId) {
    console.log(`⚠️ No se puede procesar victoria sin roomId para ${playerName}`);
    return;
  }

  const gameState = getRoomGameState(roomId);
  if (!gameState) {
    console.log(`⚠️ No se pudo obtener el estado de juego para sala ${roomId}`);
    return;
  }
  
  // Verificar si este jugador ya ganó en esta sala
  const alreadyWon = gameState.winners.some(w => w.clientId === clientId);
  if (alreadyWon) {
    console.log(`⚠️ El jugador ${playerName} ya está en la lista de ganadores de la sala ${roomId}`);
    return;
  }

  console.log(`🎉 ¡BINGO! Cliente ${clientId} (${playerName}) ganó el juego en sala ${roomId}`);
  console.log(`📋 Datos del ganador:`, winnerData);

  // Agregar a la lista de ganadores de la sala
  const winnerInfo = {
    clientId: clientId,
    playerName: playerName,
    card: winnerData.card || winnerData.cardMatrix || [],
    cardMatrix: winnerData.cardMatrix || winnerData.card || [],
    victoryType: winnerData.victoryType || null,
    timestamp: new Date().toISOString(),
    roomId: roomId,
  };

  gameState.winners.push(winnerInfo);

  // Si es el primer ganador de la sala, detener el juego de esa sala
  if (gameState.winners.length === 1) {
    // Detener la generación de números INMEDIATAMENTE para esta sala
    if (gameState.gameInterval) {
      clearInterval(gameState.gameInterval);
      gameState.gameInterval = null;
      console.log(`🛑 Intervalo de generación de números detenido en sala ${roomId}`);
    }
    
    gameState.isGameRunning = false;
    gameState.gameEnded = true;
    console.log(`🛑 Juego detenido en sala ${roomId} - Primer ganador detectado`);
  }

  // Esperar un breve momento para detectar ganadores simultáneos
  // (otros jugadores que ganaron en el mismo momento en la misma sala)
  setTimeout(() => {
    processWinners(roomId);
  }, 500); // Esperar 500ms para detectar ganadores simultáneos
}

/**
 * Procesa todos los ganadores y calcula premios para una sala específica
 */
function processWinners(roomId) {
  if (!roomId) {
    console.log('⚠️ No se puede procesar ganadores sin roomId');
    return;
  }

  const gameState = getRoomGameState(roomId);
  if (!gameState || gameState.winners.length === 0) {
    return;
  }

  console.log(`🏆 Procesando ${gameState.winners.length} ganador(es) en sala ${roomId}`);

  // Calcular premios
  const prizeInfo = calculatePrizes(roomId, gameState.winners.length);

  // Agregar información de premio a cada ganador
  const winnersWithPrizes = gameState.winners.map(winner => ({
    ...winner,
    prize: prizeInfo.prizePerWinner,
    totalPrize: prizeInfo.totalPrize,
    houseCut: prizeInfo.houseCut,
    totalPool: prizeInfo.totalPool,
  }));

  // Determinar la sala de Socket.IO
  const socketRoomId = `room_${roomId}`;

  // Notificar solo a la sala que el juego terminó
  io.to(socketRoomId).emit('gameEnded', {
    winners: winnersWithPrizes,
    winner: winnersWithPrizes[0], // Compatibilidad con código anterior
    message: gameState.winners.length === 1 
      ? `¡${gameState.winners[0].playerName} ganó el juego!`
      : `¡${gameState.winners.length} jugadores ganaron simultáneamente!`,
    prizeInfo: prizeInfo,
  });

  // También enviar playerWon como broadcast solo a la sala
  io.to(socketRoomId).emit('playerWon', {
    winners: winnersWithPrizes,
    winner: winnersWithPrizes[0], // Compatibilidad
    clientId: gameState.winners[0].clientId,
    playerName: gameState.winners[0].playerName,
    victoryType: gameState.winners[0].victoryType,
    card: gameState.winners[0].card,
    cardMatrix: gameState.winners[0].cardMatrix,
    timestamp: gameState.winners[0].timestamp,
    prizeInfo: prizeInfo,
  });

  // Confirmar victoria a cada ganador
  winnersWithPrizes.forEach((winner) => {
    const winnerSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.id === winner.clientId);
    
    if (winnerSocket) {
      winnerSocket.emit('victoryConfirmed', {
        ...winner,
        prize: prizeInfo.prizePerWinner,
        totalPrize: prizeInfo.totalPrize,
        houseCut: prizeInfo.houseCut,
        totalPool: prizeInfo.totalPool,
      });
    }
  });

  console.log(`✅ Todos los clientes de la sala ${roomId} fueron notificados de los ganadores`);
  console.log(`💰 Pozo total: ${prizeInfo.totalPool.toFixed(2)} Bs`);
  console.log(`🏦 Corte de la casa (${(HOUSE_PERCENTAGE * 100).toFixed(0)}%): ${prizeInfo.houseCut.toFixed(2)} Bs`);
  console.log(`🎁 Premio total: ${prizeInfo.totalPrize.toFixed(2)} Bs`);
  // Confirmar victoria a cada ganador
  winnersWithPrizes.forEach((winner) => {
    const winnerSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.id === winner.clientId);
    
    if (winnerSocket) {
      winnerSocket.emit('victoryConfirmed', {
        ...winner,
        prize: prizeInfo.prizePerWinner,
        totalPrize: prizeInfo.totalPrize,
        houseCut: prizeInfo.houseCut,
        totalPool: prizeInfo.totalPool,
      });
    }
  });

  console.log(`✅ Todos los clientes de la sala ${roomId} fueron notificados de los ganadores`);
  console.log(`💰 Pozo total: ${prizeInfo.totalPool.toFixed(2)} Bs`);
  console.log(`🏦 Corte de la casa (${(HOUSE_PERCENTAGE * 100).toFixed(0)}%): ${prizeInfo.houseCut.toFixed(2)} Bs`);
  console.log(`🎁 Premio total: ${prizeInfo.totalPrize.toFixed(2)} Bs`);
  console.log(`💵 Premio por ganador: ${prizeInfo.prizePerWinner.toFixed(2)} Bs`);
  gameState.winners.forEach((w, i) => {
    console.log(`   ${i + 1}. ${w.playerName} (${w.victoryType || 'BINGO'})`);
  });
  
  // NO notificar cambio de estado aquí porque aún hay jugadores en la sala
  // La sala se habilitará solo cuando todos los jugadores salgan
  // Esto se manejará en los eventos leaveRoom y disconnect
  
  // Iniciar timer de 20 segundos para mostrar modal de cierre de sala a todos los clientes
  // Después de 20 segundos, todos los clientes de la sala verán el modal de cierre
  setTimeout(() => {
    console.log(`⏰ Enviando notificación de cierre de sala a todos los clientes de sala ${roomId} (20 segundos después de que terminó el juego)`);
    io.to(socketRoomId).emit('showRoomClosingModal', {
      roomId: parseInt(roomId),
      countdown: 5
    });
  }, 20000); // 20 segundos
}

// Almacenar información de salas y jugadores
const roomPlayers = {}; // { roomId: Set<clientId> }
const playerRooms = {}; // { clientId: roomId }

// Función para obtener jugadores en una sala
function getPlayersInRoom(roomId) {
  if (!roomId || !roomPlayers[roomId]) return [];
  return Array.from(roomPlayers[roomId]);
}

// Función para obtener el número de jugadores en una sala
function getRoomPlayerCount(roomId) {
  if (!roomId || !roomPlayers[roomId]) return 0;
  return roomPlayers[roomId].size;
}

// Función para obtener el estado de todas las salas
function getAllRoomsStatus() {
  const roomsStatus = {};
  
  // Las salas son del 1 al 6 según el frontend
  for (let roomId = 1; roomId <= 6; roomId++) {
    const socketRoomId = `room_${roomId}`;
    const gameState = getRoomGameState(roomId);
    const playerCount = getRoomPlayerCount(socketRoomId);
    
    // Si la sala está vacía y el juego terminó, limpiar el estado automáticamente
    if (playerCount === 0 && gameState && gameState.gameEnded) {
      console.log(`🧹 Limpiando estado de sala ${roomId} vacía con juego terminado`);
      gameState.generatedNumbers.clear();
      gameState.generatedNumbersList.length = 0;
      gameState.gameEnded = false;
      gameState.isGameRunning = false;
      gameState.winners = [];
      if (gameState.gameInterval) {
        clearInterval(gameState.gameInterval);
        gameState.gameInterval = null;
      }
      // Limpiar el pozo de la sala también
      if (roomPools[roomId]) {
        roomPools[roomId] = {
          total: 0,
          purchases: []
        };
      }
    }
    
    // Una sala tiene un juego activo si:
    // - El juego está corriendo, O
    // - El juego terminó PERO aún hay jugadores en la sala
    const hasActiveGame = gameState ? (
      gameState.isGameRunning || 
      (gameState.gameEnded && playerCount > 0)
    ) : false;
    
    roomsStatus[roomId] = {
      roomId: roomId,
      isGameRunning: gameState ? gameState.isGameRunning : false,
      gameEnded: gameState ? gameState.gameEnded : false,
      playerCount: playerCount,
      hasActiveGame: hasActiveGame
    };
  }
  
  return roomsStatus;
}

// Manejo de conexiones Socket.IO
io.on('connection', (socket) => {
  const clientId = socket.id;
  
  console.log(`✅ Cliente conectado: ${clientId}`);

  // Enviar estado inicial al cliente (sin sala aún)
  socket.emit('connected', {
    clientId: clientId,
    isGameRunning: false,
    totalClients: io.sockets.sockets.size,
    roomClients: 0,
    generatedNumbers: [],
    gameEnded: false,
    winner: null,
    winners: [],
    config: {
      delay: config.numberGenerationDelay,
      minNumber: config.minNumber,
      maxNumber: config.maxNumber
    }
  });

  // Manejar comandos del cliente (solo afectan a la sala del jugador)
  socket.on('startGame', () => {
    const socketRoomId = playerRooms[clientId];
    if (!socketRoomId) {
      console.log(`⚠️ Cliente ${clientId} intentó iniciar juego sin estar en una sala`);
      socket.emit('error', { message: 'Debes estar en una sala para iniciar el juego' });
      return;
    }
    
    // Extraer el ID numérico de la sala (room_1 -> 1)
    const roomId = socketRoomId.replace('room_', '');
    console.log(`🎮 Cliente ${clientId} solicitó iniciar el juego en sala ${roomId}`);
    startNumberGeneration(roomId);
    
    // Notificar solo a la sala del jugador
    io.to(socketRoomId).emit('gameStarted');
  });

  socket.on('stopGame', () => {
    const socketRoomId = playerRooms[clientId];
    if (!socketRoomId) {
      console.log(`⚠️ Cliente ${clientId} intentó detener juego sin estar en una sala`);
      return;
    }
    
    const roomId = socketRoomId.replace('room_', '');
    console.log(`⏸️ Cliente ${clientId} solicitó detener el juego en sala ${roomId}`);
    stopNumberGeneration(roomId);
    
    io.to(socketRoomId).emit('gameStopped');
  });

  socket.on('resetGame', () => {
    const socketRoomId = playerRooms[clientId];
    if (!socketRoomId) {
      console.log(`⚠️ Cliente ${clientId} intentó reiniciar juego sin estar en una sala`);
      return;
    }
    
    const roomId = socketRoomId.replace('room_', '');
    console.log(`🔄 Cliente ${clientId} solicitó reiniciar el juego en sala ${roomId}`);
    resetGame(roomId);
  });

  socket.on('getStatus', () => {
    const socketRoomId = playerRooms[clientId];
    const roomClients = socketRoomId ? getRoomPlayerCount(socketRoomId) : 0;
    
    // Obtener estado del juego de la sala
    let gameState = null;
    if (socketRoomId) {
      const roomId = socketRoomId.replace('room_', '');
      gameState = getRoomGameState(roomId);
    }
    
    socket.emit('status', {
      isGameRunning: gameState ? gameState.isGameRunning : false,
      totalClients: io.sockets.sockets.size,
      roomClients: roomClients,
      generatedNumbers: gameState ? [...gameState.generatedNumbersList] : [],
      gameEnded: gameState ? gameState.gameEnded : false,
      winner: gameState && gameState.winners.length > 0 ? gameState.winners[0] : null,
      winners: gameState ? gameState.winners : [],
      config: {
        delay: config.numberGenerationDelay,
        minNumber: config.minNumber,
        maxNumber: config.maxNumber
      }
    });
  });

  // Manejar cuando un cliente gana (Bingo) - evento legacy
  socket.on('bingo', (winnerData) => {
    handleBingo(socket, winnerData);
  });

  // Manejar cuando un cliente gana (playerWon) - nuevo evento
  socket.on('playerWon', (winnerData) => {
    console.log(`🎉 Evento playerWon recibido de ${clientId}`);
    // Agregar roomId si está disponible
    const roomId = playerRooms[clientId];
    if (!winnerData.roomId && roomId) {
      // Extraer el ID numérico de la sala (room_1 -> 1)
      const roomIdNum = roomId.replace('room_', '');
      winnerData.roomId = parseInt(roomIdNum) || null;
    }
    handleBingo(socket, winnerData);
  });

  // Manejar mensajes del chat (solo a la sala)
  socket.on('chatMessage', (data) => {
    const roomId = playerRooms[clientId];
    
    if (!roomId) {
      console.log(`⚠️ Cliente ${clientId} intentó enviar mensaje sin estar en una sala`);
      return;
    }

    const messageData = {
      id: `${clientId}-${Date.now()}`,
      playerName: data.playerName || playerNames[clientId] || `Jugador ${clientId.substring(0, 8)}`,
      message: data.message,
      timestamp: new Date().toISOString(),
      roomId: roomId,
    };

    console.log(`💬 Mensaje de chat de ${messageData.playerName} en sala ${roomId}: ${data.message}`);

    // Enviar mensaje solo a los clientes en la misma sala
    io.to(roomId).emit('chatMessage', messageData);
  });

  // Manejar compra de cartones
  // Evento para obtener el estado de todas las salas
  socket.on('getRoomsStatus', () => {
    const roomsStatus = getAllRoomsStatus();
    socket.emit('roomsStatus', roomsStatus);
  });

  socket.on('purchaseCards', (data) => {
    console.log(`💰 Compra realizada por ${data.playerName}:`);
    console.log(`   - Sala: ${data.roomName} (ID: ${data.roomId})`);
    console.log(`   - Cantidad de cartones: ${data.cardQuantity}`);
    console.log(`   - Precio total: ${data.totalPrice} Bs`);
    
    // Verificar si hay un juego en curso o si el juego terminó pero aún hay jugadores
    const roomId = `room_${data.roomId}`; // Prefijo para evitar conflictos
    let gameState = getRoomGameState(data.roomId);
    const playerCount = getRoomPlayerCount(roomId);
    
    // No permitir unirse si:
    // 1. El juego está corriendo, O
    // 2. El juego terminó pero aún hay jugadores en la sala
    if (gameState && (gameState.isGameRunning || (gameState.gameEnded && playerCount > 0))) {
      const reason = gameState.isGameRunning ? 'gameInProgress' : 'gameEndedWithPlayers';
      const message = gameState.isGameRunning 
        ? 'No puedes unirte a esta sala porque hay un juego en curso'
        : 'No puedes unirte a esta sala porque el juego terminó pero aún hay jugadores';
      
      console.log(`⚠️ Intento de unirse a sala ${data.roomId} - RECHAZADO: ${reason}`);
      socket.emit('roomJoinRejected', {
        roomId: data.roomId,
        reason: reason,
        message: message
      });
      return;
    }
    
    // Si el jugador ya estaba en otra sala, salir de ella
    const previousRoomId = playerRooms[clientId];
    if (previousRoomId && previousRoomId !== roomId) {
      socket.leave(previousRoomId);
      if (roomPlayers[previousRoomId]) {
        roomPlayers[previousRoomId].delete(clientId);
        if (roomPlayers[previousRoomId].size === 0) {
          delete roomPlayers[previousRoomId];
        }
      }
      // Notificar a la sala anterior con lista actualizada
      const previousRoomPlayers = getPlayersInRoom(previousRoomId).map(id => ({
        clientId: id,
        playerName: playerNames[id] || `Jugador ${id.substring(0, 8)}`
      }));
      io.to(previousRoomId).emit('clientDisconnected', {
        clientId: clientId,
        roomClients: getRoomPlayerCount(previousRoomId),
        players: previousRoomPlayers
      });
      io.to(previousRoomId).emit('playerLeftRoom', {
        clientId: clientId,
        roomClients: getRoomPlayerCount(previousRoomId),
        players: previousRoomPlayers
      });
    }
    
    // Unirse a la nueva sala
    socket.join(roomId);
    playerRooms[clientId] = roomId;
    socket.roomId = roomId;
    
    // Agregar jugador a la lista de la sala
    if (!roomPlayers[roomId]) {
      roomPlayers[roomId] = new Set();
    }
    roomPlayers[roomId].add(clientId);
    
    // Acumular en el pozo de la sala
    if (!roomPools[data.roomId]) {
      roomPools[data.roomId] = {
        total: 0,
        purchases: []
      };
    }
    
    roomPools[data.roomId].total += data.totalPrice;
    roomPools[data.roomId].purchases.push({
      clientId: data.clientId,
      playerName: data.playerName,
      cardQuantity: data.cardQuantity,
      totalPrice: data.totalPrice,
      timestamp: new Date().toISOString()
    });
    
    console.log(`   💰 Pozo acumulado de la sala ${data.roomName}: ${roomPools[data.roomId].total.toFixed(2)} Bs`);
    console.log(`   👥 Jugadores en sala ${data.roomName}: ${getRoomPlayerCount(roomId)}`);
    
    // Obtener lista completa de jugadores de la sala
    const playersList = getPlayersInRoom(roomId).map(id => ({
      clientId: id,
      playerName: playerNames[id] || `Jugador ${id.substring(0, 8)}`
    }));
    
    // Notificar a todos en la sala sobre el nuevo jugador (incluyendo lista actualizada)
    io.to(roomId).emit('clientConnected', {
      clientId: clientId,
      playerName: data.playerName,
      roomClients: getRoomPlayerCount(roomId),
      totalClients: io.sockets.sockets.size,
      players: playersList // Incluir lista completa de jugadores
    });
    
    // También enviar evento específico para cuando alguien se une a la sala
    io.to(roomId).emit('playerJoinedRoom', {
      clientId: clientId,
      playerName: data.playerName,
      roomId: data.roomId,
      roomName: data.roomName,
      roomClients: getRoomPlayerCount(roomId),
      players: playersList // Lista completa de jugadores
    });
    
    // Enviar estado actualizado al nuevo jugador
    // Solo enviar el estado del juego si hay un juego activo, de lo contrario enviar estado limpio
    gameState = getRoomGameState(data.roomId);
    const gameStateToSend = gameState && gameState.isGameRunning ? {
      isGameRunning: gameState.isGameRunning,
      gameEnded: gameState.gameEnded,
      generatedNumbers: [...gameState.generatedNumbersList],
      winners: gameState.winners
    } : {
      isGameRunning: false,
      gameEnded: false,
      generatedNumbers: [],
      winners: []
    };
    
    socket.emit('roomJoined', {
      roomId: data.roomId,
      roomName: data.roomName,
      roomClients: getRoomPlayerCount(roomId),
      players: playersList,
      gameState: gameStateToSend
    });
  });

  // Manejar cuando un jugador establece su nombre
  socket.on('setPlayerName', (data) => {
    playerNames[data.clientId] = data.playerName;
    console.log(`👤 Nombre del jugador ${data.clientId}: ${data.playerName}`);
  });

  // Manejar salida de sala
  socket.on('leaveRoom', (data) => {
    const socketRoomId = playerRooms[clientId];
    
    if (!socketRoomId) {
      console.log(`⚠️ Cliente ${clientId} intentó salir de sala sin estar en una`);
      return;
    }

    console.log(`🚪 Cliente ${clientId} saliendo de sala ${data.roomId}`);
    
    // Salir del room de Socket.IO
    socket.leave(socketRoomId);
    
    // Remover de la lista de jugadores de la sala
    if (roomPlayers[socketRoomId]) {
      roomPlayers[socketRoomId].delete(clientId);
      if (roomPlayers[socketRoomId].size === 0) {
        delete roomPlayers[socketRoomId];
      }
      
      // Obtener lista actualizada de jugadores
      const updatedPlayers = getPlayersInRoom(socketRoomId).map(id => ({
        clientId: id,
        playerName: playerNames[id] || `Jugador ${id.substring(0, 8)}`
      }));
      
      // Notificar a la sala que el jugador salió (con lista actualizada)
      io.to(socketRoomId).emit('clientDisconnected', {
        clientId: clientId,
        roomClients: getRoomPlayerCount(socketRoomId),
        totalClients: io.sockets.sockets.size,
        players: updatedPlayers
      });
      
      // También enviar evento específico para cuando alguien sale de la sala
      io.to(socketRoomId).emit('playerLeftRoom', {
        clientId: clientId,
        roomClients: getRoomPlayerCount(socketRoomId),
        players: updatedPlayers
      });
    }
    
    // Limpiar referencias
    delete playerRooms[clientId];
    
    // Verificar si la sala quedó vacía y el juego terminó
    // Si es así, habilitar la sala para nuevos jugadores y limpiar el estado del juego
    const remainingPlayerCount = getRoomPlayerCount(socketRoomId);
    const gameState = getRoomGameState(data.roomId);
    
    if (remainingPlayerCount === 0 && gameState && gameState.gameEnded) {
      console.log(`✅ Sala ${data.roomId} quedó vacía después de que terminó el juego. Limpiando estado y habilitando sala.`);
      
      // Limpiar completamente el estado del juego anterior
      gameState.generatedNumbers.clear();
      gameState.generatedNumbersList.length = 0;
      gameState.gameEnded = false;
      gameState.isGameRunning = false;
      gameState.winners = [];
      gameState.gameInterval = null;
      
      // Limpiar el pozo de la sala también (para que el nuevo juego empiece desde cero)
      if (roomPools[data.roomId]) {
        roomPools[data.roomId] = {
          total: 0,
          purchases: []
        };
      }
      
      // Notificar a TODOS los clientes que la sala está disponible
      const roomsStatus = getAllRoomsStatus();
      io.emit('roomStatusChanged', {
        roomId: parseInt(data.roomId),
        status: roomsStatus[parseInt(data.roomId)],
        allRoomsStatus: roomsStatus
      });
    }
    
    // Confirmar al cliente que salió exitosamente
    socket.emit('roomLeft', {
      success: true,
      message: 'Has salido de la sala exitosamente'
    });
    
    console.log(`✅ Cliente ${clientId} salió de la sala ${data.roomId}`);
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    const roomId = playerRooms[clientId];
    const remainingClients = io.sockets.sockets.size;
    
    console.log(`❌ Cliente desconectado: ${clientId} (Total restante: ${remainingClients})`);
    
    // Remover de la sala
    if (roomId && roomPlayers[roomId]) {
      roomPlayers[roomId].delete(clientId);
      if (roomPlayers[roomId].size === 0) {
        delete roomPlayers[roomId];
      }
      
      // Obtener lista actualizada de jugadores
      const updatedPlayers = getPlayersInRoom(roomId).map(id => ({
        clientId: id,
        playerName: playerNames[id] || `Jugador ${id.substring(0, 8)}`
      }));
      
      // Notificar solo a la sala (con lista actualizada)
      io.to(roomId).emit('clientDisconnected', {
        clientId: clientId,
        roomClients: getRoomPlayerCount(roomId),
        totalClients: remainingClients,
        players: updatedPlayers
      });
      
      // También enviar evento específico para cuando alguien se desconecta
      io.to(roomId).emit('playerLeftRoom', {
        clientId: clientId,
        roomClients: getRoomPlayerCount(roomId),
        players: updatedPlayers
      });
      
      // Verificar si la sala quedó vacía y el juego terminó
      // Si es así, habilitar la sala para nuevos jugadores y limpiar el estado del juego
      const remainingPlayerCount = getRoomPlayerCount(roomId);
      const roomIdNum = parseInt(roomId.replace('room_', ''));
      const gameState = getRoomGameState(roomIdNum);
      
      if (remainingPlayerCount === 0 && gameState && gameState.gameEnded) {
        console.log(`✅ Sala ${roomIdNum} quedó vacía después de que terminó el juego. Limpiando estado y habilitando sala.`);
        
        // Limpiar completamente el estado del juego anterior
        gameState.generatedNumbers.clear();
        gameState.generatedNumbersList.length = 0;
        gameState.gameEnded = false;
        gameState.isGameRunning = false;
        gameState.winners = [];
        gameState.gameInterval = null;
        
        // Limpiar el pozo de la sala también (para que el nuevo juego empiece desde cero)
        if (roomPools[roomIdNum]) {
          roomPools[roomIdNum] = {
            total: 0,
            purchases: []
          };
        }
        
        // Notificar a TODOS los clientes que la sala está disponible
        const roomsStatus = getAllRoomsStatus();
        io.emit('roomStatusChanged', {
          roomId: roomIdNum,
          status: roomsStatus[roomIdNum],
          allRoomsStatus: roomsStatus
        });
      }
    }
    
    // Limpiar referencias
    delete playerRooms[clientId];
    delete playerNames[clientId];
  });
});

// Ruta de estado del servidor
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    game: {
      isRunning: isGameRunning,
      totalClients: io.sockets.sockets.size,
      generatedNumbers: Array.from(generatedNumbers).length,
      config: config
    }
  });
});

// Iniciar servidor
httpServer.listen(config.port, () => {
  console.log(`🚀 Servidor de Bingo iniciado en puerto ${config.port}`);
  console.log(`📡 Socket.IO disponible en http://localhost:${config.port}`);
  console.log(`⚙️  Delay configurado: ${config.numberGenerationDelay}ms`);
  console.log(`🎯 Rango de números: ${config.minNumber}-${config.maxNumber}`);
  console.log(`🌍 Optimizado para alta concurrencia`);
  console.log(`💡 Para escalar a miles de usuarios, considera usar clustering`);
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error);
  // En producción, podrías querer reiniciar el proceso
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});


