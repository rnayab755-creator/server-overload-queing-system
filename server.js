const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
require('dotenv').config();

app.get("/", (req, res) => {
  res.send("Server Overload Queuing System API is running 🚀");
});


const TokenBucket = require("./rateLimiter");
const Threshold = require("./threshold");
const metrics = require("./metricsManager");
const CircuitBreaker = require("./circuitBreaker");
const emailService = require('./emailService');
const authSecurity = require('./authSecurity');

const client = new OAuth2Client("638158714810-k4cih131svm72glpbra445mbvmtgdnng.apps.googleusercontent.com");
const USERS_FILE = path.join(__dirname, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const getUsers = () => {
    if (!fs.existsSync(USERS_FILE)) return [];
    const data = fs.readFileSync(USERS_FILE);
    return JSON.parse(data);
};

const saveUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// JWT Helper Functions
const generateAccessToken = (user) => {
    return jwt.sign(
        { email: user.email, role: user.role || 'user', provider: user.provider },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { email: user.email, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
};

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ status: "ERROR", message: "Access token required" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ status: "ERROR", message: "Token expired", code: 'TOKEN_EXPIRED' });
            }
            return res.status(403).json({ status: "ERROR", message: "Invalid token" });
        }
        req.user = user;
        next();
    });
};

// Optional: Admin-only middleware
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ status: "ERROR", message: "Admin access required" });
    }
    next();
};

const app = express();
app.use(cors());
app.use(express.json());
// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Get client IP helper
const getClientIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        'unknown';
};

const breaker = new CircuitBreaker(async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok && response.status >= 500) {
        throw new Error(`Server Error: ${response.status}`);
    }
    return response;
});

const bucket = new TokenBucket(40, 3);
const threshold = new Threshold(50);
let backends = [
    "http://localhost:4000",
    "http://localhost:4001",
    "http://localhost:4002",
    "http://localhost:4003",
    "http://localhost:4004",
    "http://localhost:4005",
    "http://localhost:4006",
    "http://localhost:4007",
    "http://localhost:4008",
    "http://localhost:4009",
    "http://localhost:4010"
];
let healthyBackends = [...backends];
let lastUsedIndex = 0;

let isAppServerHealthy = true;
let recoveryPhase = false; // Feature: Automatic Load Recovery Policy

let backendHealthStatus = backends.map(url => ({
    url,
    healthy: true,
    requests: 0,
    rejected: 0,
    active: 0,
    avgLatency: 0,
    cpu: '0%',
    memory: '0%',
    loadStatus: 'STABLE',
    requestsLastPeriod: 0,
    previousTotalRequests: 0,
    lastUpdated: new Date().toISOString()
}));

// Feature: Automatic Load Recovery Policies
setInterval(async () => {
    const statusResults = await Promise.all(backends.map(async (url) => {
        const existing = backendHealthStatus.find(e => e.url === url) || {
            url, healthy: false, requests: 0, rejected: 0, active: 0, avgLatency: 0, requestsLastPeriod: 0
        };
        try {
            const res = await fetch(`${url}/health`);
            const data = await res.json();
            return {
                url,
                ok: res.ok,
                fullStats: {
                    ...existing,
                    healthy: res.ok,
                    cpu: data.cpu || '0%',
                    memory: data.memory || '0%',
                    loadStatus: data.loadStatus || 'STABLE',
                    lastUpdated: new Date().toISOString(),
                    requestsLastPeriod: existing.requests - (existing.previousTotalRequests || 0),
                    previousTotalRequests: existing.requests
                }
            };
        } catch (e) {
            return {
                url,
                ok: false,
                fullStats: { ...existing, healthy: false, lastUpdated: new Date().toISOString(), cpu: 'N/A', memory: 'N/A' }
            };
        }
    }));

    backendHealthStatus = statusResults.map(r => r.fullStats);
    const newHealthyBackends = statusResults.filter(r => r.ok).map(r => r.url);

    const wasDown = !isAppServerHealthy;
    healthyBackends = newHealthyBackends;
    isAppServerHealthy = healthyBackends.length > 0;

    if (wasDown && isAppServerHealthy) {
        recoveryPhase = true;
        metrics.addAlert('INFO', 'Recovery Phase Initiated: At least one server recovered.');
        threshold.updateMaxUsers(5);
        setTimeout(() => { recoveryPhase = false; }, 30000); // 30s recovery
    }
}, 2000);

