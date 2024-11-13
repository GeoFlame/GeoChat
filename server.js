const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // In-memory storage for messages, nicknames, and bans per room

io.on('connection', (socket) => {
    console.log('A user connected');

    // Join a room with a code and nickname
    socket.on('joinRoom', ({ roomCode, nickname }, callback) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { messages: [], nicknames: new Set(), bannedUsers: new Set() };
        }

        // Check if the nickname is banned in the room
        if (rooms[roomCode].bannedUsers.has(nickname)) {
            return callback('You are banned from this room.');
        }

        // Check if the nickname is taken in the room
        if (rooms[roomCode].nicknames.has(nickname)) {
            return callback('Nickname is already taken.');
        } 

        // Everything's good, join the room
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.nickname = nickname;

        // Add the nickname to the room's nickname set
        rooms[roomCode].nicknames.add(nickname);

        console.log(`${nickname} joined room: ${roomCode}`);

        // Send the existing chat history
        socket.emit('chatHistory', rooms[roomCode].messages);
        callback(null); // Successfully joined
    });

    // Handle new messages
    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) return;

        const fullMessage = `[${socket.nickname}]: ${message}`;
        rooms[roomCode].messages.push(fullMessage);

        io.to(roomCode).emit('chatMessage', { nickname: socket.nickname, message });
    });

    // Handle kick command
    socket.on('kickUser', ({ roomCode, targetNickname }) => {
        if (!rooms[roomCode]) return;

        if (socket.nickname !== 'Geo') {
            socket.emit('chatMessage', { nickname: 'System', message: 'You do not have permission to kick users.' });
            return;
        }

        if (rooms[roomCode].nicknames.has(targetNickname)) {
            io.to(roomCode).emit('chatMessage', { nickname: 'System', message: `${targetNickname} has been kicked from the room.` });

            const targetSocketId = [...io.sockets.adapter.rooms.get(roomCode)].find((id) => {
                const targetSocket = io.sockets.sockets.get(id);
                return targetSocket && targetSocket.nickname === targetNickname;
            });

            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                targetSocket.emit('userKicked');
                targetSocket.disconnect();
                rooms[roomCode].nicknames.delete(targetNickname);
            }
        } else {
            socket.emit('chatMessage', { nickname: 'System', message: `${targetNickname} is not in the room.` });
        }
    });

    // Handle ban command
    socket.on('banUser', ({ roomCode, targetNickname }) => {
        if (!rooms[roomCode]) return;

        if (socket.nickname !== 'Geo') {
            socket.emit('chatMessage', { nickname: 'System', message: 'You do not have permission to ban users.' });
            return;
        }

        if (rooms[roomCode].nicknames.has(targetNickname)) {
            rooms[roomCode].bannedUsers.add(targetNickname); // Add nickname to banned list
            io.to(roomCode).emit('chatMessage', { nickname: 'System', message: `${targetNickname} has been banned from the room.` });

            const targetSocketId = [...io.sockets.adapter.rooms.get(roomCode)].find((id) => {
                const targetSocket = io.sockets.sockets.get(id);
                return targetSocket && targetSocket.nickname === targetNickname;
            });

            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                targetSocket.emit('userBanned');
                targetSocket.disconnect();
                rooms[roomCode].nicknames.delete(targetNickname);
            }
        } else {
            socket.emit('chatMessage', { nickname: 'System', message: `${targetNickname} is not in the room.` });
        }
    });

    // Handle user disconnect
    socket.on('disconnecting', () => {
        const roomCode = socket.roomCode;
        const nickname = socket.nickname;

        if (roomCode && nickname && rooms[roomCode]) {
            rooms[roomCode].nicknames.delete(nickname);
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
