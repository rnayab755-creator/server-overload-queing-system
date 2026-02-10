// DOM Elements
const authContainer = document.getElementById('auth-container');
const mainDashboard = document.getElementById('main-dashboard');
const queueDashboard = document.getElementById('queue-dashboard');
const authMessage = document.getElementById('auth-message');
const displayName = document.getElementById('display-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');

const sendBtn = document.getElementById('send-btn');
const releaseBtn = document.getElementById('release-btn');
const clearLogBtn = document.getElementById('clear-log');
const logList = document.getElementById('log-list');
const tokensCount = document.getElementById('tokens-count');
const activeUsers = document.getElementById('active-users');

// Queue Elements
const myTokenDisplay = document.getElementById('my-token');
const queueList = document.getElementById('queue-list');
const refreshQueueBtn = document.getElementById('refresh-queue');
const queuePriorityDisplay = document.getElementById('queue-priority');
const requestPriorityInp = document.getElementById('request-priority');
const instanceCountDisplay = document.getElementById('instance-count'); // If it existed, but it's on monitoring.html

// Auth Views
const googleView = document.getElementById('google-auth-view');
const emailView = document.getElementById('email-auth-view');
const signupView = document.getElementById('signup-view');
const forgotView = document.getElementById('forgot-password-view');
const authNav = document.getElementById('auth-nav');

// Inputs
const loginEmailInp = document.getElementById('login-email');
const loginPassInp = document.getElementById('login-password');
const signupNameInp = document.getElementById('signup-name');
const signupEmailInp = document.getElementById('signup-email');
const signupPassInp = document.getElementById('signup-password');
const forgotEmailInp = document.getElementById('forgot-email');

// Buttons
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const forgotBtn = document.getElementById('forgot-btn');


const API_GATEWAY = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3005/api'
    : '/api'; // In production, we assume the frontend is served as a static site and proxied or on the same domain

// --- AUTH LOGIC ---

window.switchAuthTab = function (tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'google') {
        tabs[0].classList.add('active');
        googleView.style.display = 'block';
        emailView.style.display = 'none';
        signupView.style.display = 'none';
        forgotView.style.display = 'none';
    } else {
        tabs[1].classList.add('active');
        googleView.style.display = 'none';
        emailView.style.display = 'block';
        signupView.style.display = 'none';
        forgotView.style.display = 'none';
    }
    authMessage.textContent = '';
};

window.showView = function (viewName) {
    authMessage.textContent = '';
    if (viewName === 'signup') {
        emailView.style.display = 'none';
        signupView.style.display = 'block';
        authNav.style.display = 'none';
    } else if (viewName === 'forgot-password') {
        emailView.style.display = 'none';
        forgotView.style.display = 'block';
        authNav.style.display = 'none';
    } else if (viewName === 'login') {
        signupView.style.display = 'none';
        forgotView.style.display = 'none';
        emailView.style.display = 'block';
        authNav.style.display = 'flex';
        switchAuthTab('email');
    }
};

// Callback function for Google Identity Services
async function handleCredentialResponse(response) {
    console.log("Encoded JWT ID token: " + response.credential);

    try {
        const verifyRes = await fetch(`${API_GATEWAY}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });

        const data = await verifyRes.json();

        if (verifyRes.ok) {
            login(data.user);
        } else {
            showError(data.message || 'Authentication failed');
        }
    } catch (err) {
        console.error("Auth Error:", err);
        showError('Connection error with backend');
    }
}

// Global for Google
window.handleCredentialResponse = handleCredentialResponse;

// Local Auth Handlers
if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const email = loginEmailInp.value;
        const password = loginPassInp.value;

        if (!email || !password) return showError('Please fill in all fields');

        try {
            const res = await fetch(`${API_GATEWAY}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (res.ok) {
                login(data.user);
            } else {
                showError(data.message);
            }
        } catch (e) {
            showError('Login failed');
        }
    });
}

