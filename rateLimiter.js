const DistributedStore = require("./distributedStore");

class TokenBucket {
    constructor(capacity, refillRate) {
        this.store = DistributedStore.getInstance();
        this.store.set('tokens', capacity);
        this.store.set('capacity', capacity);
        this.store.set('refillRate', refillRate);

        // Global interval for refill (synchronized via store)
        this.refillInterval = setInterval(() => {
            const current = this.store.get('tokens');
            const cap = this.store.get('capacity');
            const rate = this.store.get('refillRate');
            this.store.set('tokens', Math.min(cap, current + rate));

            // Periodic tenant token refill (Fairness Enforcement)
            this.refillTenants();
        }, 1000);
    }

    refillTenants() {
        const tenants = this.store.get('tenants');
        for (const email in tenants) {
            // Give each tenant 2 tokens per sec (Tenant Limit)
            tenants[email].tokens = Math.min(10, tenants[email].tokens + 4);
        }
        this.store.set('tenants', tenants);
    }

    consume(cost = 1, email = null) {
        // 1. Global Rate Limit Check
        const globalTokens = this.store.get('tokens');
        if (globalTokens < cost) return { allowed: false, reason: 'GLOBAL_LIMIT' };

        // 2. Tenant Fairness Enforcement (Feature: Client / Tenant Fairness)
        if (email) {
            const tenant = this.store.getTenantData(email);
            if (tenant.tokens < cost) {
                return { allowed: false, reason: 'TENANT_LIMIT_EXCEEDED' };
            }
            tenant.tokens -= cost;
            this.store.updateTenant(email, tenant);
        }

        // Apply global consumption
        this.store.set('tokens', globalTokens - cost);
        return { allowed: true };
    }

    // Dynamic adjustment for auto-scaling
    updateConfig(newCapacity, newRefillRate) {
        this.store.set('capacity', newCapacity);
        this.store.set('refillRate', newRefillRate);
        const current = this.store.get('tokens');
        this.store.set('tokens', Math.min(current, newCapacity));
    }

    get capacity() { return this.store.get('capacity'); }
    get tokens() { return this.store.get('tokens'); }
    get refillRate() { return this.store.get('refillRate'); }

    getStats() {
        return {
            tokens: this.tokens,
            capacity: this.capacity,
            refillRate: this.refillRate,
            activeTenants: Object.keys(this.store.get('tenants')).length
        };
    }
}

module.exports = TokenBucket;

