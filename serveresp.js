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
// Store last known steering data
let currentSteeringData = { center: 0, left: 0, right: 0 };
// Store monitor status
let currentMonitorStatus = { enabled: true, interval: 100 };

// Store Cam Settings
let camSettings = {
    '1': { speed: 70, duration: 100 },
    '2': { speed: 110, duration: 100 },
    '3': { speed: 60, duration: 100 },
    '4': { speed: 120, duration: 100 },
    'repeatInterval': 500 // Nuovo parametro globale
};

// Store Control Settings (Nuovo)
let controlSettings = {
    // Monitor Posizione
    posMonitorEnabled: true,
    posMonitorInterval: 100,
    
    // Destra - Sinistra
    adStepValue: 50,
    adStepEnabled: true,
    
    // Partenza W Custom
    wStartEnabled: true,
    wStartValue: 300,
    wWheelStep: 50,
    
    // Limite Max W
    wMaxEnabled: false,
    wMaxValue: 1023,
    
    // Valore Tasto S
    sValue: 300,

    // Sterzata Controllata Velocità
    speedSteeringEnabled: true,
    speedSteeringVal: 20,
    speedSteeringThreshold: 700
};

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
            // Gestione Heartbeat manuale (se il client manda "ping" testuale)
            if (message.toString() === 'ping') {
                ws.send('pong');
                return;
            }

            const msgStr = message.toString();
            // console.log("Messaggio ricevuto:", msgStr);

            // Parsing JSON
            const data = JSON.parse(msgStr);

            // 1. IDENTIFICAZIONE
            if (data.type === 'identify') {
                if (data.client === 'esp32') {
                    // Chiudi eventuale vecchia connessione fantasma
                    if (esp32Socket && esp32Socket !== ws && esp32Socket.readyState === 1) {
                         console.log("Chiudo vecchia connessione ESP32");
                         esp32Socket.terminate();
                    }
                    esp32Socket = ws;
                    console.log("✅ ESP32 Identificato e registrato");
                } else if (data.client === 'browser') {
                    browsers.add(ws);
                    console.log("✅ Browser Identificato e registrato");
                    // Invia subito i dati dello sterzo correnti al nuovo browser
                    ws.send(JSON.stringify({ type: 'steering_data', payload: currentSteeringData }));
                    // Invia stato monitoraggio
                    ws.send(JSON.stringify({ type: 'monitor_status', payload: currentMonitorStatus }));
                    // Invia impostazioni cam
                    ws.send(JSON.stringify({ type: 'cam_settings', payload: camSettings }));
                    // Invia impostazioni controlli (Nuovo)
                    ws.send(JSON.stringify({ type: 'control_settings', payload: controlSettings }));
                }
            }
            
            // 2. COMANDO DA BROWSER -> ESP32
            else if (data.type === 'command') {
                if (data.payload.action === 'UPDATE_CONTROL_SETTINGS') {
                    controlSettings = { ...controlSettings, ...data.payload.settings };
                    console.log("Control Settings Updated:", controlSettings);
                    
                    const syncCtrl = JSON.stringify({ type: 'control_settings', payload: controlSettings });
                    browsers.forEach(client => { 
                        if(client !== ws && client.readyState === 1) client.send(syncCtrl); 
                    });
                }

                if (esp32Socket && esp32Socket.readyState === 1) { // 1 = OPEN
                    // Se è un comando monitoraggio, salviamo lo stato
                    if (data.payload.action === 'SET_POS_MONITOR') {
                        currentMonitorStatus.enabled = data.payload.enabled;
                        currentMonitorStatus.interval = data.payload.interval;
                        console.log("Stato Monitor salvato:", currentMonitorStatus);
                        
                        // Propaghiamo l'aggiornamento a tutti gli altri browser per tenerli sincronizzati
                        const syncMsg = JSON.stringify({ type: 'monitor_status', payload: currentMonitorStatus });
                        browsers.forEach(client => {
                            if (client !== ws && client.readyState === 1) {
                                client.send(syncMsg);
                            }
                        });
                    }

                    // Se è un comando cam (KEY_DOWN) o aggiornamento settings (UPDATE_CAM_SETTINGS), salviamo i settings
                    if ((data.payload.action === 'KEY_DOWN' || data.payload.action === 'UPDATE_CAM_SETTINGS') && ['1', '2', '3', '4'].includes(data.payload.key)) {
                        if (data.payload.speed && data.payload.duration) {
                            camSettings[data.payload.key] = {
                                speed: data.payload.speed,
                                duration: data.payload.duration
                            };
                            console.log(`Cam Setting Saved [Key ${data.payload.key}]:`, camSettings[data.payload.key]);
                            
                            // Se è un UPDATE_CAM_SETTINGS, propaghiamo agli altri browser per sync
                            if (data.payload.action === 'UPDATE_CAM_SETTINGS') {
                                const syncCam = JSON.stringify({ type: 'cam_settings', payload: camSettings });
                                browsers.forEach(client => { 
                                    if(client !== ws && client.readyState === 1) client.send(syncCam); 
                                });
                            }
                        }
                    }

                    // Se è un UPDATE_REPEAT_INTERVAL
                    if (data.payload.action === 'UPDATE_REPEAT_INTERVAL') {
                        if (data.payload.interval) {
                            camSettings.repeatInterval = data.payload.interval;
                            console.log(`Cam Repeat Interval Saved: ${camSettings.repeatInterval}ms`);
                            
                            // Propaghiamo sync
                            const syncCam = JSON.stringify({ type: 'cam_settings', payload: camSettings });
                            browsers.forEach(client => { 
                                if(client !== ws && client.readyState === 1) client.send(syncCam); 
                            });
                        }
                    }

                    // console.log("Inoltro comando a ESP32:", data.payload);
                    esp32Socket.send(JSON.stringify(data.payload));
                } else {
                    console.log("⚠️ ESP32 non connesso, impossibile inviare comando");
                }
            }

            // 3. LOG/RISPOSTA DA ESP32 -> BROWSER
            else if (data.type === 'log') {
                // console.log("Log da ESP32:", data.payload);
                const logMsg = JSON.stringify({ type: 'esp_log', message: data.payload });
                browsers.forEach(client => {
                    if (client.readyState === 1) {
                        client.send(logMsg);
                    }
                });
            }
            
            // 4. DATI STERZO DA ESP32
            else if (data.type === 'steering_data') {
                console.log("Dati sterzo aggiornati:", data.payload);
                currentSteeringData = data.payload;
                
                // Broadcast a tutti i browser
                const updateMsg = JSON.stringify({ type: 'steering_data', payload: currentSteeringData });
                browsers.forEach(client => {
                    if (client.readyState === 1) {
                        client.send(updateMsg);
                    }
                });
            }
            
            // 5. DATI POSIZIONE IN TEMPO REALE DA ESP32
            else if (data.type === 'pos_data') {
                // Non logghiamo per non intasare
                // Invia a tutti i browser connessi
                const posMsg = JSON.stringify({ type: 'pos_data', payload: data.payload });
                browsers.forEach(client => {
                    if (client.readyState === 1) {
                        client.send(posMsg);
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