// Adaptive Tuning Task
setInterval(() => {
    const dropped = threshold.cleanUpExpired(30000);
    if (dropped > 0) metrics.addAlert('WARNING', `SLA Enforcement: Dropped ${dropped} queued requests.`);

    const stats = metrics.getStats(bucket, threshold, backendHealthStatus);
    const cpuRaw = os.loadavg()[0];
    const failRate = (stats.traffic.rejected + stats.traffic.queued) / (stats.traffic.reqPerSec || 1);

    const advice = metrics.getAdaptationAdvice(stats.traffic.reqPerSec, cpuRaw, failRate);

    if (!recoveryPhase) {
        threshold.updateMaxUsers(advice.recommendedMaxUsers);
    }

    if (advice.action === 'THROTTLE') {
        const newCap = Math.max(5, bucket.capacity - 5);
        bucket.updateConfig(newCap, Math.max(1, bucket.refillRate - 1));
    } else if (advice.action === 'SCALE_UP' && metrics.instanceCount < 5) {
        metrics.instanceCount++;
        bucket.updateConfig(15 + (metrics.instanceCount * 10), 3 + (metrics.instanceCount * 2));
        metrics.addAlert('INFO', `Auto-Scaling: Scaled UP to ${metrics.instanceCount} instances.`);
    }
}, 5000);

// --- AUTH ENDPOINTS ---

// Google Auth
app.post("/api/auth/google", async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: "638158714810-k4cih131svm72glpbra445mbvmtgdnng.apps.googleusercontent.com",
        });
        const payload = ticket.getPayload();
        if (!payload.email.endsWith('@gmail.com')) {
            return res.status(403).json({ status: "ERROR", message: "Only Gmail accounts are allowed." });
        }
        res.json({
            status: "SUCCESS",
            user: { name: payload.name, email: payload.email, picture: payload.picture, provider: 'google' }
        });
    } catch (error) {
        res.status(401).json({ status: "ERROR", message: "Invalid Token" });
    }
});

// Local Signup
app.post("/api/auth/signup", async (req, res) => {
    const { name, email, password, secretCode } = req.body;
    const users = getUsers();
    if (users.find(u => u.email === email)) {
        return res.status(409).json({ status: "ERROR", message: "User already exists" });
    }

    // Validate password strength
    if (!password || password.length < 8) {
        return res.status(400).json({ status: "ERROR", message: "Password must be at least 8 characters" });
    }

    let role = secretCode === (process.env.ADMIN_SECRET || 'admin-secret') ? 'admin' : 'user';

    // Use bcrypt for secure password hashing (salt rounds: 12)
    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = { name, email, passwordHash, provider: 'local', role, createdAt: new Date().toISOString() };
    users.push(newUser);
    saveUsers(users);

    // Send welcome email (async, don't wait)
    emailService.sendWelcomeEmail(email, name).catch(err =>
        console.error('[AUTH] Failed to send welcome email:', err.message)
    );

    // Generate JWT tokens
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    console.log(`[AUTH] New user registered: ${email} (${role})`);
    res.json({
        status: "SUCCESS",
        message: "Account created successfully",
        user: { name, email, role },
        accessToken,
        refreshToken
    });
});

// Local Login with Brute-Force Protection
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const clientIP = getClientIP(req);

    // Check if account is locked
    const lockStatus = authSecurity.isLocked(email, clientIP);
    if (lockStatus.locked) {
        return res.status(429).json({
            status: "ERROR",
            message: `Account temporarily locked. Try again in ${lockStatus.remainingMinutes} minutes.`,
            code: 'ACCOUNT_LOCKED',
            remainingMinutes: lockStatus.remainingMinutes,
            lockedUntil: lockStatus.lockedUntil
        });
    }

    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === email && u.provider === 'local');

    if (userIndex === -1) {
        // Record failed attempt even if user doesn't exist (prevents user enumeration timing attacks)
        authSecurity.recordFailedAttempt(email, clientIP);
        return res.status(401).json({ status: "ERROR", message: "Invalid credentials" });
    }

    const user = users[userIndex];
    let isPasswordValid = false;

    // Check if password is stored with bcrypt (starts with $2b$) or legacy SHA-256
    if (user.passwordHash.startsWith('$2b$')) {
        // Modern bcrypt verification
        isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    } else {
        // Legacy SHA-256 verification (for backward compatibility)
        const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
        isPasswordValid = user.passwordHash === sha256Hash;

        // Migrate to bcrypt on successful login
        if (isPasswordValid) {
            users[userIndex].passwordHash = await bcrypt.hash(password, 12);
            saveUsers(users);
            console.log(`[SECURITY] Migrated user ${email} from SHA-256 to bcrypt`);
        }
    }

    if (!isPasswordValid) {
        const attemptInfo = authSecurity.recordFailedAttempt(email, clientIP);
        console.log(`[AUTH] Failed login attempt for ${email} from ${clientIP} (${attemptInfo.attempts}/${attemptInfo.maxAttempts})`);

        if (attemptInfo.locked) {
            return res.status(429).json({
                status: "ERROR",
                message: `Too many failed attempts. Account locked for 15 minutes.`,
                code: 'ACCOUNT_LOCKED'
            });
        }

        return res.status(401).json({
            status: "ERROR",
            message: "Invalid credentials",
            remainingAttempts: attemptInfo.remainingAttempts
        });
    }

    // Successful login - clear failed attempts and generate tokens
    authSecurity.recordSuccessfulLogin(email, clientIP);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    console.log(`[AUTH] Successful login: ${email} (${user.role || 'user'})`);
    res.json({
        status: "SUCCESS",
        user: { name: user.name, email: user.email, role: user.role || 'user', provider: 'local' },
        accessToken,
        refreshToken
    });
});

