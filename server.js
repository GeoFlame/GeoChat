const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

const rooms = {}; // In-memory storage for messages and nicknames per room
const publicRooms = {}; // Stores public rooms to show them in the join page

// Serve the HTML for joining or creating a room
app.get('/join', (req, res) => {
    res.sendFile(__dirname + '/join.html');
});

// Serve the HTML for the chatroom
app.get('/chat', (req, res) => {
    res.sendFile(__dirname + '/chat.html');
});

// Handle room creation and joining
io.on('connection', (socket) => {
    console.log('A user connected');

    // Join a room with a code and nickname
    socket.on('joinRoom', ({ roomCode, nickname, isPublic }, callback) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { messages: [], nicknames: new Set(), isPublic: isPublic || false };
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

        // If the room is public, store it in the publicRooms list
        if (rooms[roomCode].isPublic) {
            publicRooms[roomCode] = true;
        }

        console.log(`${nickname} joined room: ${roomCode}`);

        // Send the existing chat history
        socket.emit('chatHistory', rooms[roomCode].messages);
        callback(false); // Nickname is unique and accepted
    });

    // Handle new messages
    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) return; // Ignore if room doesn't exist

        const fullMessage = `[${socket.nickname}]: ${message}`;
        rooms[roomCode].messages.push(fullMessage);

        // Broadcast the message to everyone in the room
        io.to(roomCode).emit('chatMessage', { nickname: socket.nickname, message });
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
                delete publicRooms[roomCode]; // Remove from public list if empty
                console.log(`Room ${roomCode} is empty, messages cleared.`);
            }
        }
    });

    // Send the list of public rooms when requested
    socket.on('getPublicRooms', () => {
        socket.emit('publicRooms', Object.keys(publicRooms));
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
