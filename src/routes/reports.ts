import { Router, Response } from 'express';
import { z } from 'zod';
import { Report } from '../models/Report';
import { Campaign } from '../models/Campaign';
import { User } from '../models/User';
import { verifyJWT, verifyAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

const reportSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required'),
  reason: z.string().min(10, 'Reason must be at least 10 characters long')
});

// @route   POST /reports
// @desc    Submit a campaign report (Authenticated users)
router.post('/', verifyJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const validatedData = reportSchema.parse(req.body);
    const campaign = await Campaign.findById(validatedData.campaignId);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const newReport = new Report({
      campaignId: campaign._id,
      campaignTitle: campaign.title,
      reporterEmail: user.email,
      reporterName: user.name,
      reason: validatedData.reason,
      status: 'pending'
    });

    await newReport.save();

    return res.status(201).json({
      message: 'Campaign report submitted successfully. Admin will review this shortly.',
      report: newReport
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Submit report error:', error);
    return res.status(500).json({ message: 'Server error processing campaign report' });
  }
});

// @route   GET /reports
// @desc    Get all reports (Admin only)
router.get('/', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    return res.json({ reports });
  } catch (error) {
    console.error('Fetch reports error:', error);
    return res.status(500).json({ message: 'Server error fetching reports' });
  }
});

// @route   PUT /reports/:id/resolve
// @desc    Mark a report as resolved (Admin only)
router.put('/:id/resolve', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    report.status = 'resolved';
    await report.save();

    return res.json({ message: 'Report marked as resolved', report });
  } catch (error) {
    console.error('Resolve report error:', error);
    return res.status(500).json({ message: 'Server error updating report status' });
  }
});

export default router;
