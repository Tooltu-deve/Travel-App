import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/user/dto/create-user.dto';

@Injectable()
export class AuthService {
    constructor(
        private userService: UserService,
        private jwtService: JwtService,
    ) { }

    /**
     * Kiểm tra email và password có khớp không.
     * Dùng bởi LocalStrategy.
     */
    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.userService.findOneByEmail(email);
        if (user && (await bcrypt.compare(pass, user.password))) {
            // Trả về user object (trừ password)
            if (typeof (user as any).toObject === 'function') {
                const { password, ...result } = (user as any).toObject();
                return result;
            } else {
                const { password, ...result } = user as any;
                return result;
            }
        }
        return null;
    }

    
    // Tạo JWT token khi user đăng nhập thành công.

    async login(user: any) {
        const payload = { email: user.email, sub: user._id };
        return {
            access_token: this.jwtService.sign(payload),
            user: user,
        };
    }

    
    // Xử lý đăng ký user mới.
    async register(createUserDto: CreateUserDto) {
        try {
            // Logic kiểm tra email tồn tại
            const existingUser = await this.userService.findOneByEmail(
                createUserDto.email,
            );
            if (existingUser) {
                throw new UnauthorizedException('Email đã tồn tại');
            }

            const user = await this.userService.create(createUserDto);
            // Trả về token luôn sau khi đăng ký thành công
            return this.login(user);
        } catch (error) {
            throw new UnauthorizedException(error.message);
        }
    }
}
