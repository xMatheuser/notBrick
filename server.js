const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let filePath = parsedUrl.pathname;

    if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
    }

    filePath = filePath.replace(/^\/+/, '');
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(__dirname, safePath);

    const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css'
    };

    console.log(`Attempting to serve: ${fullPath}`);
    fs.readFile(fullPath, (error, content) => {
        if (error) {
            console.error(`Error reading file: ${fullPath}`, error);
            if (error.code === 'ENOENT') {
                const indexPath = path.join(__dirname, 'index.html');
                fs.readFile(indexPath, (err, content) => {
                    if (err) {
                        res.writeHead(404);
                        res.end('File not found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(content);
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server error: ${error.code}`);
            }
        } else {
            const contentType = contentTypes[path.extname(filePath)] || 'text/plain';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

// Store active rooms and game states
const rooms = new Map();
const lastGameState = new Map(); // Global Map to store game states by room ID

wss.on('connection', (ws) => {
    console.log('New client connected');
    let roomId = null;

    ws.on('message', (message) => {
        try {
            const messageStr = message.toString();
            const data = JSON.parse(messageStr);
            console.log('Received:', data);

            switch (data.type) {
                case 'join':
                    handleJoin(ws, data.roomId);
                    roomId = data.roomId;
                    break;
                case 'gameUpdate':
                    const room = rooms.get(roomId);
                    if (room) {
                        const gameState = data.gameState;
                        const previousState = lastGameState.get(roomId) || {};
                        const delta = calculateDelta(previousState, gameState);
                        if (Object.keys(delta).length > 0) {
                            broadcastToRoom(roomId, JSON.stringify({ type: 'gameUpdateDelta', delta: delta }), ws);
                            lastGameState.set(roomId, { ...gameState });
                        }
                    }
                    break;
                case 'switchPlayer':
                    broadcastToRoom(roomId, message, null);
                    break;
                case 'gameOver':
                    broadcastToRoom(roomId, message, null);
                    break;
                case 'levelUp':
                    broadcastToRoom(roomId, message, null);
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            console.error('Raw message:', message);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.delete(ws);
                if (room.size === 0) {
                    rooms.delete(roomId);
                    lastGameState.delete(roomId); // Clean up game state
                }
                console.log(`Room ${roomId} now has ${room.size} players`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function handleJoin(ws, roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
        lastGameState.set(roomId, {}); // Initialize game state for the room
    }

    const room = rooms.get(roomId);
    if (room.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    room.add(ws);
    const playerNumber = room.size === 1 ? 1 : 2;

    ws.send(JSON.stringify({
        type: 'joined',
        player: playerNumber,
        currentPlayer: 1 // Always starts with Player 1
    }));

    if (room.size === 2 && lastGameState.has(roomId)) {
        ws.send(JSON.stringify({
            type: 'gameUpdateDelta',
            delta: lastGameState.get(roomId) // Sync full state for second player
        }));
    }

    broadcastToRoom(roomId, JSON.stringify({
        type: 'playerJoined',
        playerCount: room.size,
        currentPlayer: 1
    }), ws);

    console.log(`Player ${playerNumber} joined room ${roomId}. Room now has ${room.size} players`);
}

function calculateDelta(oldState, newState) {
    const delta = {};

    if (!oldState) return newState || {};

    for (const key in newState) {
        if (newState.hasOwnProperty(key)) {
            if (typeof newState[key] === 'object' && newState[key] !== null) {
                if (JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])) {
                    delta[key] = newState[key];
                }
            } else if (oldState[key] !== newState[key]) {
                delta[key] = newState[key];
            }
        }
    }

    return delta;
}

function broadcastToRoom(roomId, message, excludeWs) {
    const room = rooms.get(roomId);
    if (room) {
        room.forEach(client => {
            if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});