const WebSocket = require('ws');
const express = require('express');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({server});

const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();
require('dotenv').config();


const request = {
    config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-US",

    },
    interimResults: false
};

wss.on('connection', (ws) => {
    console.log('Someone connected');

    let recognizeStream = null;

    ws.on("message", message => {
        const msg = JSON.parse(message);
        switch(msg.event) {
            case "connected":
                console.log('New caller has connected');
                break;
            case "start":
                console.log('Starting media stream')
                recognizeStream = client
                .streamingRecognize(request)
                .on("error", console.error)
                .on("data", data => {
                    console.log(data.results[0].
                    alternatives[0].transcript);
                });
                break;
            case "media":
                //console.log('Listening to media');
                if (recognizeStream) {
                  recognizeStream.write(msg.media.payload);
              } else {
                  console.log("No active recognition stream. Ignoring media.");
              }
                break;
            case "stop":
                console.log('Stopped the call');
                recognizeStream.destroy();
                break;
        }
    });
});

app.post('/', (req, res) => {
    res.set('Content-Type', "text/xml");
    res.send(
        `<Response>
            <Start>
                <Stream url="wss://${req.headers.host}"/>
            </Start>
            <Say>Hello Brandon! My name is Pam. How can I help you?</Say>
            <Pause length="60" />
        </Response>`
    )  
})

console.log('Listening at Port 8080');
server.listen(8080);