const DistributedStore = require("./distributedStore");

class Threshold {
    constructor(maxUsers) {
        this.store = DistributedStore.getInstance();
        this.store.set('maxUsers', maxUsers);
        this.store.set('activeUsers', 0);
        this.store.set('queues', {
            HIGH: [],   // Admin / Premium
            MEDIUM: [], // Normal users
            LOW: []     // Guests / Bots
        });

        this.nextTokenId = 1;
        this.priorityCounter = 0;
    }

    get maxUsers() { return this.store.get('maxUsers'); }
    set maxUsers(val) { this.store.set('maxUsers', val); }
    get activeUsers() { return this.store.get('activeUsers'); }
    set activeUsers(val) { this.store.set('activeUsers', val); }
    get queues() { return this.store.get('queues'); }
    set queues(val) { this.store.set('queues', val); }

    updateMaxUsers(newMax) {
        this.maxUsers = newMax;
    }

    cleanUpExpired(timeoutMs) {
        const now = Date.now();
        let droppedCount = 0;
        const currentQueues = { ...this.queues };

        ['HIGH', 'MEDIUM', 'LOW'].forEach(prio => {
            const initialLength = currentQueues[prio].length;
            currentQueues[prio] = currentQueues[prio].filter(u => {
                const age = now - (u.joinedAt || now);
                return age <= timeoutMs;
            });
            droppedCount += (initialLength - currentQueues[prio].length);
        });

        this.queues = currentQueues;
        return droppedCount;
    }

    allow(user) {
        const priority = user.priority || 'MEDIUM';

        // Feature: SLA-Aware Request Handling (Deadlines)
        // If system is overloaded, calculate a deadline (e.g., 5s from now for High, 10s for Medium)
        const deadline = Date.now() + (priority === 'HIGH' ? 15000 : 30000);
        user.deadline = user.deadline || deadline;

        if (this.getTotalQueueLength() > 0) {
            const queuePos = this.getUserQueuePosition(user.email);

            if (queuePos) {
                if (this.isNextInLine(user.email)) {
                    if (this.activeUsers < this.maxUsers) {
                        this.removeFromQueue(user.email);
                        this.activeUsers++;
                        return { allowed: true };
                    }
                }
                return { allowed: false, queued: true, token: queuePos.token, priority: queuePos.priority };
            }

            return this.enqueue(user, priority);
        }

        if (this.activeUsers < this.maxUsers) {
            this.activeUsers++;
            return { allowed: true };
        }

        return this.enqueue(user, priority);
    }

    enqueue(user, priority) {
        const existing = this.getUserQueuePosition(user.email);
        if (existing) return { allowed: false, queued: true, token: existing.token, priority: existing.priority };

        const token = this.nextTokenId++;
        const entry = { ...user, token, priority, joinedAt: Date.now() };

        const currentQueues = { ...this.queues };
        currentQueues[priority].push(entry);

        // Feature: SLA-Aware Sorting (Sort by deadline within priority)
        currentQueues[priority].sort((a, b) => a.deadline - b.deadline);

        this.queues = currentQueues;
        return { allowed: false, queued: true, token, priority };
    }

    isNextInLine(email) {
        const q = this.queues;
        if (q.HIGH.length > 0) return q.HIGH[0].email === email;
        if (q.MEDIUM.length > 0) return q.MEDIUM[0].email === email;
        if (q.LOW.length > 0) return q.LOW[0].email === email;
        return false;
    }

    getUserQueuePosition(email) {
        for (const [prio, queue] of Object.entries(this.queues)) {
            const index = queue.findIndex(u => u.email === email);
            if (index !== -1) return { priority: prio, token: queue[index].token, index };
        }
        return null;
    }

    removeFromQueue(email) {
        const currentQueues = { ...this.queues };
        for (const prio of ['HIGH', 'MEDIUM', 'LOW']) {
            const index = currentQueues[prio].findIndex(u => u.email === email);
            if (index !== -1) {
                currentQueues[prio].splice(index, 1);
                this.queues = currentQueues;
                return;
            }
        }
    }

    release(email) {
        if (this.activeUsers > 0) this.activeUsers--;
    }

    getTotalQueueLength() {
        const q = this.queues;
        return q.HIGH.length + q.MEDIUM.length + q.LOW.length;
    }

    getQueueStatus() {
        const q = this.queues;
        return {
            HIGH: q.HIGH.length,
            MEDIUM: q.MEDIUM.length,
            LOW: q.LOW.length,
            total: this.getTotalQueueLength()
        };
    }

    getDetailedQueue() {
        const q = this.queues;
        return [
            ...q.HIGH,
            ...q.MEDIUM,
            ...q.LOW
        ].map(u => ({ email: u.email, token: u.token, priority: u.priority, deadline: u.deadline }));
    }
}

module.exports = Threshold;

