// Feature: Distributed Store (State Synchronization)
// In a real production environment, this would be Redis.
// Here we simulate a centralized store that all gateway instances "connect" to.

class DistributedStore {
    constructor() {
        this.data = {
            tokens: 40,
            activeUsers: 0,
            tenants: {}, // { email: { tokens: X, lastUsed: T } }
            queues: { HIGH: [], MEDIUM: [], LOW: [] }
        };
    }

    // Singleton simulation
    static getInstance() {
        if (!global.distributedStoreInstance) {
            global.distributedStoreInstance = new DistributedStore();
        }
        return global.distributedStoreInstance;
    }

    get(key) {
        return this.data[key];
    }

    set(key, value) {
        this.data[key] = value;
    }

    // Tenant-specific logic
    getTenantData(email) {
        if (!this.data.tenants[email]) {
            this.data.tenants[email] = { tokens: 10, lastRefill: Date.now() }; // Default tenant limit
        }
        return this.data.tenants[email];
    }

    updateTenant(email, updates) {
        this.data.tenants[email] = { ...this.getTenantData(email), ...updates };
    }
}

module.exports = DistributedStore;
