import { IsNotEmpty, IsString, MinLength } from 'class-validator';

// DTO dùng để validate data xóa account
// ⚠️ CHƯA IMPLEMENT - cần thêm logic soft/hard delete + GDPR compliance
export class DeleteAccountDto {
  // Password để verify identity trước khi xóa account
  @IsString()
  @IsNotEmpty({ message: 'Password không được để trống' })
  @MinLength(6, { message: 'Password phải có ít nhất 6 ký tự' })
  password: string;

  // Confirmation string - user phải nhập "DELETE" để confirm
  @IsString()
  @IsNotEmpty({ message: 'Cần xác nhận bằng cách nhập "DELETE"' })
  confirmation: string;
}

/**
 * =============================================================================
 * IMPLEMENTATION GUIDE (để implement sau)
 * =============================================================================
 * 
 * 1. SERVICE METHOD:
 * ```typescript
 * async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
 *   // 1. Get user
 *   const user = await this.userService.findOneById(userId);
 *   if (!user) throw new NotFoundException('User không tồn tại');
 *   
 *   // 2. Verify password (if user has password)
 *   if (user.password) {
 *     const valid = await bcrypt.compare(dto.password, user.password);
 *     if (!valid) {
 *       throw new UnauthorizedException('Password không đúng');
 *     }
 *   } else {
 *     // OAuth user - có thể require re-authentication
 *     // hoặc allow deletion without password
 *   }
 *   
 *   // 3. Verify confirmation string
 *   if (dto.confirmation !== 'DELETE') {
 *     throw new BadRequestException(
 *       'Cần xác nhận bằng cách nhập chính xác "DELETE"'
 *     );
 *   }
 *   
 *   // 4. Log deletion event (audit trail)
 *   await this.auditLogService.log({
 *     userId,
 *     action: 'ACCOUNT_DELETION',
 *     timestamp: new Date(),
 *     metadata: { email: user.email }
 *   });
 *   
 *   // 5. Backup user data (cho recovery nếu cần)
 *   await this.backupService.backupUser(user);
 *   
 *   // 6. Soft delete user (recommended)
 *   await this.userService.update(userId, {
 *     deletedAt: new Date(),
 *     // Optionally anonymize immediately
 *     email: `deleted_${userId}_${Date.now()}@example.com`,
 *     fullName: 'Deleted User',
 *     avatar: null
 *   });
 *   
 *   // 7. Delete/Anonymize related data
 *   await this.cleanupUserData(userId);
 *   
 *   // 8. Invalidate all tokens (optional)
 *   await this.tokenBlacklistService.blacklistAllUserTokens(userId);
 *   
 *   // 9. Send confirmation email
 *   await this.emailService.sendAccountDeletionConfirmation({
 *     to: user.email,
 *     userName: user.fullName,
 *     gracePeriodDays: 30
 *   });
 * }
 * 
 * async cleanupUserData(userId: string): Promise<void> {
 *   // Delete hoặc anonymize related data
 *   
 *   // Option 1: Delete all related data
 *   await this.itineraryModel.deleteMany({ userId });
 *   await this.bookingModel.deleteMany({ userId });
 *   await this.reviewModel.deleteMany({ userId });
 *   
 *   // Option 2: Anonymize (keep data but remove user reference)
 *   await this.itineraryModel.updateMany(
 *     { userId },
 *     { userId: null, userDeleted: true }
 *   );
 * }
 * 
 * async restoreAccount(userId: string): Promise<void> {
 *   // Implement restore logic (if soft delete)
 *   const user = await this.userService.findOneById(userId);
 *   
 *   if (!user.deletedAt) {
 *     throw new BadRequestException('Account chưa bị xóa');
 *   }
 *   
 *   const gracePeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
 *   const deletedTime = user.deletedAt.getTime();
 *   const now = Date.now();
 *   
 *   if (now - deletedTime > gracePeriod) {
 *     throw new BadRequestException('Grace period đã hết');
 *   }
 *   
 *   await this.userService.update(userId, { deletedAt: null });
 * }
 * ```
 * 
 * 2. CONTROLLER ROUTE:
 * ```typescript
 * @Delete()
 * @UseGuards(JwtAuthGuard)
 * @HttpCode(HttpStatus.OK)
 * @Throttle(3, 3600) // Max 3 attempts per hour
 * async deleteAccount(@Request() req, @Body() dto: DeleteAccountDto) {
 *   await this.profileService.deleteAccount(req.user.userId, dto);
 *   
 *   return {
 *     message: 'Tài khoản đã được xóa thành công',
 *     restorable: true,
 *     gracePeriodDays: 30,
 *     restoreUrl: 'https://app.example.com/restore-account'
 *   };
 * }
 * 
 * @Post('restore')
 * @UseGuards(JwtAuthGuard) // Sẽ fail nếu user đã bị delete
 * async restoreAccount(@Request() req) {
 *   // Có thể cần token đặc biệt trong email thay vì JWT
 *   await this.profileService.restoreAccount(req.user.userId);
 *   return { message: 'Tài khoản đã được khôi phục' };
 * }
 * ```
 * 
 * 3. EMAIL TEMPLATE:
 * Subject: Xác nhận xóa tài khoản
 * Body:
 * ```
 * Xin chào {userName},
 * 
 * Tài khoản của bạn đã được xóa theo yêu cầu.
 * 
 * - Email: {email}
 * - Thời gian xóa: {deletionTime}
 * 
 * KHÔI PHỤC TÀI KHOẢN:
 * Bạn có 30 ngày để khôi phục tài khoản.
 * Sau thời gian này, data sẽ bị xóa vĩnh viễn.
 * 
 * Click vào link dưới để khôi phục:
 * {restoreLink}
 * 
 * Nếu bạn không yêu cầu xóa tài khoản, vui lòng liên hệ support ngay.
 * ```
 * 
 * 4. DATABASE SCHEMA UPDATES:
 * ```typescript
 * // User schema - thêm fields
 * @Prop({ type: Date, default: null })
 * deletedAt?: Date | null;
 * 
 * @Prop({ type: String })
 * deletionReason?: string; // Optional: lưu lý do xóa
 * ```
 * 
 * =============================================================================
 * DESIGN DECISIONS & TRADE-OFFS
 * =============================================================================
 * 
 * 1. TẠI SAO CẦN CONFIRMATION STRING "DELETE"?
 *    - Prevent accidental deletions
 *    - Make user aware về gravity of action
 *    - Industry standard (GitHub, AWS sử dụng pattern này)
 *    - UX trade-off: friction vs safety (safety wins)
 * 
 * 2. SOFT DELETE VS HARD DELETE?
 *    - Soft delete (recommended):
 *      + Có thể restore nếu mistake
 *      + Comply với legal requirements
 *      + Easier to implement rollback
 *      - Complicate queries (phải filter deletedAt)
 *    - Hard delete:
 *      + Clean database
 *      + True GDPR compliance
 *      - Không thể restore
 *      - Risk nếu accidental
 *    - Recommend: Soft delete + grace period + hard delete sau 30 days
 * 
 * 3. ANONYMIZE VS DELETE DATA?
 *    - Anonymize:
 *      + Keep data cho analytics
 *      + Maintain referential integrity
 *      + GDPR compliant (data không identifiable)
 *      - Complex implementation
 *    - Delete:
 *      + Simple và rõ ràng
 *      + True data removal
 *      - Lose analytics data
 *      - Cascade delete phức tạp
 *    - Recommend: Hybrid (anonymize some, delete some)
 * 
 * 4. GRACE PERIOD BAO LÂU?
 *    - 7 days: ngắn, ít risk
 *    - 30 days: industry standard, balanced
 *    - 90 days: long, nhiều storage cost
 *    - Recommend: 30 days
 * 
 * 5. XỬ LÝ OAUTH USERS?
 *    - Không có password để verify
 *    - Options:
 *      a) Skip password check (less secure)
 *      b) Yêu cầu re-auth với OAuth
 *      c) Yêu cầu set password trước
 *    - Recommend: (b) most secure, best UX
 * 
 * =============================================================================
 * DATA CLEANUP CHECKLIST
 * =============================================================================
 * 
 * Khi xóa account, cần xử lý các collections liên quan:
 * 
 * ✅ User profile data:
 *    - email, fullName, avatar, password → anonymize hoặc delete
 * 
 * ⚠️  Itineraries:
 *    - Option 1: Delete all itineraries
 *    - Option 2: Keep but anonymize userId
 *    - Recommend: Delete (personal travel plans)
 * 
 * ⚠️  Bookings:
 *    - Phải keep cho financial records (legal requirement)
 *    - Anonymize: userId → null, userName → "Deleted User"
 * 
 * ⚠️  Reviews:
 *    - Option 1: Delete all reviews
 *    - Option 2: Keep but mark as "Deleted User"
 *    - Recommend: Option 2 (valuable data cho community)
 * 
 * ⚠️  Sessions/Tokens:
 *    - Invalidate tất cả JWT tokens
 *    - Clear refresh tokens
 *    - Blacklist tokens (nếu dùng Redis)
 * 
 * ⚠️  Analytics events:
 *    - Anonymize userId trong logs
 *    - Keep aggregate data
 * 
 * ⚠️  File uploads:
 *    - Delete avatar từ cloud storage
 *    - Delete uploaded documents
 * 
 * =============================================================================
 */
