class CircuitBreaker {
    constructor(requestHandler, options = {}) {
        this.requestHandler = requestHandler;
        this.failureThreshold = options.failureThreshold || 3; // Failures before opening
        this.resetTimeout = options.resetTimeout || 5000; // Time in ms to wait before half-open
        
        this.failures = 0;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.nextAttempt = Date.now();
        
        // Fault Injection
        this.faultConfig = {
            injectError: false,
            injectLatency: false,
            latencyMs: 2000
        };
    }

    async fire(...args) {
        if (this.state === 'OPEN') {
            if (Date.now() > this.nextAttempt) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('CIRCUIT_OPEN');
            }
        }

        try {
            // Fault Injection Logic
            if (this.faultConfig.injectError) {
                // Determine 50% chance of failure or always? Let's say always for testing
                throw new Error('SIMULATED_FAILURE');
            }
            if (this.faultConfig.injectLatency) {
                await new Promise(r => setTimeout(r, this.faultConfig.latencyMs));
            }

            const response = await this.requestHandler(...args);
            return this.success(response);
        } catch (err) {
            return this.fail(err);
        }
    }

    success(response) {
        this.failures = 0;
        this.state = 'CLOSED';
        return response;
    }

    fail(err) {
        this.failures++;
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.resetTimeout;
            console.log(`[CIRCUIT BREAKER] Open. Next attempt at ${new Date(this.nextAttempt).toISOString()}`);
        }
        throw err;
    }

    // Diagnostics / Control
    getStats() {
        return {
            state: this.state,
            failures: this.failures,
            nextAttempt: this.state === 'OPEN' ? this.nextAttempt : null,
            config: this.faultConfig
        };
    }

    setFaultConfig(config) {
        this.faultConfig = { ...this.faultConfig, ...config };
        console.log('[FAULTS] Updated:', this.faultConfig);
    }
}

module.exports = CircuitBreaker;