if (signupBtn) {
    signupBtn.addEventListener('click', async () => {
        const name = signupNameInp.value;
        const email = signupEmailInp.value;
        const password = signupPassInp.value;

        if (!name || !email || !password) return showError('Please fill in all fields');

        try {
            const res = await fetch(`${API_GATEWAY}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();

            if (res.ok) {
                // Auto login or ask to login
                login(data.user);
            } else {
                showError(data.message);
            }
        } catch (e) {
            showError('Signup failed');
        }
    });
}

if (forgotBtn) {
    forgotBtn.addEventListener('click', async () => {
        const email = forgotEmailInp.value;
        if (!email) return showError('Please enter your email');

        try {
            const res = await fetch(`${API_GATEWAY}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();

            // For demo purposes, we might show the mock link in alert or console
            if (data.status === 'SUCCESS') {
                authMessage.style.color = 'var(--success)';
                authMessage.textContent = 'Reset link sent (Check Server Console)';
            } else {
                showError(data.message);
            }
        } catch (e) {
            showError('Request failed');
        }
    });
}

function showError(msg) {
    authMessage.style.color = 'var(--error)';
    authMessage.textContent = msg;
}

function login(user) {
    localStorage.setItem('user_token', JSON.stringify(user));
    displayName.textContent = user.name;
    if (user.picture) {
        userAvatar.src = user.picture;
        userAvatar.style.display = 'block';
    } else {
        // Fallback avatar or hide
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`;
        userAvatar.style.display = 'block';
    }

    // Attempt to enter (check queue/status)
    if (user.role === 'admin') {
        window.location.href = 'monitoring.html';
        return;
    }
    checkStatus();
}

function logout() {
    localStorage.removeItem('user_token');
    authContainer.style.display = 'block';
    mainDashboard.style.display = 'none';
    queueDashboard.style.display = 'none';
    // Reset inputs
    // Reset inputs
    if (loginPassInp) loginPassInp.value = '';

    // Stop Polling
    if (window.userStatsPoller) clearInterval(window.userStatsPoller);

    window.location.reload();
}

logoutBtn.addEventListener('click', logout);

// --- APP LOGIC ---

async function checkStatus() {
    // Determine where the user stands (Auth -> Queue -> Dashboard)
    const storedUser = JSON.parse(localStorage.getItem('user_token'));
    if (!storedUser) {
        authContainer.style.display = 'block';
        updateAuthSystemStatus(); // Start polling status
        return;
    }

    if (storedUser.role === 'admin') {
        alert('This is the User Portal. Please use the Admin Portal.');
        window.location.href = 'admin-login.html';
        return;
    }

    // Try to "connect" or view status
    authContainer.style.display = 'none';

    // In this simple demo, we assume if you are logged in, you try to access the dashboard.
    // The server will tell us if we are queuing.
    await sendRequest(true); // Initial probe
}

// System Status Polling for Auth Screen
async function updateAuthSystemStatus() {
    if (authContainer.style.display === 'none') return; // Don't poll if logged in

    try {
        const res = await fetch(`${API_GATEWAY}/system/metrics`);
        const data = await res.json();

        const loadText = document.getElementById('sys-load-text');
        const indicator = document.getElementById('sys-indicator');

        if (!loadText || !indicator) return;

        const reqRate = data.traffic.reqPerSec;
        // Simple logic for status
        if (reqRate > 15) {
            loadText.textContent = "Heavy Load";
            loadText.style.color = "var(--error)";
            indicator.style.background = "var(--error)";
        } else if (reqRate > 8) {
            loadText.textContent = "Moderate";
            loadText.style.color = "var(--warning)";
            indicator.style.background = "var(--warning)";
        } else {
            loadText.textContent = "Optimal";
            loadText.style.color = "var(--success)";
            indicator.style.background = "var(--success)";
        }

        setTimeout(updateAuthSystemStatus, 2000); // Poll every 2s
    } catch (e) {
        // console.error("Status poll failed");
    }
}

async function sendRequest(isInitialProbe = false) {
    const storedUser = JSON.parse(localStorage.getItem('user_token'));
    if (!storedUser) return;

    if (!isInitialProbe) addLog('INFO', 'Initiating request...');

    try {
        const response = await fetch(`${API_GATEWAY}/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: storedUser.email,
                name: storedUser.name,
                priority: requestPriorityInp ? requestPriorityInp.value : 'MEDIUM'
            })
        });

        const data = await response.json();

        // Update Stats
        if (data.remainingTokens !== undefined) tokensCount.textContent = `${data.remainingTokens}/10`;
        if (data.activeUsers !== undefined) activeUsers.textContent = `${data.activeUsers}/20`;

        if (response.status === 503 && data.reason === 'SERVER_OVERLOADED') {
            // Show Queue Screen
            showQueueScreen(data.queueToken, data.priority);
            if (!isInitialProbe) addLog('WARNING', `Server full. Queued as ${data.priority} priority.`);
            return;
        }

        if (response.ok) {
            if (isInitialProbe) {
                showMainDashboard();
            } else {
                // Redirect to SIS only on manual button click
                window.location.href = 'https://sis.kalasalingam.ac.in/login';
            }

            if (!isInitialProbe) {
                addLog('SUCCESS', `Accepted: ${data.appServerResponse.message}`);
            }
        } else {
            // Other errors (Rate limit etc)
            if (!isInitialProbe) {
                const reason = data.reason || 'UNKNOWN_ERROR';
                addLog('ERROR', `Rejected: ${reason}`);
            }
        }

    } catch (error) {
        if (!isInitialProbe) addLog('ERROR', 'Gateway down or connection failed');
        console.error(error);
    }
}

