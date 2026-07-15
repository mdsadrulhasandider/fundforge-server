import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Campaign } from '../models/Campaign';
import { Contribution } from '../models/Contribution';
import { User } from '../models/User';
import { CreditTransaction } from '../models/CreditTransaction';
import { Notification } from '../models/Notification';
import { verifyJWT, verifyCreator, verifyAdmin, verifyCreatorOrAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// Zod Validation Schema for adding campaign
const campaignCreateSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  campaignStory: z.string().min(20, 'Story must be at least 20 characters'),
  category: z.string().min(1, 'Category is required'),
  fundingGoal: z.number().min(10, 'Funding goal must be at least 10 credits'),
  minimumContribution: z.number().min(1, 'Minimum contribution must be at least 1 credit'),
  deadline: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid deadline date'),
  rewardInfo: z.string().min(5, 'Reward info is required'),
  image: z.string().url('Invalid image URL')
});

// @route   GET /campaigns
// @desc    Get all approved and non-expired campaigns (with search, filter, sort, pagination)
router.get('/', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { search, category, status, goalMin, goalMax, sort, page = '1', limit = '6' } = req.query;

    const query: any = { status: 'approved' }; // Public can only see approved

    // Search query
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { campaignStory: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category && category !== 'All') {
      query.category = category;
    }

    // Goal range filter
    if (goalMin || goalMax) {
      query.fundingGoal = {};
      if (goalMin) query.fundingGoal.$gte = Number(goalMin);
      if (goalMax) query.fundingGoal.$lte = Number(goalMax);
    }

    // Handle Deadline filter - only show campaigns where deadline is in future by default
    query.deadline = { $gte: new Date() };

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    let sortQuery: any = { createdAt: -1 }; // default: newest
    if (sort === 'newest') {
      sortQuery = { createdAt: -1 };
    } else if (sort === 'most-funded') {
      sortQuery = { amountRaised: -1 };
    } else if (sort === 'ending-soon') {
      sortQuery = { deadline: 1 };
    } else if (sort === 'goal-high') {
      sortQuery = { fundingGoal: -1 };
    } else if (sort === 'goal-low') {
      sortQuery = { fundingGoal: 1 };
    }

    const campaigns = await Campaign.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum);

    const total = await Campaign.countDocuments(query);

    return res.json({
      campaigns,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalCampaigns: total
    });
  } catch (error) {
    console.error('Fetch campaigns error:', error);
    return res.status(500).json({ message: 'Server error fetching campaigns' });
  }
});

// @route   GET /campaigns/my
// @desc    Get campaigns created by logged-in creator
router.get('/my', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    // Show campaigns sorted by deadline descending
    const campaigns = await Campaign.find({ creatorId: req.user.id }).sort({ deadline: -1 });
    return res.json({ campaigns });
  } catch (error) {
    console.error('Fetch my campaigns error:', error);
    return res.status(500).json({ message: 'Server error fetching campaigns' });
  }
});

// @route   GET /campaigns/pending
// @desc    Get all pending campaigns for Admin approval
router.get('/pending', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const campaigns = await Campaign.find({ status: 'pending' }).sort({ createdAt: -1 });
    return res.json({ campaigns });
  } catch (error) {
    console.error('Fetch pending campaigns error:', error);
    return res.status(500).json({ message: 'Server error fetching campaigns' });
  }
});

// @route   GET /campaigns/all
// @desc    Get all campaigns for Admin management
router.get('/all', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    return res.json({ campaigns });
  } catch (error) {
    console.error('Fetch all campaigns error:', error);
    return res.status(500).json({ message: 'Server error fetching campaigns' });
  }
});

// @route   GET /campaigns/top-funded
// @desc    Get top 6 campaigns raised maximum amount
router.get('/top-funded', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const campaigns = await Campaign.find({ status: 'approved' })
      .sort({ amountRaised: -1 })
      .limit(6);
    return res.json({ campaigns });
  } catch (error) {
    console.error('Fetch top funded error:', error);
    return res.status(500).json({ message: 'Server error fetching campaigns' });
  }
});

// @route   GET /campaigns/:id
// @desc    Get specific campaign detail (increases views)
router.get('/:id', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    return res.json({ campaign });
  } catch (error) {
    console.error('Fetch campaign details error:', error);
    return res.status(500).json({ message: 'Server error fetching campaign details' });
  }
});

