const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ATTEMPTS_FILE = path.join(__dirname, 'login_attempts.json');
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_DURATION = parseInt(process.env.LOCKOUT_DURATION) || 900000; // 15 minutes

class AuthSecurity {
    constructor() {
        this.attempts = this.loadAttempts();
        // Clean up expired lockouts every minute
        setInterval(() => this.cleanupExpired(), 60000);
    }

    loadAttempts() {
        if (!fs.existsSync(ATTEMPTS_FILE)) {
            return {};
        }
        try {
            const data = fs.readFileSync(ATTEMPTS_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[AUTH_SECURITY] Error loading attempts:', error.message);
            return {};
        }
    }

    saveAttempts() {
        try {
            fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(this.attempts, null, 2));
        } catch (error) {
            console.error('[AUTH_SECURITY] Error saving attempts:', error.message);
        }
    }

    getKey(email, ip) {
        // Track by both email and IP for better security
        return `${email}:${ip}`;
    }

    isLocked(email, ip) {
        const key = this.getKey(email, ip);
        const attempt = this.attempts[key];

        if (!attempt) {
            return { locked: false };
        }

        // Check if lockout has expired
        if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
            const remainingTime = Math.ceil((attempt.lockedUntil - Date.now()) / 1000 / 60);
            return {
                locked: true,
                remainingMinutes: remainingTime,
                attempts: attempt.count,
                lockedUntil: new Date(attempt.lockedUntil).toISOString()
            };
        }

        // Lockout expired, reset
        if (attempt.lockedUntil && Date.now() >= attempt.lockedUntil) {
            delete this.attempts[key];
            this.saveAttempts();
            return { locked: false };
        }

        return { locked: false, attempts: attempt.count };
    }

    recordFailedAttempt(email, ip) {
        const key = this.getKey(email, ip);

        if (!this.attempts[key]) {
            this.attempts[key] = {
                count: 0,
                firstAttempt: Date.now(),
                lastAttempt: Date.now()
            };
        }

        this.attempts[key].count++;
        this.attempts[key].lastAttempt = Date.now();

        // Lock account if max attempts reached
        if (this.attempts[key].count >= MAX_ATTEMPTS) {
            this.attempts[key].lockedUntil = Date.now() + LOCKOUT_DURATION;
            console.log(`[AUTH_SECURITY] Account locked: ${email} from IP ${ip} for ${LOCKOUT_DURATION / 60000} minutes`);
        }

        this.saveAttempts();

        return {
            attempts: this.attempts[key].count,
            maxAttempts: MAX_ATTEMPTS,
            remainingAttempts: Math.max(0, MAX_ATTEMPTS - this.attempts[key].count),
            locked: this.attempts[key].lockedUntil ? true : false
        };
    }

    recordSuccessfulLogin(email, ip) {
        const key = this.getKey(email, ip);

        // Clear failed attempts on successful login
        if (this.attempts[key]) {
            delete this.attempts[key];
            this.saveAttempts();
            console.log(`[AUTH_SECURITY] Cleared failed attempts for ${email} from IP ${ip}`);
        }
    }

    unlockAccount(email, ip) {
        const key = this.getKey(email, ip);

        if (this.attempts[key]) {
            delete this.attempts[key];
            this.saveAttempts();
            console.log(`[AUTH_SECURITY] Manually unlocked account: ${email} from IP ${ip}`);
            return { success: true, message: 'Account unlocked successfully' };
        }

        return { success: false, message: 'No lockout found for this account' };
    }

    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        for (const key in this.attempts) {
            const attempt = this.attempts[key];

            // Remove if lockout expired or attempt is older than 24 hours
            if ((attempt.lockedUntil && now >= attempt.lockedUntil) ||
                (now - attempt.lastAttempt > 86400000)) {
                delete this.attempts[key];
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.saveAttempts();
            console.log(`[AUTH_SECURITY] Cleaned up ${cleaned} expired lockout records`);
        }
    }

    getStats() {
        const now = Date.now();
        const stats = {
            totalLocked: 0,
            totalAttempts: 0,
            recentAttempts: 0 // Last hour
        };

        for (const key in this.attempts) {
            const attempt = this.attempts[key];
            stats.totalAttempts++;

            if (attempt.lockedUntil && now < attempt.lockedUntil) {
                stats.totalLocked++;
            }

            if (now - attempt.lastAttempt < 3600000) { // 1 hour
                stats.recentAttempts++;
            }
        }

        return stats;
    }

    // Get all locked accounts (for admin view)
    getLockedAccounts() {
        const now = Date.now();
        const locked = [];

        for (const key in this.attempts) {
            const attempt = this.attempts[key];
            if (attempt.lockedUntil && now < attempt.lockedUntil) {
                const [email, ip] = key.split(':');
                locked.push({
                    email,
                    ip,
                    attempts: attempt.count,
                    lockedUntil: new Date(attempt.lockedUntil).toISOString(),
                    remainingMinutes: Math.ceil((attempt.lockedUntil - now) / 1000 / 60)
                });
            }
        }

        return locked;
    }
}

module.exports = new AuthSecurity();
