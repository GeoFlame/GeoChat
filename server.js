const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

const rooms = {}; // Store messages, nicknames, and admins per room
const adminPassword = 'Geo'; // Replace with something more secure!

io.on('connection', (socket) => {
    console.log('A user connected');

    // Join a room with a code and nickname
    socket.on('joinRoom', ({ roomCode, nickname }, callback) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { messages: [], nicknames: new Set(), admins: new Set() };
        }

        // Check if the nickname is already taken in the room
        if (rooms[roomCode].nicknames.has(nickname)) {
            return callback(true); // Nickname is taken
        } 

        // Join the room
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.nickname = nickname;

        // Add the nickname to the room's nickname set
        rooms[roomCode].nicknames.add(nickname);

        // Check if this user is joining as an admin
        if (nickname === adminPassword) {
            rooms[roomCode].admins.add(nickname);
            socket.isAdmin = true;
            console.log(`${nickname} joined as an admin in room: ${roomCode}`);
        }

        console.log(`${nickname} joined room: ${roomCode}`);
        socket.emit('chatHistory', rooms[roomCode].messages);
        callback(false); // Nickname is unique and accepted
    });

    // Handle new messages
    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) return;

        // Check for /kick command
        if (message.startsWith('/kick ')) {
            const targetNickname = message.split(' ')[1];
            if (socket.isAdmin && rooms[roomCode].nicknames.has(targetNickname)) {
                // Find the target user's socket and disconnect them
                const targetSocket = Array.from(io.sockets.sockets.values()).find(
                    s => s.nickname === targetNickname && s.roomCode === roomCode
                );
                if (targetSocket) {
                    targetSocket.disconnect(true);
                    rooms[roomCode].nicknames.delete(targetNickname);
                    io.to(roomCode).emit('chatMessage', { nickname: 'Server', message: `${targetNickname} has been kicked.` });
                }
            } else {
                socket.emit('chatMessage', { nickname: 'Server', message: 'You do not have permission to kick users.' });
            }
            return;
        }

        const fullMessage = `[${socket.nickname}]: ${message}`;
        rooms[roomCode].messages.push(fullMessage);
        io.to(roomCode).emit('chatMessage', { nickname: socket.nickname, message });
    });

    // Handle user disconnect
    socket.on('disconnecting', () => {
        const roomCode = socket.roomCode;
        const nickname = socket.nickname;

        if (roomCode && nickname && rooms[roomCode]) {
            rooms[roomCode].nicknames.delete(nickname);
            if (socket.isAdmin) rooms[roomCode].admins.delete(nickname);
            console.log(`${nickname} left room: ${roomCode}`);

            if (io.sockets.adapter.rooms.get(roomCode)?.size === 1) {
                delete rooms[roomCode];
                console.log(`Room ${roomCode} is empty, messages cleared.`);
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
