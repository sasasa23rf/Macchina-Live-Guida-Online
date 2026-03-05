const WebSocket = require('ws');

// Usa la porta fornita dall'ambiente (Render) o 8080 come fallback
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });

console.log(`Server di lettura log avviato sulla porta ${PORT}`);

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
