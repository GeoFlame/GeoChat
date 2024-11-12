const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

const rooms = {}; // In-memory storage for messages

io.on('connection', (socket) => {
    console.log('A user connected');

    // Join a room with a code
    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);
        console.log(`User joined room: ${roomCode}`);

        // Send existing messages if any
        if (rooms[roomCode]) {
            socket.emit('chatHistory', rooms[roomCode]);
        } else {
            rooms[roomCode] = []; // Create new room
        }
    });

    // Handle new messages
    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) rooms[roomCode] = [];
        rooms[roomCode].push(message);

        // Broadcast the message to everyone in the room
        io.to(roomCode).emit('chatMessage', message);
    });

    // Leave room
    socket.on('disconnecting', () => {
        const [roomCode] = [...socket.rooms].slice(1); // get room code
        console.log(`User leaving room: ${roomCode}`);
        
        // Check if room is empty
        if (io.sockets.adapter.rooms.get(roomCode)?.size === 1) {
            delete rooms[roomCode]; // Clear messages when last person leaves
            console.log(`Room ${roomCode} is empty, messages cleared.`);
        }
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
