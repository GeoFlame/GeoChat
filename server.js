const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

const rooms = {}; // In-memory storage for messages, nicknames, and room settings

io.on('connection', (socket) => {
    console.log('A user connected');

    // Join a room with a code and nickname
    socket.on('joinRoom', ({ roomCode, nickname, isPublic }, callback) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { 
                messages: [],
                nicknames: new Set(),
                creator: socket.id,
                isPublic: isPublic,
            };
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

        // Notify everyone in the room that someone has joined
        io.to(roomCode).emit('chatMessage', { 
            nickname: 'System', 
            message: `${nickname} has joined the chat.` 
        });

        // Send the existing chat history
        socket.emit('chatHistory', rooms[roomCode].messages);
        
        // Send the room list to the join page if the room is public
        if (isPublic) {
            io.emit('updateRoomList', getPublicRooms());
        }

        callback(false); // Nickname is unique and accepted
    });

    // Handle new messages
    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) return; // Ignore if room doesn't exist

        const fullMessage = `[${socket.nickname}${rooms[roomCode].creator === socket.id ? ' 👑' : ''}]: ${message}`;
        rooms[roomCode].messages.push(fullMessage);

        // Broadcast the message to everyone in the room
        io.to(roomCode).emit('chatMessage', { nickname: socket.nickname, message });
    });

    // Handle kick command
    socket.on('kickUser', (userNickname, roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        if (socket.id !== room.creator) {
            // Only room creator can kick
            return socket.emit('chatMessage', { nickname: 'System', message: "You're not the room creator!" });
        }

        const userSocketId = [...io.sockets.adapter.rooms.get(roomCode)].find(id => io.sockets.sockets.get(id).nickname === userNickname);
        if (userSocketId) {
            io.to(userSocketId).emit('chatMessage', { nickname: 'System', message: "You have been kicked from the room." });
            io.sockets.sockets.get(userSocketId).leave(roomCode);
            room.nicknames.delete(userNickname);
            io.to(roomCode).emit('chatMessage', { nickname: 'System', message: `${userNickname} has been kicked from the chat.` });
            
            // Show kicked screen
            io.to(userSocketId).emit('kicked');
        }
    });

    // Handle user disconnect
    socket.on('disconnecting', () => {
        const roomCode = socket.roomCode;
        const nickname = socket.nickname;

        if (roomCode && nickname && rooms[roomCode]) {
            rooms[roomCode].nicknames.delete(nickname);
            console.log(`${nickname} left room: ${roomCode}`);

            // Notify everyone in the room that someone has left
            io.to(roomCode).emit('chatMessage', { nickname: 'System', message: `${nickname} has left the chat.` });

            // If the room is empty, clear its messages
            if (io.sockets.adapter.rooms.get(roomCode)?.size === 1) {
                delete rooms[roomCode];
                console.log(`Room ${roomCode} is empty, messages cleared.`);
            }
        }
    });
});

// Get a list of public rooms
function getPublicRooms() {
    return Object.keys(rooms).filter(roomCode => rooms[roomCode].isPublic);
}

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
