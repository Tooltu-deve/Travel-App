import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
    constructor(
        private mailerService: MailerService,
        private configService: ConfigService,
    ) { }

    /**
     * Gửi email xác thực tài khoản
     * @param email - Email người nhận
     * @param fullName - Tên người dùng
     * @param token - Token xác thực
     */
    async sendVerificationEmail(email: string, fullName: string, token: string) {
        // Link trỏ trực tiếp đến API backend để verify
        const url = `http://localhost:3000/api/v1/auth/verify-email/${token}`;

        try {
            await this.mailerService.sendMail({
                to: email,
                subject: 'Xác thực tài khoản của bạn',
                template: './verification',
                context: {
                    name: fullName,
                    url,
                },
            });
            console.log(`✅ Đã gửi email xác thực đến ${email}`);
        } catch (error) {
            console.error('❌ Lỗi khi gửi email:', error);
            throw error;
        }
    }

    /**
     * Gửi email chào mừng sau khi xác thực thành công
     * @param email - Email người nhận
     * @param fullName - Tên người dùng
     */
    async sendWelcomeEmail(email: string, fullName: string) {
        try {
            await this.mailerService.sendMail({
                to: email,
                subject: 'Chào mừng bạn đến với hệ thống!',
                template: './welcome',
                context: {
                    name: fullName,
                },
            });
        } catch (error) {
            console.error('❌ Lỗi khi gửi email chào mừng:', error);
            // Không throw error vì đây không phải là critical
        }
    }
}
