import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Withdrawal } from '../models/Withdrawal';
import { User } from '../models/User';
import { CreditTransaction } from '../models/CreditTransaction';
import { Notification } from '../models/Notification';
import { verifyJWT, verifyCreator, verifyAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// Zod validation for withdrawal request
const withdrawalRequestSchema = z.object({
  withdrawCredits: z.number().min(200, 'Minimum withdrawal is 200 credits ($10)'),
  paymentSystem: z.enum(['Stripe', 'Bkash', 'Rocket', 'Nagad']),
  accountNumber: z.string().min(5, 'Account number must be valid')
});

// @route   POST /withdrawals
// @desc    Request a withdrawal (Creator only, validates available raisedCredits)
router.post('/', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const validatedData = withdrawalRequestSchema.parse(req.body);

    const creator = await User.findById(req.user.id);
    if (!creator) return res.status(404).json({ message: 'Creator not found' });

    // Check if enough raisedCredits
    if (creator.raisedCredits < validatedData.withdrawCredits) {
      return res.status(400).json({ message: 'Insufficient raised credits. Cannot exceed total raised credits.' });
    }

    // Double spending protection: check existing pending withdrawals
    const pendingWithdrawals = await Withdrawal.find({
      creatorId: creator._id,
      status: 'pending'
    });
    
    const totalPendingCredits = pendingWithdrawals.reduce((sum, w) => sum + w.withdrawCredits, 0);

    if (creator.raisedCredits < (totalPendingCredits + validatedData.withdrawCredits)) {
      return res.status(400).json({
        message: 'Insufficient raised credits. You have other pending withdrawal requests.'
      });
    }

    // Business Logic: 20 credits = $1
    const withdrawAmount = validatedData.withdrawCredits / 20;

    const newWithdrawal = new Withdrawal({
      creatorId: creator._id,
      creatorEmail: creator.email,
      creatorName: creator.name,
      withdrawCredits: validatedData.withdrawCredits,
      withdrawAmount,
      paymentSystem: validatedData.paymentSystem,
      accountNumber: validatedData.accountNumber,
      status: 'pending'
    });

    await newWithdrawal.save();

    // Notify Admin (optional, but good practice. We can add notification to all admins or keep notification query based)
    // We can notify Creator that their request was submitted
    const newNotification = new Notification({
      message: `Your withdrawal request of ${validatedData.withdrawCredits} credits ($${withdrawAmount}) was submitted and is pending admin approval.`,
      toEmail: creator.email,
      type: 'info',
      actionRoute: `/dashboard/creator-withdrawals`
    });
    await newNotification.save();

    return res.status(201).json({
      message: 'Withdrawal request submitted successfully.',
      withdrawal: newWithdrawal
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Withdrawal request error:', error);
    return res.status(500).json({ message: 'Server error processing withdrawal request' });
  }
});

// @route   GET /withdrawals/my
// @desc    Get all withdrawal history of logged-in Creator
router.get('/my', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const withdrawals = await Withdrawal.find({ creatorId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ withdrawals });
  } catch (error) {
    console.error('Fetch my withdrawals error:', error);
    return res.status(500).json({ message: 'Server error fetching withdrawals history' });
  }
});

// @route   GET /withdrawals/pending
// @desc    Get all pending withdrawal requests (Admin only)
router.get('/pending', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' }).sort({ createdAt: -1 });
    return res.json({ withdrawals });
  } catch (error) {
    console.error('Fetch pending withdrawals error:', error);
    return res.status(500).json({ message: 'Server error fetching pending withdrawals' });
  }
});

// @route   GET /withdrawals/all
// @desc    Get all withdrawal requests (Admin only)
router.get('/all', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const withdrawals = await Withdrawal.find().sort({ createdAt: -1 });
    return res.json({ withdrawals });
  } catch (error) {
    console.error('Fetch all withdrawals error:', error);
    return res.status(500).json({ message: 'Server error fetching withdrawals list' });
  }
});

// @route   PUT /withdrawals/:id/approve
// @desc    Approve withdrawal request (Admin only, deducts raisedCredits from Creator)
router.put('/:id/approve', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal request not found' });

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: `Withdrawal request is already ${withdrawal.status}` });
    }

    const creator = await User.findById(withdrawal.creatorId);
    if (!creator) return res.status(404).json({ message: 'Creator not found' });

    if (creator.raisedCredits < withdrawal.withdrawCredits) {
      return res.status(400).json({ message: 'Creator has insufficient credits to complete this withdrawal.' });
    }

    // Deduct credits from Creator
    const balanceBefore = creator.raisedCredits;
    creator.raisedCredits -= withdrawal.withdrawCredits;
    await creator.save();

    // Log Credit Transaction for Creator
    const auditTransaction = new CreditTransaction({
      userId: creator._id,
      userEmail: creator.email,
      type: 'withdrawal',
      amount: withdrawal.withdrawCredits,
      balanceBefore,
      balanceAfter: creator.raisedCredits,
      referenceId: withdrawal._id.toString(),
      description: `Withdrawal payout via ${withdrawal.paymentSystem}`
    });
    await auditTransaction.save();

    // Approve withdrawal
    withdrawal.status = 'approved';
    await withdrawal.save();

    // Notify Creator
    const successNotification = new Notification({
      message: `Your withdrawal of ${withdrawal.withdrawCredits} credits ($${withdrawal.withdrawAmount}) via ${withdrawal.paymentSystem} was approved and processed successfully.`,
      toEmail: withdrawal.creatorEmail,
      type: 'success',
      actionRoute: `/dashboard/creator-withdrawals`,
      fromUser: req.user?.id ? new Types.ObjectId(req.user.id) : undefined,
      entityType: 'withdrawal',
      entityId: withdrawal._id.toString()
    });
    await successNotification.save();

    return res.json({ message: 'Withdrawal request approved successfully', withdrawal });

  } catch (error) {
    console.error('Approve withdrawal error:', error);
    return res.status(500).json({ message: 'Server error approving withdrawal' });
  }
});

export default router;
