const { spawn } = require('child_process');
const path = require('path');

const startPort = 4000;
const serverCount = 11; // 1 original + 10 additional

app.get("/", (req, res) => {
  res.send("Server Overload Queuing System API is running 🚀");
});


for (let i = 0; i < serverCount; i++) {
    const port = startPort + i;
    const proc = spawn('node', ['server.js', port], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true
    });

    proc.on('error', (err) => {
        console.error(`Failed to start server on port ${port}:`, err);
    });

    console.log(`Spawning server on port ${port}...`);
}