// Forgot Password with Real Email
app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === email && u.provider === 'local');

    // Always return success to prevent user enumeration
    if (userIndex === -1) {
        return res.json({
            status: "SUCCESS",
            message: "If an account exists with this email, a password reset link has been sent."
        });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    users[userIndex].resetToken = resetToken;
    users[userIndex].resetExpires = Date.now() + 3600000; // 1 hour
    saveUsers(users);

    // Send real email
    const emailResult = await emailService.sendPasswordResetEmail(
        email,
        resetToken,
        users[userIndex].name
    );

    console.log(`[AUTH] Password reset requested for ${email}`);

    if (emailResult.success) {
        res.json({
            status: "SUCCESS",
            message: "Password reset link has been sent to your email."
        });
    } else {
        // Email not configured or failed - provide debug link
        res.json({
            status: "SUCCESS",
            message: "Password reset link generated (Email service not configured)",
            debugLink: emailResult.debugLink // Only in development
        });
    }
});

// Reset Password
app.post("/api/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    const users = getUsers();
    const userIndex = users.findIndex(u => u.resetToken === token && u.resetExpires > Date.now());
    if (userIndex === -1) return res.status(400).json({ status: "ERROR", message: "Invalid or expired token" });

    // Validate password strength
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ status: "ERROR", message: "Password must be at least 8 characters" });
    }

    // Use bcrypt for secure password hashing
    users[userIndex].passwordHash = await bcrypt.hash(newPassword, 12);
    delete users[userIndex].resetToken;
    delete users[userIndex].resetExpires;
    saveUsers(users);

    console.log(`[AUTH] Password reset completed for ${users[userIndex].email}`);
    res.json({ status: "SUCCESS", message: "Password updated successfully" });
});

// JWT Token Refresh
app.post("/api/auth/refresh", (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ status: "ERROR", message: "Refresh token required" });
    }

    jwt.verify(refreshToken, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ status: "ERROR", message: "Invalid refresh token" });
        }

        if (decoded.type !== 'refresh') {
            return res.status(403).json({ status: "ERROR", message: "Invalid token type" });
        }

        // Get user data to generate new access token
        const users = getUsers();
        const user = users.find(u => u.email === decoded.email);

        if (!user) {
            return res.status(404).json({ status: "ERROR", message: "User not found" });
        }

        const newAccessToken = generateAccessToken(user);

        res.json({
            status: "SUCCESS",
            accessToken: newAccessToken
        });
    });
});

// Admin: View Locked Accounts
app.get("/api/auth/admin/locked-accounts", verifyToken, requireAdmin, (req, res) => {
    const lockedAccounts = authSecurity.getLockedAccounts();
    const stats = authSecurity.getStats();

    res.json({
        status: "SUCCESS",
        lockedAccounts,
        stats
    });
});

// Admin: Unlock Account
app.post("/api/auth/admin/unlock", verifyToken, requireAdmin, (req, res) => {
    const { email, ip } = req.body;

    if (!email || !ip) {
        return res.status(400).json({ status: "ERROR", message: "Email and IP required" });
    }

    const result = authSecurity.unlockAccount(email, ip);
    res.json(result);
});

