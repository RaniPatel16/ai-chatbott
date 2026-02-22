import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/studybot';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 3000 // Timeout faster if no db found
}).then(() => {
    console.log("Connected to MongoDB successfully!");
}).catch((error) => {
    console.warn("MongoDB connection failed! Proceeding with in-memory storage fallback. Error:", error.message);
});

// In-memory fallback if MongoDB isn't running
const LOCAL_DB_PATH = './database.json';
let memoryFallback = {};
try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
        memoryFallback = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf-8'));
    }
} catch (e) {
    console.warn("Failed to read local database.json, starting fresh", e);
}

const saveLocalDb = () => {
    try {
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(memoryFallback, null, 2), 'utf-8');
    } catch (e) {
        console.error("Failed to save to local database.json", e);
    }
};

// Chat History Schema
const chatSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    sessionName: { type: String },
    messages: [
        {
            role: { type: String, enum: ['user', 'model'], required: true },
            text: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ]
});

const ChatHistory = mongoose.model('ChatHistory', chatSchema);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyArLnjjiDBzzfZ3SK7WJeBN6OunofVjgc8");

// Set up prompt specifically for the Study Bot
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: "You are Study Bot, an AI-powered academic assistant. You help students understand study topics, explain difficult concepts clearly, and guide them in their learning journey. Be encouraging, precise, and educational in your tone. Remember context from previous questions."
});

app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId = 'default-session', message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        let historyForGemini = [];
        let chatRecord = null;

        if (mongoose.connection.readyState === 1) {
            // Fetch previous conversation history from MongoDB
            chatRecord = await ChatHistory.findOne({ sessionId });
            if (chatRecord) {
                historyForGemini = chatRecord.messages.map(msg => ({
                    role: msg.role === 'ai' ? 'model' : msg.role,
                    parts: [{ text: msg.text }]
                }));
            } else {
                chatRecord = new ChatHistory({ sessionId, messages: [] });
            }
        } else {
            // Use In-Memory Fallback if MongoDB is offline
            if (!memoryFallback[sessionId]) memoryFallback[sessionId] = { messages: [] };
            historyForGemini = memoryFallback[sessionId].messages.map(msg => ({
                role: msg.role === 'ai' ? 'model' : msg.role,
                parts: [{ text: msg.text }]
            }));
        }

        // Start chat with history
        const chat = model.startChat({
            history: historyForGemini
        });

        // Send new message to Gemini
        const result = await chat.sendMessage(message);
        const responseText = result.response.text();

        // Save new messages to history
        if (mongoose.connection.readyState === 1 && chatRecord) {
            chatRecord.messages.push({ role: 'user', text: message });
            chatRecord.messages.push({ role: 'model', text: responseText });
            await chatRecord.save();
        } else {
            memoryFallback[sessionId].messages.push({ role: 'user', text: message });
            memoryFallback[sessionId].messages.push({ role: 'model', text: responseText });
            saveLocalDb();
        }

        res.json({
            response: responseText,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Error processing chat:", error.message);
        res.status(500).json({ error: "Failed to generate response: " + error.message });
    }
});

app.get('/api/history/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (mongoose.connection.readyState === 1) {
            const chatRecord = await ChatHistory.findOne({ sessionId });
            if (!chatRecord) return res.json({ messages: [] });
            return res.json({ messages: chatRecord.messages });
        } else {
            const memRecord = memoryFallback[sessionId];
            if (!memRecord) return res.json({ messages: [] });
            return res.json({ messages: memRecord.messages });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

app.get('/api/sessions', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const sessions = await ChatHistory.find({}, 'sessionId sessionName').lean();
            return res.json({
                sessions: sessions.map(s => ({
                    id: s.sessionId,
                    name: s.sessionName || `Session ${new Date(parseInt(s.sessionId)).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                })).reverse()
            });
        } else {
            return res.json({
                sessions: Object.keys(memoryFallback).map(id => ({
                    id,
                    name: memoryFallback[id].sessionName || `Session ${new Date(parseInt(id)).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                })).reverse()
            });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch sessions" });
    }
});

app.put('/api/sessions/:sessionId/rename', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });

        if (mongoose.connection.readyState === 1) {
            await ChatHistory.updateOne({ sessionId }, { sessionName: name });
        } else {
            if (memoryFallback[sessionId]) {
                memoryFallback[sessionId].sessionName = name;
                saveLocalDb();
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to rename session" });
    }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (mongoose.connection.readyState === 1) {
            await ChatHistory.deleteOne({ sessionId });
        } else {
            delete memoryFallback[sessionId];
            saveLocalDb();
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete session" });
    }
});

app.get('/', (req, res) => {
    res.send('Study Bot API is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
