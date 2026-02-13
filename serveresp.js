const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configurazione Socket.IO con CORS abilitato per accettare connessioni da ovunque
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'], // Supportiamo entrambi
    pingInterval: 10000, // Ping più frequente (10s)
    pingTimeout: 5000    // Timeout più breve per rilevare cadute (5s)
});

const PORT = process.env.PORT || 4000; // Usiamo la porta 4000 per non andare in conflitto con l'altro server

// Rotta base per verificare che il server sia attivo
app.get('/', (req, res) => {
    res.send('Server ESP32 Bridge Attivo!');
});

io.on('connection', (socket) => {
    console.log('Nuovo dispositivo connesso:', socket.id);

    // Identificazione: Il client può presentarsi come "esp32" o "browser"
    socket.on('identify', (type) => {
        socket.join(type); // "esp32" o "browser"
        console.log(`Client ${socket.id} identificato come: ${type}`);
    });

    // 1. COMANDI DA BROWSER A ESP32
    // Il browser emette 'send_command', noi lo giriamo alla room 'esp32'
    socket.on('send_command', (commandData) => {
        console.log('Comando ricevuto dal browser:', commandData);
        io.to('esp32').emit('command', commandData);
    });

    // 2. RISPOSTE/LOG DA ESP32 A BROWSER
    // L'ESP32 emette 'log_message', noi lo giriamo alla room 'browser'
    socket.on('log_message', (message) => {
        console.log('Log da ESP32:', message);
        io.to('browser').emit('esp_log', message);
    });

    socket.on('disconnect', (reason) => {
        console.log(`Client disconnesso: ${socket.id} - Motivo: ${reason}`);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server ESP32 Bridge in ascolto sulla porta ${PORT}`);
});
