import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard này sẽ kích hoạt JwtStrategy
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
