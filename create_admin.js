const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, 'users.json');

const getUsers = () => {
    if (!fs.existsSync(USERS_FILE)) return [];
    try {
        const data = fs.readFileSync(USERS_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

const saveUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

const createAdmin = () => {
    const users = getUsers();
    const email = 'admin@server.com';
    const password = 'admin123';

    // Check if admin exists
    const existingIndex = users.findIndex(u => u.email === email);

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    const adminUser = {
        name: 'System Admin',
        email: email,
        passwordHash: passwordHash,
        provider: 'local',
        role: 'admin',
        createdAt: new Date().toISOString()
    };

    if (existingIndex !== -1) {
        console.log('Updating existing admin user...');
        users[existingIndex] = { ...users[existingIndex], ...adminUser };
    } else {
        console.log('Creating new admin user...');
        users.push(adminUser);
    }

    saveUsers(users);
    console.log('Admin user created/updated successfully.');
    console.log('Email: admin@server.com');
    console.log('Password: admin123');
};

createAdmin();