// API Gateway endpoint
app.post("/api/request", async (req, res) => {
    const userEmail = req.body.email || 'guest@example.com';
    const user = {
        email: userEmail,
        priority: req.body.priority || 'MEDIUM',
        timestamp: Date.now()
    };

    if (!isAppServerHealthy) {
        return res.status(503).json({ decision: "REJECTED", reason: "UPSTREAM_UNHEALTHY" });
    }

    // Feature: Distributed Rate Limiting & Tenant Fairness
    const rateLimitResult = bucket.consume(1, userEmail);
    if (!rateLimitResult.allowed) {
        metrics.recordRequest('REJECTED');
        return res.status(429).json({ reason: rateLimitResult.reason });
    }

    // QoS & Queue control
    const result = threshold.allow(user);
    if (result.queued) {
        metrics.recordRequest('QUEUED');
        return res.status(503).json({ decision: "QUEUED", token: result.token });
    }

    if (!result.allowed) {
        metrics.recordRequest('REJECTED');
        return res.status(503).json({ decision: "REJECTED", reason: "SERVER_FULL" });
    }

    try {
        // Feature: Graceful Degradation Mode
        // If system is highly loaded (e.g., > 80% capacity), request partial response
        const isHighlyLoaded = (threshold.activeUsers / threshold.maxUsers) > 0.8;
        const headers = { "Content-Type": "application/json" };
        if (isHighlyLoaded) headers['x-degraded-mode'] = 'true';

        // Load Balancing: Round Robin
        const targetUrl = healthyBackends[lastUsedIndex % healthyBackends.length];
        const targetBackend = backendHealthStatus.find(b => b.url === targetUrl);
        lastUsedIndex++;

        targetBackend.active++;
        const startTime = Date.now();

        try {
            const response = await breaker.fire(`${targetUrl}/process`, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(req.body)
            });
            const data = await response.json();

            const latency = Date.now() - startTime;
            targetBackend.avgLatency = (targetBackend.avgLatency * 0.8) + (latency * 0.2); // Smooth latency
            targetBackend.requests++;
            targetBackend.active--;

            metrics.recordRequest('ACCEPTED');
            res.json({
                decision: "ACCEPTED",
                degraded: isHighlyLoaded,
                appServerResponse: data,
                activeUsers: threshold.activeUsers
            });
        } catch (err) {
            targetBackend.active--;
            targetBackend.rejected++;
            throw err;
        }

    } catch (err) {
        metrics.recordRequest('REJECTED');
        res.status(500).json({ decision: "FAILED", reason: "APPLICATION_SERVER_ERROR" });
    }
});

// Feature: Centralized Control Plane APIs
app.get("/api/system/metrics", (req, res) => {
    res.json(metrics.getStats(bucket, threshold, backendHealthStatus));
});

app.get("/api/system/control/config", (req, res) => {
    res.json({
        maxUsers: threshold.maxUsers,
        capacity: bucket.capacity,
        refillRate: bucket.refillRate,
        recoveryPhase
    });
});

app.post("/api/system/control/update", (req, res) => {
    const { maxUsers, capacity, refillRate } = req.body;
    if (maxUsers) threshold.updateMaxUsers(maxUsers);
    if (capacity && refillRate) bucket.updateConfig(capacity, refillRate);
    res.json({ status: "UPDATED" });
});

// Feature: Dynamic Backend Provisioning
app.post("/api/system/servers/add", (req, res) => {
    try {
        const lastPort = parseInt(backends[backends.length - 1].split(':').pop());
        const newPort = lastPort + 1;
        const newUrl = `http://localhost:${newPort}`;

        console.log(`[PROVISIONING] Spawning new backend on port ${newPort}...`);

        const serverDir = path.join(__dirname, '../app-server');
        const proc = spawn('node', ['server.js', newPort], {
            cwd: serverDir,
            stdio: 'inherit',
            shell: true
        });

        proc.on('exit', (code) => {
            console.log(`[PROVISIONING] Server on port ${newPort} exited with code ${code}`);
            if (code !== 0) {
                metrics.addAlert('CRITICAL', `Backend Crashed: Server on ${newPort} stopped working.`);
            }
        });

        proc.on('error', (err) => {
            console.error(`[PROVISIONING] Failed to start server on port ${newPort}:`, err);
            metrics.addAlert('CRITICAL', `Provisioning Failed: Server on ${newPort} failed to start.`);
        });

        // Add to registry
        backends.push(newUrl);
        backendHealthStatus.push({
            url: newUrl,
            healthy: false,
            requests: 0,
            rejected: 0,
            active: 0,
            avgLatency: 0,
            cpu: '0%',
            memory: '0%',
            loadStatus: 'STABLE',
            requestsLastPeriod: 0,
            previousTotalRequests: 0,
            lastUpdated: new Date().toISOString()
        });

        metrics.addAlert('INFO', `Infrastructure Scaling: Provisioned new server on port ${newPort}.`);

        res.json({
            status: "SUCCESS",
            message: `Server provisioned on port ${newPort}`,
            url: newUrl
        });
    } catch (err) {
        console.error("Provisioning error:", err);
        res.status(500).json({ status: "ERROR", message: "Failed to provision server" });
    }
});

app.get("/api/system/alerts", (req, res) => res.json(metrics.alerts));
app.get("/api/system/circuit-breaker", (req, res) => res.json(breaker.getStats()));

app.post("/api/release", (req, res) => {
    threshold.release(req.body.email);
    res.json({ status: "USER_RELEASED" });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`API Gateway (Distributed & Fairness Enabled) running on port ${PORT}`);
});



