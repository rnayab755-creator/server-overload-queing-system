const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.initializeTransporter();
    }

    initializeTransporter() {
        const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

        // Check if SMTP is configured
        if (!SMTP_USER || !SMTP_PASS || SMTP_USER === '' || SMTP_PASS === '') {
            console.log('[EMAIL] SMTP not configured. Email features will be disabled.');
            console.log('[EMAIL] To enable: Set SMTP_USER and SMTP_PASS in .env file');
            return;
        }

        try {
            this.transporter = nodemailer.createTransport({
                host: SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(SMTP_PORT) || 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PASS
                }
            });
            this.isConfigured = true;
            console.log('[EMAIL] SMTP configured successfully');
        } catch (error) {
            console.error('[EMAIL] Failed to configure SMTP:', error.message);
        }
    }

    async sendPasswordResetEmail(email, resetToken, userName) {
        if (!this.isConfigured) {
            console.log('[EMAIL] Skipping email send - SMTP not configured');
            return {
                success: false,
                message: 'Email service not configured',
                debugLink: `http://localhost:5173/reset-password.html?token=${resetToken}`
            };
        }

        const resetLink = `http://localhost:5173/reset-password.html?token=${resetToken}`;

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background: #f8f8f8; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Server Shield</h1>
            <p>Password Reset Request</p>
        </div>
        <div class="content">
            <p>Hi ${userName || 'there'},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <center>
                <a href="${resetLink}" class="button">Reset Password</a>
            </center>
            <p>Or copy and paste this link into your browser:</p>
            <p style="background: #f4f4f4; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">${resetLink}</p>
            <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>This link expires in 1 hour</li>
                    <li>If you didn't request this, please ignore this email</li>
                    <li>Never share this link with anyone</li>
                </ul>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated email from Server Shield Authentication System</p>
            <p>© 2026 Server Shield. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;

        try {
            const info = await this.transporter.sendMail({
                from: `"Server Shield" <${process.env.SMTP_USER}>`,
                to: email,
                subject: '🔐 Password Reset Request - Server Shield',
                html: htmlContent,
                text: `Password Reset Request\n\nHi ${userName || 'there'},\n\nWe received a request to reset your password. Click the link below to create a new password:\n\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\n- Server Shield Team`
            });

            console.log('[EMAIL] Password reset email sent:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('[EMAIL] Failed to send email:', error.message);
            return {
                success: false,
                error: error.message,
                debugLink: resetLink
            };
        }
    }

    async sendWelcomeEmail(email, userName) {
        if (!this.isConfigured) {
            console.log('[EMAIL] Skipping welcome email - SMTP not configured');
            return { success: false, message: 'Email service not configured' };
        }

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .footer { background: #f8f8f8; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Welcome to Server Shield!</h1>
        </div>
        <div class="content">
            <p>Hi ${userName},</p>
            <p>Your account has been successfully created! You can now access the Server Shield monitoring and management system.</p>
            <p><strong>What you can do:</strong></p>
            <ul>
                <li>Monitor server health and performance</li>
                <li>View real-time metrics and alerts</li>
                <li>Manage system configuration</li>
                <li>Access detailed reports</li>
            </ul>
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Best regards,<br>The Server Shield Team</p>
        </div>
        <div class="footer">
            <p>© 2026 Server Shield. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;

        try {
            const info = await this.transporter.sendMail({
                from: `"Server Shield" <${process.env.SMTP_USER}>`,
                to: email,
                subject: '🎉 Welcome to Server Shield!',
                html: htmlContent,
                text: `Welcome to Server Shield!\n\nHi ${userName},\n\nYour account has been successfully created! You can now access the Server Shield monitoring and management system.\n\nBest regards,\nThe Server Shield Team`
            });

            console.log('[EMAIL] Welcome email sent:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('[EMAIL] Failed to send welcome email:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EmailService();
