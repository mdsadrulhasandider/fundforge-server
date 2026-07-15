import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User';
import { CreditTransaction } from '../models/CreditTransaction';
import { verifyJWT, AuthRequest } from '../middleware/auth';

const router = Router();

// Validation Schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  photo: z.string().optional().default(''),
  role: z.enum(['Supporter', 'Creator', 'Admin']).default('Supporter')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
};

// @route   POST /auth/register
// @desc    Register user and set HTTP-only cookies
router.post('/register', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const validatedData = registerSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: validatedData.email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(validatedData.password, salt);

    // Initial credits
    let initialCredits = 50; // Supporter default
    if (validatedData.role === 'Creator') {
      initialCredits = 20; // Creator default
    } else if (validatedData.role === 'Admin') {
      initialCredits = 999999999; // Unlimited for Admin
    }

    const newUser = new User({
      name: validatedData.name,
      email: validatedData.email,
      password: hashedPassword,
      photo: validatedData.photo,
      role: validatedData.role,
      credits: initialCredits,
      raisedCredits: 0,
      status: 'active'
    });

    await newUser.save();

    // Log Credit Transaction
    const bonusTransaction = new CreditTransaction({
      userId: newUser._id,
      userEmail: newUser.email,
      type: 'bonus',
      amount: initialCredits,
      balanceBefore: 0,
      balanceAfter: initialCredits,
      description: 'Registration welcome bonus credits'
    });
    await bonusTransaction.save();

    // Create tokens
    const accessToken = jwt.sign(
      { id: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_ACCESS_SECRET || 'access_secret',
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_REFRESH_SECRET || 'refresh_secret',
      { expiresIn: '7d' }
    );

    // Set Cookies
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(201).json({
      message: 'Registration successful',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        photo: newUser.photo,
        role: newUser.role,
        credits: newUser.credits,
        raisedCredits: newUser.raisedCredits,
        status: newUser.status
      }
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST /auth/login
// @desc    Authenticate user and set HTTP-only cookies
router.post('/login', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const validatedData = loginSchema.parse(req.body);

    const user = await User.findOne({ email: validatedData.email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Your account is suspended. Contact admin.' });
    }

    // Check password
    if (!user.password) {
      return res.status(400).json({ message: 'This account uses Google Login' });
    }
    
    const isMatch = await bcrypt.compare(validatedData.password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create tokens
    const accessToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_ACCESS_SECRET || 'access_secret',
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_REFRESH_SECRET || 'refresh_secret',
      { expiresIn: '7d' }
    );

    // Set Cookies
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: user.role,
        credits: user.credits,
        raisedCredits: user.raisedCredits,
        status: user.status
      }
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   POST /auth/google-login
// @desc    OAuth/Google sign-in option (handles user creation if not exists)
router.post('/google-login', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { name, email, photo, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: 'Name and email are required for Google Login' });
    }

    let user = await User.findOne({ email });

    if (!user) {
      // User doesn't exist, create one
      const selectedRole = role || 'Supporter';
      let initialCredits = selectedRole === 'Creator' ? 20 : selectedRole === 'Admin' ? 999999999 : 50;

      user = new User({
        name,
        email,
        photo: photo || '',
        role: selectedRole,
        credits: initialCredits,
        raisedCredits: 0,
        status: 'active'
      });
      await user.save();

      // Log Credit Transaction
      const bonusTransaction = new CreditTransaction({
        userId: user._id,
        userEmail: user.email,
        type: 'bonus',
        amount: initialCredits,
        balanceBefore: 0,
        balanceAfter: initialCredits,
        description: 'Google Registration welcome bonus credits'
      });
      await bonusTransaction.save();
    } else {
      if (user.status === 'suspended') {
        return res.status(403).json({ message: 'Your account is suspended. Contact admin.' });
      }
      // Update photo if empty
      if (!user.photo && photo) {
        user.photo = photo;
        await user.save();
      }
    }

    // Create tokens
    const accessToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_ACCESS_SECRET || 'access_secret',
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_REFRESH_SECRET || 'refresh_secret',
      { expiresIn: '7d' }
    );

    // Set Cookies
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.json({
      message: 'Google login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: user.role,
        credits: user.credits,
        raisedCredits: user.raisedCredits,
        status: user.status
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({ message: 'Server error during Google login' });
  }
});

// @route   POST /auth/logout
// @desc    Logout user and clear cookies
router.post('/logout', (req: AuthRequest, res: Response) => {
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
  return res.json({ message: 'Logout successful' });
});

// @route   GET /auth/me
// @desc    Get current user details (session restore)
router.get('/me', verifyJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.status === 'suspended') {
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
      return res.status(403).json({ message: 'Your account is suspended.' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('Auth me error:', error);
    return res.status(500).json({ message: 'Server error restoring session' });
  }
});

// @route   PUT /auth/profile
// @desc    Update user profile name & photo URL
router.put('/profile', verifyJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const { name, photo } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (photo !== undefined) user.photo = photo;

    await user.save();
    return res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: user.role,
        credits: user.credits,
        raisedCredits: user.raisedCredits,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ message: 'Server error updating profile' });
  }
});

export default router;