async function fetchQueueStatus() {
    try {
        const response = await fetch(`${API_GATEWAY}/queue-status`);
        const data = await response.json();

        // Render List
        queueList.innerHTML = '';
        data.queue.forEach(item => {
            const div = document.createElement('div');
            div.className = `log-item ${item.priority === 'HIGH' ? 'success' : item.priority === 'MEDIUM' ? 'warning' : 'info'}`;
            div.innerHTML = `<span class="message">[${item.priority}] Token: ${item.token}</span> <span class="time">${item.email}</span>`;
            queueList.appendChild(div);
        });

    } catch (e) {
        console.error("Failed to fetch queue", e);
    }
}

function showMainDashboard() {
    mainDashboard.style.display = 'block';
    queueDashboard.style.display = 'none';

    // Start Polling Stats for User
    startUserStatsPolling();
}

function startUserStatsPolling() {
    if (window.userStatsPoller) clearInterval(window.userStatsPoller);
    window.userStatsPoller = setInterval(async () => {
        if (mainDashboard.style.display === 'none') return;

        try {
            // We can re-use metrics endpoint or just do a light probe
            // For simplicity, we just ask for metrics to update the top cards
            const res = await fetch(`${API_GATEWAY}/system/metrics`);
            const data = await res.json();

            // Update User Dashboard Cards
            if (tokensCount) tokensCount.textContent = `${Math.floor(data.resources.tokens)}/${data.resources.bucketCapacity}`;
            if (activeUsers) activeUsers.textContent = `${data.resources.activeUsers}/${data.resources.maxUsers}`;

        } catch (e) {
            console.log("Polling failed");
        }
    }, 1000);
}

function showQueueScreen(token, priority) {
    mainDashboard.style.display = 'none';
    queueDashboard.style.display = 'block';
    myTokenDisplay.textContent = token || "WAITING";
    if (queuePriorityDisplay) queuePriorityDisplay.textContent = `Priority Level: ${priority || 'PENDING'}`;
    fetchQueueStatus();
}

async function releaseUser() {
    const storedUser = JSON.parse(localStorage.getItem('user_token'));
    if (!storedUser) return;

    try {
        await fetch(`${API_GATEWAY}/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: storedUser.email })
        });
        addLog('WARNING', 'Session released.');

        // After release, we might be kicked back to queue if we try again immediately, 
        // or we just sit in dashboard until we send another request.
    } catch (error) {
        addLog('ERROR', 'Failed to release user');
    }
}

function addLog(type, message) {
    const item = document.createElement('div');
    item.className = `log-item ${type.toLowerCase()}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    item.innerHTML = `
        <span class="message">${message}</span>
        <span class="time">${time}</span>
    `;
    logList.appendChild(item);
    logList.scrollTop = logList.scrollHeight;
    if (logList.children.length > 50) logList.removeChild(logList.firstChild);
}

// Check Session on Init
const savedUserStr = localStorage.getItem('user_token');
if (savedUserStr) {
    const user = JSON.parse(savedUserStr);
    displayName.textContent = user.name;
    if (user.picture) {
        userAvatar.src = user.picture;
    } else {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`;
    }
    checkStatus();
}

sendBtn.addEventListener('click', () => sendRequest(false));
releaseBtn.addEventListener('click', releaseUser);
clearLogBtn.addEventListener('click', () => logList.innerHTML = '');
refreshQueueBtn.addEventListener('click', fetchQueueStatus);

// Countdown Logic
let countdownTimer;
const COUNTDOWN_START = 5;
let timeLeft = COUNTDOWN_START;

function startCountdown() {
    // Reset
    clearInterval(countdownTimer);
    timeLeft = COUNTDOWN_START;
    updateCountdownDisplay();

    countdownTimer = setInterval(() => {
        if (queueDashboard.style.display !== 'block') {
            clearInterval(countdownTimer);
            return;
        }

        timeLeft--;
        updateCountdownDisplay();

        if (timeLeft <= 0) {
            // Trigger refresh
            fetchQueueStatus();
            sendRequest(true); // Retry request

            // Reset timer
            timeLeft = COUNTDOWN_START;
            updateCountdownDisplay();
        }
    }, 1000);
}

function updateCountdownDisplay() {
    const el = document.getElementById('countdown');
    if (el) el.textContent = timeLeft;
}

// Start countdown when queue screen is shown
const originalShowQueueScreen = showQueueScreen;
showQueueScreen = function (token, priority) {
    originalShowQueueScreen(token, priority);
    startCountdown();
};

