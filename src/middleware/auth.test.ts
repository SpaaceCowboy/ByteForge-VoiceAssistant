import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import { signToken, verifyToken, requireRole } from './auth';
import type { AuthenticatedRequest } from './auth';

// ==========================================
// signToken / verifyToken
// ==========================================

describe('signToken / verifyToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-vitest';
  });

  it('produces a token that can be verified', () => {
    const token = signToken(1, 'test@example.com', 'moderator');
    const payload = verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(1);
    expect(payload!.email).toBe('test@example.com');
    expect(payload!.role).toBe('moderator');
  });

  it('includes iat and exp in the payload', () => {
    const token = signToken(42, 'user@test.com', 'user');
    const payload = verifyToken(token);

    expect(payload!.iat).toBeDefined();
    expect(payload!.exp).toBeDefined();
    expect(payload!.exp!).toBeGreaterThan(payload!.iat!);
  });

  it('returns null for an invalid token', () => {
    expect(verifyToken('not-a-valid-token')).toBeNull();
  });

  it('returns null for a tampered token', () => {
    const token = signToken(1, 'test@example.com', 'user');
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyToken(tampered)).toBeNull();
  });

  it('returns null for a token signed with a different secret', () => {
    const token = signToken(1, 'test@example.com', 'user');
    process.env.JWT_SECRET = 'different-secret';
    expect(verifyToken(token)).toBeNull();
  });

  it('throws when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => signToken(1, 'test@example.com', 'user')).toThrow(
      'JWT_SECRET'
    );
  });
});

// ==========================================
// requireRole
// ==========================================

describe('requireRole', () => {
  const mockRes = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  const mockNext: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when user has required role', () => {
    const middleware = requireRole('moderator');
    const req = { user: { id: 1, email: 'a@b.com', fullName: 'Test', role: 'moderator' } } as AuthenticatedRequest;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when user has one of multiple allowed roles', () => {
    const middleware = requireRole('user', 'moderator');
    const req = { user: { id: 1, email: 'a@b.com', fullName: 'Test', role: 'user' } } as AuthenticatedRequest;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('returns 403 when user lacks the required role', () => {
    const middleware = requireRole('moderator');
    const req = {
      user: { id: 1, email: 'a@b.com', fullName: 'Test', role: 'user' },
      path: '/test',
    } as AuthenticatedRequest;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Insufficient permissions' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is undefined', () => {
    const middleware = requireRole('moderator');
    const req = {} as AuthenticatedRequest;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
