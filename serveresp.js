const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 4000;

// Serve una risposta base per health check HTTP
app.get('/', (req, res) => {
    res.send('Server ESP32 Bridge (WebSocket) Attivo!');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let esp32Socket = null;
const browsers = new Set();

// Funzione Heartbeat
function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws, req) => {
    console.log('Nuova connessione WebSocket');
    
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.on('message', (message) => {
        try {
            const msgStr = message.toString();
            console.log("Messaggio ricevuto:", msgStr);

            // Parsing JSON
            const data = JSON.parse(msgStr);

            // 1. IDENTIFICAZIONE
            if (data.type === 'identify') {
                if (data.client === 'esp32') {
                    esp32Socket = ws;
                    console.log("✅ ESP32 Identificato e registrato");
                } else if (data.client === 'browser') {
                    browsers.add(ws);
                    console.log("✅ Browser Identificato e registrato");
                }
            }
            
            // 2. COMANDO DA BROWSER -> ESP32
            else if (data.type === 'command') {
                if (esp32Socket && esp32Socket.readyState === 1) { // 1 = OPEN
                    console.log("Inoltro comando a ESP32:", data.payload);
                    esp32Socket.send(JSON.stringify(data.payload));
                } else {
                    console.log("⚠️ ESP32 non connesso, impossibile inviare comando");
                }
            }

            // 3. LOG/RISPOSTA DA ESP32 -> BROWSER
            else if (data.type === 'log') {
                console.log("Log da ESP32:", data.payload);
                const logMsg = JSON.stringify({ type: 'esp_log', message: data.payload });
                browsers.forEach(client => {
                    if (client.readyState === 1) {
                        client.send(logMsg);
                    }
                });
            }

        } catch (e) {
            console.error("Errore parsing messaggio:", e);
        }
    });

    ws.on('close', () => {
        if (ws === esp32Socket) {
            console.log('❌ ESP32 Disconnesso');
            esp32Socket = null;
        } else if (browsers.has(ws)) {
            console.log('Browser Disconnesso');
            browsers.delete(ws);
        }
    });

    ws.on('error', (err) => {
        console.error("Errore WebSocket:", err);
    });
});

// Intervallo Ping/Pong per mantenere vive le connessioni (ogni 30s)
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`🚀 Server WebSocket in ascolto sulla porta ${PORT}`);
});
