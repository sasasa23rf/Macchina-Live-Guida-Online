const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Usa la porta fornita dall'ambiente (Render) o 8080 come fallback
const PORT = process.env.PORT || 8080;

// 1. Crea un server HTTP per servire la pagina HTML
const server = http.createServer((req, res) => {
    // Se la richiesta è per la root o index.html
    if (req.url === '/' || req.url === '/index.html' || req.url === '/lettura.html') {
        // Cerca il file lettura.html nella stessa directory
        const filePath = path.join(__dirname, 'lettura.html');
        
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end(`Errore caricamento file: ${err.code}`);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                // Modifica dinamica: inietta l'URL corrente se necessario, 
                // ma il client JS già usa window.location o il default.
                // Possiamo servire il file così com'è.
                res.end(content);
            }
        });
    } else {
        res.writeHead(404);
        res.end('File non trovato');
    }
});

// 2. Avvia il server HTTP
server.listen(PORT, () => {
    console.log(`Server HTTP e WebSocket avviato sulla porta ${PORT}`);
});

// 3. Collega il server WebSocket allo stesso server HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  console.log('Nuovo client connesso (Log Reader/Sender)');

  ws.on('message', function incoming(message) {
    // Quando riceve un messaggio (log dall'ESP32 tramite Python), lo inoltra a tutti i client connessi
    // Convertiamo il buffer in stringa se necessario
    const msgString = message.toString();
    
    // Broadcast a tutti i client connessi (escluso chi ha inviato, se necessario, ma qui va bene a tutti)
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msgString);
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnesso');
  });
});
