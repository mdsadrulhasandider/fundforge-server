import { Router, Response } from 'express';
import { z } from 'zod';
import { Contribution } from '../models/Contribution';
import { Campaign } from '../models/Campaign';
import { User } from '../models/User';
import { CreditTransaction } from '../models/CreditTransaction';
import { Notification } from '../models/Notification';
import { verifyJWT, verifySupporter, verifyCreator, AuthRequest } from '../middleware/auth';

const router = Router();

// Zod validation for contribution
const contributionSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required'),
  contributionAmount: z.number().min(1, 'Amount must be at least 1 credit')
});

// @route   POST /contributions
// @desc    Submit a contribution (Supporter only, immediately deducts credits)
router.post('/', verifyJWT, verifySupporter, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const validatedData = contributionSchema.parse(req.body);

    const campaign = await Campaign.findById(validatedData.campaignId);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    if (campaign.status !== 'approved') {
      return res.status(400).json({ message: 'Campaign is not open for contributions' });
    }

    if (new Date(campaign.deadline) < new Date()) {
      return res.status(400).json({ message: 'Campaign deadline has passed' });
    }

    if (validatedData.contributionAmount < campaign.minimumContribution) {
      return res.status(400).json({
        message: `Contribution must be at least the minimum amount of ${campaign.minimumContribution} credits`
      });
    }

    const supporter = await User.findById(req.user.id);
    if (!supporter) return res.status(404).json({ message: 'Supporter not found' });

    if (supporter.credits < validatedData.contributionAmount) {
      return res.status(400).json({ message: 'Insufficient credits balance. Please purchase credits.' });
    }

    // Deduct credits from supporter immediately (Double entry system)
    supporter.credits -= validatedData.contributionAmount;
    await supporter.save();

    const newContribution = new Contribution({
      campaignId: campaign._id,
      campaignTitle: campaign.title,
      contributionAmount: validatedData.contributionAmount,
      supporterId: supporter._id,
      supporterEmail: supporter.email,
      supporterName: supporter.name,
      creatorEmail: campaign.creatorEmail,
      creatorName: campaign.creatorName,
      status: 'pending'
    });

    await newContribution.save();

    // Log Credit Transaction for Supporter
    const auditTransaction = new CreditTransaction({
      userId: supporter._id,
      userEmail: supporter.email,
      type: 'contribution',
      amount: validatedData.contributionAmount,
      balanceBefore: supporter.credits + validatedData.contributionAmount,
      balanceAfter: supporter.credits,
      referenceId: newContribution._id.toString(),
      description: `Contributed to campaign: "${campaign.title}"`
    });
    await auditTransaction.save();

    // Notify Creator
    const newNotification = new Notification({
      message: `${supporter.name} contributed ${validatedData.contributionAmount} credits to your campaign "${campaign.title}".`,
      toEmail: campaign.creatorEmail,
      type: 'info',
      actionRoute: `/dashboard/creator-reviews`,
      fromUser: supporter._id,
      entityType: 'contribution',
      entityId: newContribution._id.toString()
    });
    await newNotification.save();

    return res.status(201).json({
      message: 'Contribution submitted and pending creator review.',
      contribution: newContribution,
      availableCredits: supporter.credits
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Submit contribution error:', error);
    return res.status(500).json({ message: 'Server error processing contribution' });
  }
});

// @route   GET /contributions/my
// @desc    Get all contributions made by logged-in supporter (with server-side pagination)
router.get('/my', verifyJWT, verifySupporter, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const contributions = await Contribution.find({ supporterId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Contribution.countDocuments({ supporterId: req.user.id });

    return res.json({
      contributions,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalContributions: total
    });
  } catch (error) {
    console.error('Fetch my contributions error:', error);
    return res.status(500).json({ message: 'Server error fetching contributions' });
  }
});

// @route   GET /contributions/reviews
// @desc    Get all pending contributions for Creator review (Creator only)
router.get('/reviews', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const contributions = await Contribution.find({
      creatorEmail: req.user.email,
      status: 'pending'
    }).sort({ createdAt: -1 });

    return res.json({ contributions });
  } catch (error) {
    console.error('Fetch contributions review error:', error);
    return res.status(500).json({ message: 'Server error fetching review list' });
  }
});

