const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // In-memory storage for messages and nicknames per room
const admins = ['Geo']; // Replace with actual admin usernames

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('joinRoom', ({ roomCode, nickname }, callback) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { messages: [], nicknames: new Set() };
        }

        if (rooms[roomCode].nicknames.has(nickname)) {
            return callback(true);
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.nickname = nickname;

        rooms[roomCode].nicknames.add(nickname);
        console.log(`${nickname} joined room: ${roomCode}`);

        socket.emit('chatHistory', rooms[roomCode].messages);
        callback(false);
    });

    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) return;

        if (message.startsWith('/kick') && admins.includes(socket.nickname)) {
            const targetNickname = message.split(' ')[1];
            io.in(roomCode).sockets.forEach((s) => {
                if (s.nickname === targetNickname) {
                    s.leave(roomCode);
                    s.emit('kicked', 'You have been kicked from the room.');
                    rooms[roomCode].nicknames.delete(targetNickname);
                    io.to(roomCode).emit('chatMessage', {
                        nickname: 'System',
                        message: `${targetNickname} was kicked from the room.`,
                    });
                }
            });
        } else {
            const fullMessage = `[${socket.nickname}]: ${message}`;
            rooms[roomCode].messages.push(fullMessage);
            io.to(roomCode).emit('chatMessage', { nickname: socket.nickname, message });
        }
    });

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
