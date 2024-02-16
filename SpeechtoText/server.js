const WebSocket = require('ws');
const express = require('express');
const axios = require('axios');
const textToSpeech = require('@google-cloud/text-to-speech');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient();
const ttsClient = new textToSpeech.TextToSpeechClient();

require('dotenv').config();

const openAIKey = process.env.OPENAI_API_KEY;

const request = {
    config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-US",
    },
    interimResults: false
};

async function getOpenAIResponse(message) {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: [
                    { "role": "system", "content": "You are a helpful assistant." },
                    { "role": "user", "content": message }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${openAIKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("Error in OpenAI API call:", error.response.data);
        return null;
    }
}


async function convertTextToSpeechAndSave(text) {
    const request = {
        input: { text: text },
        voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3' },
    };

    try {
        const [response] = await ttsClient.synthesizeSpeech(request);
        const fileName = `speech_${Date.now()}.mp3`;
        const filePath = path.join(__dirname, 'public', fileName);
        fs.writeFileSync(filePath, response.audioContent, 'binary');
        return fileName;
    } catch (error) {
        console.error('Error in Text-to-Speech conversion:', error);
        return null;
    }
}

wss.on('connection', (ws) => {
    console.log('Someone connected');

    let recognizeStream = null;

    ws.on("message", async (message) => {
        const msg = JSON.parse(message);
        switch (msg.event) {
            case "connected":
                console.log('New caller has connected');
                break;
            case "start":
                console.log('Starting media stream');
                recognizeStream = speechClient
                    .streamingRecognize(request)
                    .on("error", console.error)
                    .on("data", async (data) => {
                        const transcript = data.results[0].alternatives[0].transcript;
                        console.log(transcript);
                        const openAIResponse = await getOpenAIResponse(transcript);
                        console.log("OpenAI Response:", openAIResponse);

                        // Send the response back as a text message
                        // Adjust this to match your Twilio application's expectations
                        //ws.send(JSON.stringify({ "text": openAIResponse }));
                    });
                break;
            case "media":
                if (recognizeStream) {
                    recognizeStream.write(msg.media.payload);
                } else {
                    console.log("No active recognition stream. Ignoring media.");
                }
                break;
            case "stop":
                console.log('Stopped the call');
                if (recognizeStream) {
                    recognizeStream.destroy();
                }
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
            <Say>Hello! How can I help you?</Say>
            <Pause length="60" />
        </Response>`
    );
});

console.log('Listening at Port 8080');
server.listen(8080);
