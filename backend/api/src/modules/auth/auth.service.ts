// =============================================================================
// MediCore API - Auth Service
// =============================================================================

import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/database';
import { config } from '../../config/environment';
import { UnauthorizedError, ConflictError, NotFoundError, ValidationError, ForbiddenError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { JwtPayload } from '../../middleware/auth';
import type { LoginInput, RegisterInput, RefreshTokenInput } from './auth.schemas';

export class AuthService {
  /**
   * Register a new user. Unauthenticated self-registration is strictly restricted
   * to PATIENT accounts; staff roles require HOSPITAL_ADMIN authorization.
   */
  async register(input: RegisterInput, actorRoles?: string[]) {
    const requestedRole = input.role || 'PATIENT';
    if (requestedRole !== 'PATIENT' && !actorRoles?.includes('HOSPITAL_ADMIN')) {
      throw new ForbiddenError(
        'Self-registration is restricted to PATIENT accounts. Administrator authorization is required for staff roles.'
      );
    }

    // Check for existing user
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Find or create role
    const roleName = requestedRole;
    let role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      role = await prisma.role.create({
        data: { name: roleName, description: `${roleName} role`, isSystem: true },
      });
    }

    // Create user, role, and optional self-registered patient profile in a transaction
    const { user, patientId } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        },
      });

      await tx.userRole.create({
        data: {
          userId: newUser.id,
          roleId: role!.id,
        },
      });

      let createdPatientId: string | null = null;
      if (roleName === 'PATIENT' && input.dateOfBirth && input.gender) {
        const latestPatient = await tx.patient.findFirst({
          where: { registrationNumber: { startsWith: 'MED-' } },
          orderBy: { registrationNumber: 'desc' },
          select: { registrationNumber: true },
        });
        let nextNum = 1;
        if (latestPatient?.registrationNumber) {
          const parsedNum = parseInt(latestPatient.registrationNumber.replace('MED-', ''), 10);
          if (!Number.isNaN(parsedNum)) nextNum = parsedNum + 1;
        }
        const registrationNumber = `MED-${String(nextNum).padStart(6, '0')}`;
        const patient = await tx.patient.create({
          data: {
            userId: newUser.id,
            registrationNumber,
            dateOfBirth: new Date(input.dateOfBirth),
            gender: input.gender,
          },
        });
        createdPatientId = patient.id;
      }

      return { user: newUser, patientId: createdPatientId };
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, [roleName]);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: [roleName],
        patientId,
        staffId: null,
      },
      ...tokens,
    };
  }

  /**
   * Login with email and password
   */
  async login(input: LoginInput, userAgent?: string, ipAddress?: string) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        userRoles: {
          include: { role: true },
        },
        patient: { select: { id: true } },
        staff: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      // Log failed attempt
      await this.logLoginAttempt(null, input.email, false, ipAddress, userAgent);
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isValid = await argon2.verify(user.passwordHash, input.password);
    if (!isValid) {
      await this.logLoginAttempt(user.id, input.email, false, ipAddress, userAgent);
      throw new UnauthorizedError('Invalid email or password');
    }

    const roles = user.userRoles.map(ur => ur.role.name);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, roles, userAgent, ipAddress);

    // Log successful login
    await this.logLoginAttempt(user.id, input.email, true, ipAddress, userAgent);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        patientId: user.patient?.id ?? null,
        staffId: user.staff?.id ?? null,
      },
      ...tokens,
    };
  }

  /**
   * Refresh access token using refresh token rotation
   */
  async refreshToken(input: RefreshTokenInput) {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: input.refreshToken },
      include: { user: { include: { userRoles: { include: { role: true } } } } },
    });

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check if token was revoked (possible token theft)
    if (storedToken.revokedAt) {
      // Revoke all tokens in this family (potential breach)
      await prisma.refreshToken.updateMany({
        where: { family: storedToken.family, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: 'SECURITY_REVOCATION' },
      });
      logger.warn({ userId: storedToken.userId, family: storedToken.family }, 'Refresh token reuse detected - all family tokens revoked');
      throw new UnauthorizedError('Refresh token has been revoked. Please login again.');
    }

    // Check expiration
    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Check user is still active
    if (!storedToken.user.isActive) {
      throw new UnauthorizedError('User account is deactivated');
    }

    const roles = storedToken.user.userRoles.map(ur => ur.role.name);

    // Rotate: revoke old token and create new one
    const tokens = await prisma.$transaction(async (tx) => {
      // Revoke old refresh token
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date(), revokedBy: 'TOKEN_ROTATION' },
      });

      // Generate new tokens
      return this.generateTokens(
        storedToken.userId,
        storedToken.user.email,
        roles,
        storedToken.userAgent || undefined,
        storedToken.ipAddress || undefined,
        storedToken.family
      );
    });

    return {
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        firstName: storedToken.user.firstName,
        lastName: storedToken.user.lastName,
        roles,
      },
      ...tokens,
    };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (storedToken && !storedToken.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date(), revokedBy: 'USER_LOGOUT' },
      });
    }
  }

  /**
   * Change password for authenticated user and revoke existing refresh tokens
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const isValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!isValid) throw new ValidationError('Current password is incorrect');

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: 'PASSWORD_CHANGE' },
      });
    });
  }

  /**
   * Generate JWT access and refresh tokens
   */
  private async generateTokens(
    userId: string,
    email: string,
    roles: string[],
    userAgent?: string,
    ipAddress?: string,
    family?: string
  ) {
    const tokenFamily = family || uuidv4();

    const payload: JwtPayload = { userId, email, roles };

    const accessToken = jwt.sign(payload, config.jwtAccessSecret, {
      expiresIn: config.jwtAccessExpiry as any,
    });

    const refreshTokenValue = uuidv4() + '.' + uuidv4();
    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7); // 7 days

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        userId,
        token: refreshTokenValue,
        family: tokenFamily,
        expiresAt: refreshExpiry,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: config.jwtAccessExpiry,
    };
  }

  /**
   * Log login attempts for audit
   */
  private async logLoginAttempt(
    userId: string | null,
    email: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string
  ) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
          resourceType: 'AUTH',
          resourceId: email,
          outcome: success ? 'SUCCESS' : 'FAILURE',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
          metadata: { email },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log login attempt');
    }
  }
}

export const authService = new AuthService();
