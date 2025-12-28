import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import importResidentsHandler from './api/importResidents.js';
import updateRequestHandler from './api/update-request-status.js';
import ownerLoginHandler from './api/ownerLogin.js';
import ownerResidenciesHandler from './api/ownerResidencies.js';
import toggleServiceHandler from './api/toggleService.js';
import createOwnerHandler from './api/createOwner.js';
import residencyStatusHandler from './api/residencyStatus.js';
import registerResidencyHandler from './api/registerResidency.js';
import deleteResidencyHandler from './api/deleteResidency.js';

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
app.use(cors());

// Middleware to support JSON bodies for handlers that need it
// Note: importResidents handles its own body parsing (formidable)
// But others might need body parsing.
app.use(express.json());

const adaptHandler = (handler) => async (req, res) => {
    try {
        await handler(req, res);
    } catch (e) {
        console.error("Handler Error:", e);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
};

app.post('/api/importResidents', adaptHandler(importResidentsHandler));
app.post('/api/update-request-status', adaptHandler(updateRequestHandler));

// Owner API
app.post('/api/ownerLogin', adaptHandler(ownerLoginHandler));
app.get('/api/ownerResidencies', adaptHandler(ownerResidenciesHandler));
app.post('/api/toggleService', adaptHandler(toggleServiceHandler));
app.post('/api/createOwner', adaptHandler(createOwnerHandler));
app.get('/api/residencyStatus', adaptHandler(residencyStatusHandler));
app.post('/api/registerResidency', adaptHandler(registerResidencyHandler));
app.post('/api/deleteResidency', adaptHandler(deleteResidencyHandler));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});
