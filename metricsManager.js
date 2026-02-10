const os = require('os');

class MetricsManager {
    constructor() {
        this.history = []; // Sliding window of last 30 seconds
        this.alerts = [];
        this.instanceCount = 1;

        // Feature: Learning-based Traffic Profiling
        // Stores avg traffic per minute/hour to "learn" patterns
        this.trafficProfile = {
            peakRates: [],
            dailyPatterns: {} // { '11:54': avgRate }
        };

        this.currentStats = {
            requests: 0,
            accepted: 0,
            rejected: 0,
            queued: 0
        };

        // Aggregator loop (every 1s)
        setInterval(() => {
            const cpuUsage = os.loadavg()[0]; // 1-minute load average
            const freeMem = os.freemem() / os.totalmem();

            const entry = {
                timestamp: Date.now(),
                ...this.currentStats,
                instanceCount: this.instanceCount,
                cpu: cpuUsage,
                memory: 1 - freeMem // Memory usage percentage
            };

            this.updateProfile(this.currentStats.requests);

            this.history.push(entry);
            if (this.history.length > 30) this.history.shift();

            this.currentStats = { requests: 0, accepted: 0, rejected: 0, queued: 0 };
            this.predictLoad();
        }, 1000);
    }

    // Feature: Learning-based Traffic Profiling
    updateProfile(requests) {
        const now = new Date();
        const timeKey = `${now.getHours()}:${now.getMinutes()}`;

        if (!this.trafficProfile.dailyPatterns[timeKey]) {
            this.trafficProfile.dailyPatterns[timeKey] = requests;
        } else {
            // Moving average of historical data for this minute
            this.trafficProfile.dailyPatterns[timeKey] = (this.trafficProfile.dailyPatterns[timeKey] * 0.9) + (requests * 0.1);
        }
    }

    recordRequest(status) {
        this.currentStats.requests++;
        if (status === 'ACCEPTED') this.currentStats.accepted++;
        if (status === 'REJECTED') this.currentStats.rejected++;
        if (status === 'QUEUED') this.currentStats.queued++;
    }

    predictLoad() {
        if (this.history.length < 5) return;

        const last5 = this.history.slice(-5);
        const avgRate = last5.reduce((sum, h) => sum + h.requests, 0) / 5;
        const trend = avgRate > last5[0].requests ? 'UP' : 'DOWN';

        // Check against Profile (Learning-based prediction)
        const now = new Date();
        const timeKey = `${now.getHours()}:${now.getMinutes()}`;
        const historicalAvg = this.trafficProfile.dailyPatterns[timeKey] || 0;

        if (avgRate > historicalAvg * 1.5 && historicalAvg > 0) {
            this.addAlert('WARNING', `Traffic Anomaly: Loading is 50% higher than historical average for this time.`);
        }

        if (avgRate > 15 && trend === 'UP') {
            this.addAlert('WARNING', 'Soft Overload Predicted: Incoming traffic trend is increasing.');
        }
    }

    addAlert(type, message) {
        if (this.alerts.length > 0 && this.alerts[0].message === message) return;
        this.alerts.unshift({ type, message, timestamp: new Date().toLocaleTimeString() });
        if (this.alerts.length > 20) this.alerts.pop();
        console.log(`[ALERT] ${type}: ${message}`);
    }

    getAdaptationAdvice(currentReqRate, currentCpu, failedRate) {
        // Feature: Resource Utilization Awareness
        // If CPU load > core count * 0.8, we are overloaded regardless of req rate
        const coreCount = os.cpus().length;
        const isCpuOverloaded = currentCpu > coreCount * 0.8;

        let action = 'MAINTAIN';
        const ERROR_THRESHOLD = 0.1;

        if (failedRate > ERROR_THRESHOLD || isCpuOverloaded) {
            action = 'THROTTLE';
            if (isCpuOverloaded) this.addAlert('CRITICAL', 'System overloaded: High CPU detected.');
        } else if (currentReqRate > 20) {
            action = 'SCALE_UP';
        } else if (currentReqRate < 5) {
            action = 'SCALE_DOWN';
        }

        return { action, recommendedMaxUsers: this.calculateDynamicCapacity(currentReqRate, failedRate, isCpuOverloaded) };
    }

    calculateDynamicCapacity(reqRate, failRate, cpuOverload) {
        let target = 50;
        if (cpuOverload) target = 25;
        if (failRate > 0.05) target = Math.min(target, 30);
        if (failRate > 0.20) target = 10;
        return target;
    }

    getStats(bucket, threshold, backendStatus = []) {
        const lastEntry = this.history[this.history.length - 1] || {};
        const cpuUsage = (lastEntry.cpu || 0) / os.cpus().length * 100;

        return {
            system: {
                instanceCount: backendStatus.length || this.instanceCount,
                cpuLoad: cpuUsage.toFixed(1) + '%',
                memoryUsage: ((lastEntry.memory || 0) * 100).toFixed(1) + '%',
                predictedStatus: lastEntry.requests > 20 || cpuUsage > 80 ? 'OVERLOAD' : 'STABLE',
                backends: backendStatus
            },
            traffic: {
                reqPerSec: lastEntry.requests || 0,
                accepted: lastEntry.accepted || 0,
                rejected: lastEntry.rejected || 0,
                queued: lastEntry.queued || 0
            },
            resources: {
                tokens: bucket.tokens,
                activeUsers: threshold.activeUsers,
                maxUsers: threshold.maxUsers,
                activeTenants: bucket.getStats().activeTenants
            },
            queues: threshold.getQueueStatus(),
            recentAlerts: this.alerts.slice(0, 5)
        };
    }
}

module.exports = new MetricsManager();

