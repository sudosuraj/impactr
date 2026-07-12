const express = require('express');
const { exec } = require('child_process');

const app = express();
const port = 3005;

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Testbed Corp</title></head>
            <body>
                <h1>Welcome to Testbed Corp</h1>
                <p>We are a secure corporation. Nothing to see here.</p>
                <!-- Check out our new ping utility: /api/ping?host=127.0.0.1 -->
            </body>
        </html>
    `);
});

app.get('/api/ping', (req, res) => {
    const host = req.query.host;
    if (!host) {
        return res.status(400).send("Missing host parameter");
    }

    // Vulnerability: Command Injection
    exec('ping -n 1 ' + host, (error, stdout, stderr) => {
        if (error) {
            return res.send('<pre>Error: ' + stderr + '</pre>');
        }
        res.send('<pre>' + stdout + '</pre>');
    });
});

app.listen(port, () => {
    console.log(`Testbed app listening on port ${port}`);
});