// @route   POST /campaigns
// @desc    Create new campaign (Creator only)
router.post('/', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const validatedData = campaignCreateSchema.parse(req.body);
    const creator = await User.findById(req.user.id);
    if (!creator) return res.status(404).json({ message: 'Creator not found' });

    const newCampaign = new Campaign({
      ...validatedData,
      deadline: new Date(validatedData.deadline),
      creatorId: creator._id,
      creatorEmail: creator.email,
      creatorName: creator.name,
      amountRaised: 0,
      supportersCount: 0,
      views: 0,
      status: 'pending' // Admin must approve
    });

    await newCampaign.save();
    return res.status(201).json({ message: 'Campaign created and pending admin approval', campaign: newCampaign });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create campaign error:', error);
    return res.status(500).json({ message: 'Server error creating campaign' });
  }
});

// @route   PUT /campaigns/:id
// @desc    Update campaign fields (Creator only: title, campaignStory, rewardInfo)
router.put('/:id', verifyJWT, verifyCreator, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    
    const { title, campaignStory, rewardInfo } = req.body;
    
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Verify ownership
    if (campaign.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden. You do not own this campaign.' });
    }

    if (title) campaign.title = title;
    if (campaignStory) campaign.campaignStory = campaignStory;
    if (rewardInfo) campaign.rewardInfo = rewardInfo;

    await campaign.save();
    return res.json({ message: 'Campaign updated successfully', campaign });
  } catch (error) {
    console.error('Update campaign error:', error);
    return res.status(500).json({ message: 'Server error updating campaign' });
  }
});

// @route   PUT /campaigns/:id/status
// @desc    Approve, Reject or Suspend campaign (Admin only)
router.put('/:id/status', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid campaign status' });
    }

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    campaign.status = status;
    await campaign.save();

    // Notify creator
    const notification = new Notification({
      message: `Your campaign "${campaign.title}" was ${status} by the administrator.`,
      toEmail: campaign.creatorEmail,
      type: status === 'approved' ? 'success' : 'error',
      actionRoute: `/dashboard/creator-home`,
      fromUser: req.user?.id ? new Types.ObjectId(req.user.id) : undefined,
      entityType: 'campaign',
      entityId: campaign._id.toString()
    });
    await notification.save();

    return res.json({ message: `Campaign status updated to ${status}`, campaign });
  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({ message: 'Server error updating campaign status' });
  }
});

// @route   DELETE /campaigns/:id
// @desc    Delete campaign and REFUND all approved/pending supporters (Creator or Admin)
router.delete('/:id', verifyJWT, verifyCreatorOrAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    // Permissions check: must be owner OR admin
    if (req.user.role !== 'Admin' && campaign.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden. Access denied.' });
    }

    // Refund Logic: find all approved or pending contributions
    const contributions = await Contribution.find({
      campaignId: campaign._id,
      status: { $in: ['approved', 'pending'] }
    });

    for (const contribution of contributions) {
      // Find supporter user
      const supporter = await User.findById(contribution.supporterId);
      if (supporter) {
        const balanceBefore = supporter.credits;
        supporter.credits += contribution.contributionAmount;
        await supporter.save();

        // Log Credit Transaction for Supporter
        const refundAudit = new CreditTransaction({
          userId: supporter._id,
          userEmail: supporter.email,
          type: 'refund',
          amount: contribution.contributionAmount,
          balanceBefore,
          balanceAfter: supporter.credits,
          referenceId: contribution._id.toString(),
          description: `Refunded pledge due to campaign deletion: "${campaign.title}"`
        });
        await refundAudit.save();

        // Send notification
        const refundNotification = new Notification({
          message: `Your contribution of ${contribution.contributionAmount} credits to "${campaign.title}" was refunded because the campaign was deleted.`,
          toEmail: supporter.email,
          type: 'warning',
          actionRoute: `/dashboard/supporter-home`,
          fromUser: req.user?.id ? new Types.ObjectId(req.user.id) : undefined,
          entityType: 'campaign',
          entityId: campaign._id.toString()
        });
        await refundNotification.save();
      }

      // Mark contribution as rejected (refunded)
      contribution.status = 'rejected';
      await contribution.save();
    }

    // Delete the campaign
    await Campaign.findByIdAndDelete(campaign._id);

    return res.json({ message: 'Campaign deleted successfully and all active supporters refunded.' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    return res.status(500).json({ message: 'Server error deleting campaign' });
  }
});

export default router;
