import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'default_secret',
        });
    }

    // Passport tự động verify token.
    // Hàm này chỉ được gọi khi token đã hợp lệ.
    // Payload trả về sẽ được gắn vào req.user
    async validate(payload: any) {
        return { userId: payload.sub, email: payload.email };
    }
}
