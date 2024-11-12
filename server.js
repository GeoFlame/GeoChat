const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

const rooms = {}; // In-memory storage for messages and nicknames

io.on('connection', (socket) => {
    console.log('A user connected');

    // Join a room with a code and nickname
    socket.on('joinRoom', ({ roomCode, nickname }, callback) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { messages: [], nicknames: new Set() };
        }

        // Check if the nickname is already taken in the room
        if (rooms[roomCode].nicknames.has(nickname)) {
            callback(true); // Nickname is taken
        } else {
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.nickname = nickname;
            rooms[roomCode].nicknames.add(nickname);
            console.log(`${nickname} joined room: ${roomCode}`);

            // Send existing chat history if any
            socket.emit('chatHistory', rooms[roomCode].messages);
            callback(false); // Nickname is unique and accepted
        }
    });

    // Handle new messages
    socket.on('chatMessage', ({ roomCode, nickname, message }) => {
        if (!rooms[roomCode]) return; // Ignore if room doesn't exist

        const fullMessage = `[${nickname}]: ${message}`;
        rooms[roomCode].messages.push(fullMessage);

        // Broadcast the message to everyone in the room
        io.to(roomCode).emit('chatMessage', { nickname, message });
    });

    // Handle user disconnect
    socket.on('disconnecting', () => {
        const roomCode = socket.roomCode;
        const nickname = socket.nickname;
        
        if (roomCode && nickname && rooms[roomCode]) {
            rooms[roomCode].nicknames.delete(nickname);
            console.log(`${nickname} left room: ${roomCode}`);

            // Check if room is empty
            if (io.sockets.adapter.rooms.get(roomCode)?.size === 1) {
                delete rooms[roomCode]; // Clear messages when last person leaves
                console.log(`Room ${roomCode} is empty, messages cleared.`);
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
