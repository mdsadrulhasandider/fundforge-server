import { Router, Response } from 'express';
import { User } from '../models/User';
import { Campaign } from '../models/Campaign';
import { Payment } from '../models/Payment';
import { verifyJWT, verifyAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// @route   GET /admin/stats
// @desc    Get dashboard metrics & aggregate stats (Admin only)
router.get('/stats', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCreators = await User.countDocuments({ role: 'Creator' });
    const totalSupporters = await User.countDocuments({ role: 'Supporter' });
    
    // Sum of credits across all users
    const creditsResult = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$credits' } } }
    ]);
    const totalCredits = creditsResult[0]?.total || 0;

    const totalCampaigns = await Campaign.countDocuments();

    // Sum of payments (total revenue)
    const paymentsResult = await Payment.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = paymentsResult[0]?.total || 0;

    // Campaigns by category for charts
    const categoriesResult = await Campaign.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, raised: { $sum: '$amountRaised' } } }
    ]);

    return res.json({
      totalUsers,
      totalCreators,
      totalSupporters,
      totalCredits,
      totalCampaigns,
      totalRevenue,
      categories: categoriesResult
    });
  } catch (error) {
    console.error('Fetch stats error:', error);
    return res.status(500).json({ message: 'Server error compiling system statistics' });
  }
});

// @route   GET /admin/users
// @desc    Get all users (Admin only)
router.get('/users', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return res.json({ users });
  } catch (error) {
    console.error('Fetch admin users error:', error);
    return res.status(500).json({ message: 'Server error retrieving user list' });
  }
});

// @route   PUT /admin/users/:id/role
// @desc    Update user role (Admin only)
router.put('/users/:id/role', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { role } = req.body;
    if (!['Supporter', 'Creator', 'Admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid user role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.role = role;
    
    // Adjust credits to role standard if it's default
    if (role === 'Admin') {
      user.credits = 999999999;
    } else if (role === 'Creator' && user.credits > 20) {
      user.credits = 20;
    } else if (role === 'Supporter' && user.credits > 50) {
      user.credits = 50;
    }

    await user.save();

    return res.json({ message: `User role updated to ${role} successfully.`, user });
  } catch (error) {
    console.error('Update user role error:', error);
    return res.status(500).json({ message: 'Server error updating user role' });
  }
});

// @route   PUT /admin/users/:id/status
// @desc    Suspend or unsuspend user account (Admin only)
router.put('/users/:id/status', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.status = status;
    await user.save();

    return res.json({ message: `User account is now ${status}`, user });
  } catch (error) {
    console.error('Update user status error:', error);
    return res.status(500).json({ message: 'Server error updating status' });
  }
});

// @route   DELETE /admin/users/:id
// @desc    Remove/Delete user from database (Admin only)
router.delete('/users/:id', verifyJWT, verifyAdmin, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'Admin') {
      return res.status(400).json({ message: 'Cannot remove an Administrator account' });
    }

    await User.findByIdAndDelete(req.params.id);
    return res.json({ message: 'User removed from server successfully.' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ message: 'Server error deleting user' });
  }
});

export default router;