// @route   PUT /contributions/:id/approve
// @desc    Approve contribution (Creator only)
router.put('/:id/approve', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const contribution = await Contribution.findById(req.params.id);
    if (!contribution) return res.status(404).json({ message: 'Contribution not found' });

    if (contribution.creatorEmail !== req.user.email) {
      return res.status(403).json({ message: 'Forbidden. You do not own the campaign for this contribution.' });
    }

    if (contribution.status !== 'pending') {
      return res.status(400).json({ message: `Contribution is already ${contribution.status}` });
    }

    // Approve the contribution
    contribution.status = 'approved';
    await contribution.save();

    // Increment campaign amount raised and supporters count
    await Campaign.findByIdAndUpdate(contribution.campaignId, {
      $inc: { amountRaised: contribution.contributionAmount, supportersCount: 1 }
    });

    // Increment Creator's raisedCredits
    const creator = await User.findOneAndUpdate(
      { email: contribution.creatorEmail },
      { $inc: { raisedCredits: contribution.contributionAmount } },
      { new: true }
    );

    if (creator) {
      // Log Credit Transaction for Creator (earnings increase)
      const creatorAudit = new CreditTransaction({
        userId: creator._id,
        userEmail: creator.email,
        type: 'bonus',
        amount: contribution.contributionAmount,
        balanceBefore: creator.raisedCredits - contribution.contributionAmount,
        balanceAfter: creator.raisedCredits,
        referenceId: contribution._id.toString(),
        description: `Pledge approved for campaign: "${contribution.campaignTitle}"`
      });
      await creatorAudit.save();
    }

    // Notify Supporter
    const successNotification = new Notification({
      message: `Your contribution of ${contribution.contributionAmount} credits to "${contribution.campaignTitle}" was approved by ${contribution.creatorName}.`,
      toEmail: contribution.supporterEmail,
      type: 'success',
      actionRoute: `/dashboard/supporter-home`,
      fromUser: creator?._id,
      entityType: 'contribution',
      entityId: contribution._id.toString()
    });
    await successNotification.save();

    return res.json({ message: 'Contribution approved successfully.', contribution });
  } catch (error) {
    console.error('Approve contribution error:', error);
    return res.status(500).json({ message: 'Server error approving contribution' });
  }
});

// @route   PUT /contributions/:id/reject
// @desc    Reject contribution (Creator only, refunds credits to supporter)
router.put('/:id/reject', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const contribution = await Contribution.findById(req.params.id);
    if (!contribution) return res.status(404).json({ message: 'Contribution not found' });

    if (contribution.creatorEmail !== req.user.email) {
      return res.status(403).json({ message: 'Forbidden. You do not own the campaign for this contribution.' });
    }

    if (contribution.status !== 'pending') {
      return res.status(400).json({ message: `Contribution is already ${contribution.status}` });
    }

    // Reject the contribution
    contribution.status = 'rejected';
    await contribution.save();

    // Refund Supporter Credits
    const creator = await User.findOne({ email: contribution.creatorEmail });
    const supporter = await User.findById(contribution.supporterId);
    if (supporter) {
      const balanceBefore = supporter.credits;
      supporter.credits += contribution.contributionAmount;
      await supporter.save();

      // Log Credit Transaction for Supporter (refund)
      const refundAudit = new CreditTransaction({
        userId: supporter._id,
        userEmail: supporter.email,
        type: 'refund',
        amount: contribution.contributionAmount,
        balanceBefore,
        balanceAfter: supporter.credits,
        referenceId: contribution._id.toString(),
        description: `Contribution rejected and refunded for campaign: "${contribution.campaignTitle}"`
      });
      await refundAudit.save();
    }

    // Notify Supporter
    const rejectNotification = new Notification({
      message: `Your contribution of ${contribution.contributionAmount} credits to "${contribution.campaignTitle}" was rejected by ${contribution.creatorName}. ${contribution.contributionAmount} credits have been refunded.`,
      toEmail: contribution.supporterEmail,
      type: 'error',
      actionRoute: `/dashboard/supporter-home`,
      fromUser: creator?._id,
      entityType: 'contribution',
      entityId: contribution._id.toString()
    });
    await rejectNotification.save();

    return res.json({ message: 'Contribution rejected and credits refunded.', contribution });
  } catch (error) {
    console.error('Reject contribution error:', error);
    return res.status(500).json({ message: 'Server error rejecting contribution' });
  }
});

export default router;
