import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: 'Supporter' | 'Creator' | 'Admin';
    }
  }
}

export interface AuthRequest extends Request {}

export const verifyJWT = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  // Support both HttpOnly cookies and authorization headers for compatibility
  let accessToken = req.cookies.accessToken;
  const refreshToken = req.cookies.refreshToken;

  if (!accessToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts[0] === 'Bearer' && parts[1]) {
      accessToken = parts[1];
    }
  }

  if (!accessToken) {
    if (refreshToken) {
      return handleRefresh(req, res, next, refreshToken);
    }
    return res.status(401).json({ message: 'Authentication required. No session found.' });
  }

  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET || 'access_secret') as {
      id: string;
      email: string;
      role: 'Supporter' | 'Creator' | 'Admin';
    };
    req.user = decoded;
    return next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError' && refreshToken) {
      return handleRefresh(req, res, next, refreshToken);
    }
    return res.status(401).json({ message: 'Invalid or expired access token.' });
  }
};

const handleRefresh = async (req: AuthRequest, res: Response, next: NextFunction, token: string): Promise<any> => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'refresh_secret') as {
      id: string;
      email: string;
      role: 'Supporter' | 'Creator' | 'Admin';
    };

    const user = await User.findById(decoded.id);
    if (!user || user.status === 'suspended') {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.status(403).json({ message: 'User session invalid or suspended.' });
    }

    const newAccessToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_ACCESS_SECRET || 'access_secret',
      { expiresIn: '15m' }
    );

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    req.user = { id: user._id.toString(), email: user.email, role: user.role };
    return next();
  } catch (err) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
};

export const verifyRole = (roles: Array<'Supporter' | 'Creator' | 'Admin'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction): any => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

export const verifySupporter = verifyRole(['Supporter']);
export const verifyCreator = verifyRole(['Creator']);
export const verifyAdmin = verifyRole(['Admin']);
export const verifyCreatorOrAdmin = verifyRole(['Creator', 'Admin']);
