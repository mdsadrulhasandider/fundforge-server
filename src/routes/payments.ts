import { Router, Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import { CreditTransaction } from '../models/CreditTransaction';
import { Notification } from '../models/Notification';
import { verifyJWT, verifySupporter, verifyAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// Initialize Stripe if key is available
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
let stripe: Stripe | null = null;
if (stripeSecret) {
  stripe = new Stripe(stripeSecret, {
    apiVersion: '2024-04-10' as any
  });
}

// Packages definition
const PACKAGES = [
  { id: '100-credits', name: '100 Credits Starter', credits: 100, price: 10 },
  { id: '300-credits', name: '300 Credits Silver', credits: 300, price: 25 },
  { id: '800-credits', name: '800 Credits Gold', credits: 800, price: 60 },
  { id: '1500-credits', name: '1500 Credits Platinum', credits: 1500, price: 110 }
];

// Zod validation schemas
const createIntentSchema = z.object({
  packageId: z.enum(['100-credits', '300-credits', '800-credits', '1500-credits'])
});

const confirmPaymentSchema = z.object({
  packageName: z.string().min(1),
  credits: z.number().min(1),
  amount: z.number().min(1),
  transactionId: z.string().min(1),
  paymentMethod: z.string().min(1)
});

// @route   POST /payments/create-intent
// @desc    Create Stripe Payment Intent (Supporter only)
router.post('/create-intent', verifyJWT, verifySupporter, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const validatedData = createIntentSchema.parse(req.body);
    const selectedPackage = PACKAGES.find((p) => p.id === validatedData.packageId);

    if (!selectedPackage) {
      return res.status(400).json({ message: 'Invalid package selected' });
    }

    if (!stripe) {
      return res.status(503).json({
        message: 'Stripe is not configured on the server. Please use Dummy payment mode.',
        fallback: true
      });
    }

    // Stripe amount in cents
    const amountInCents = selectedPackage.price * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        userId: req.user?.id || '',
        email: req.user?.email || '',
        credits: selectedPackage.credits.toString(),
        packageName: selectedPackage.name
      }
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      packageName: selectedPackage.name,
      amount: selectedPackage.price,
      credits: selectedPackage.credits
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create payment intent error:', error);
    return res.status(500).json({ message: 'Stripe service unavailable or payment error' });
  }
});

// @route   POST /payments/confirm
// @desc    Confirm credit package purchase (Stripe success or Dummy mode)
router.post('/confirm', verifyJWT, verifySupporter, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const validatedData = confirmPaymentSchema.parse(req.body);

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Deduplicate transaction to avoid double spending
    const existingPayment = await Payment.findOne({ transactionId: validatedData.transactionId });
    if (existingPayment) {
      return res.status(400).json({ message: 'This transaction has already been processed' });
    }

    // Add credits to supporter
    const balanceBefore = user.credits;
    user.credits += validatedData.credits;
    await user.save();

    // Create payment entry
    const newPayment = new Payment({
      userId: user._id,
      userEmail: user.email,
      packageName: validatedData.packageName,
      credits: validatedData.credits,
      amount: validatedData.amount,
      transactionId: validatedData.transactionId,
      paymentMethod: validatedData.paymentMethod,
      status: 'succeeded'
    });

    await newPayment.save();

    // Log Credit Transaction
    const auditTransaction = new CreditTransaction({
      userId: user._id,
      userEmail: user.email,
      type: 'purchase',
      amount: validatedData.credits,
      balanceBefore,
      balanceAfter: user.credits,
      referenceId: newPayment._id.toString(),
      description: `Purchased ${validatedData.packageName} package`
    });
    await auditTransaction.save();

    // Notify Supporter
    const purchaseNotification = new Notification({
      message: `You successfully purchased ${validatedData.credits} credits for $${validatedData.amount}. Transaction ID: ${validatedData.transactionId}`,
      toEmail: user.email,
      type: 'success',
      actionRoute: `/dashboard/supporter-history`
    });
    await purchaseNotification.save();

    return res.status(201).json({
      message: 'Payment confirmed and credits added successfully.',
      payment: newPayment,
      availableCredits: user.credits
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Confirm payment error:', error);
    return res.status(500).json({ message: 'Server error processing payment confirmation' });
  }
});

// @route   GET /payments/my
// @desc    Get user's personal payment history
router.get('/my', verifyJWT, verifySupporter, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ payments });
  } catch (error) {
    console.error('Fetch my payments error:', error);
    return res.status(500).json({ message: 'Server error fetching payment history' });
  }
});

// @route   GET /payments/all
// @desc    Get all processed payments (Admin only)
router.get('/all', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 });
    return res.json({ payments });
  } catch (error) {
    console.error('Fetch all payments error:', error);
    return res.status(500).json({ message: 'Server error fetching payment history list' });
  }
});

// @route   GET /payments/transactions
// @desc    Get logged-in user's credit transactions (audit logs)
router.get('/transactions', verifyJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const transactions = await CreditTransaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ transactions });
  } catch (error) {
    console.error('Fetch transactions error:', error);
    return res.status(500).json({ message: 'Server error retrieving transaction logs' });
  }
});

export default router;
