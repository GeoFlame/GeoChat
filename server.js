const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

const rooms = {}; // Store rooms information
const publicRooms = []; // Store public room codes for easy access

// Route to fetch public rooms
app.get('/rooms', (req, res) => {
    res.json(publicRooms); // Send the list of public rooms
});

io.on('connection', (socket) => {
    console.log('A user connected');

    // Join or create a room
    socket.on('joinRoom', ({ roomCode, nickname, isPublic }, callback) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { messages: [], nicknames: new Set(), isPublic: isPublic || false, creator: nickname };
            if (isPublic) publicRooms.push(roomCode); // Add to public room list
        }

        // Check if the nickname is already taken in the room
        if (rooms[roomCode].nicknames.has(nickname)) {
            return callback(true); // Nickname is taken
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

        // Notify others in the room
        io.to(roomCode).emit('chatMessage', { nickname: 'System', message: `${nickname} has joined the room.` });

        callback(false); // Nickname is unique and accepted
    });

    // Handle new messages
    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) return; // Ignore if room doesn't exist

        // If user is kicked, do not broadcast
        if (socket.kicked) {
            return;
        }

        const fullMessage = `[${socket.nickname}]: ${message}`;
        rooms[roomCode].messages.push(fullMessage);

        // Broadcast the message to everyone in the room
        io.to(roomCode).emit('chatMessage', { nickname: socket.nickname, message });
    });

    // Handle user kick command
    socket.on('kickUser', (nickname) => {
        const roomCode = socket.roomCode;
        if (rooms[roomCode] && socket.nickname === rooms[roomCode].creator) {
            const targetSocket = Array.from(io.sockets.adapter.rooms.get(roomCode)).find(s => s.nickname === nickname);
            if (targetSocket) {
                targetSocket.kicked = true;
                targetSocket.emit('kicked');
                io.to(roomCode).emit('chatMessage', { nickname: 'System', message: `${nickname} was kicked from the room.` });
            }
        }
    });

    // Handle user disconnect
    socket.on('disconnecting', () => {
        const roomCode = socket.roomCode;
        const nickname = socket.nickname;

        if (roomCode && nickname && rooms[roomCode]) {
            rooms[roomCode].nicknames.delete(nickname);
            console.log(`${nickname} left room: ${roomCode}`);

            // If the room is empty, clear its messages
            if (io.sockets.adapter.rooms.get(roomCode)?.size === 1) {
                delete rooms[roomCode];
                publicRooms.splice(publicRooms.indexOf(roomCode), 1); // Remove from public list
                console.log(`Room ${roomCode} is empty, messages cleared.`);
            } else {
                io.to(roomCode).emit('chatMessage', { nickname: 'System', message: `${nickname} has left the room.` });
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
