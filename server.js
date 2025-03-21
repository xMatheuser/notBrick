const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Create HTTP server
const server = http.createServer((req, res) => {
    // Parse URL and remove query parameters
    const parsedUrl = url.parse(req.url);
    let filePath = parsedUrl.pathname;
    
    // Normalize the file path
    if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
    }

    // Remove leading slash and clean path
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
                // If file not found, serve index.html for client-side routing
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

// Store active rooms
const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');
    let roomId = null;

    ws.on('message', (message) => {
        try {
            // Convert buffer or blob to string before parsing
            const messageStr = message.toString();
            const data = JSON.parse(messageStr);
            console.log('Received:', data);
            
            switch(data.type) {
                case 'join':
                    handleJoin(ws, data.roomId);
                    roomId = data.roomId;
                    break;
                case 'gameUpdate':
                    broadcastToRoom(roomId, message, ws);
                    break;
                case 'switchPlayer':
                    broadcastToRoom(roomId, message, null); // Enviar para todos
                    break;
                case 'gameOver':
                    broadcastToRoom(roomId, message, null); // Enviar para todos
                    break;
                case 'levelUp':
                    broadcastToRoom(roomId, message, null); // Enviar para todos
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
    }
    
    const room = rooms.get(roomId);
    if (room.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }
    
    room.add(ws);
    console.log(`Player joined room ${roomId}. Room now has ${room.size} players`);
    
    ws.send(JSON.stringify({
        type: 'joined',
        player: room.size === 1 ? 1 : 2
    }));
}

function broadcastToRoom(roomId, message, sender) {
    const room = rooms.get(roomId);
    if (room) {
        const messageStr = message.toString();
        room.forEach(client => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }
}

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
