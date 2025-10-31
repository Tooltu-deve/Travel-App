import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
    constructor(private userService: UserService) { }

    // Route này được bảo vệ, chỉ user đã login mới xem được
    // get user/profile lấy thông tin cá nhân
    @UseGuards(JwtAuthGuard)
    @Get('profile')
    async getProfile(@Request() req) {
        // req.user chứa payload từ JWT là một object { userId: '...', email: '...' }
        const user = await this.userService.findOneById(req.user.userId);
        if (!user) return null;
        
        // Loại bỏ trường password khi trả về
        const { password, ...userWithoutPassword } = user as any;
        return userWithoutPassword;
    }
}
