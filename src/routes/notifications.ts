import { Router, Response } from 'express';
import { Notification } from '../models/Notification';
import { verifyJWT, AuthRequest } from '../middleware/auth';

const router = Router();

// @route   GET /notifications
// @desc    Get all notifications for logged-in user
router.get('/', verifyJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const notifications = await Notification.find({ toEmail: req.user.email })
      .sort({ createdAt: -1 });

    return res.json({ notifications });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    return res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

// @route   PUT /notifications/:id/read
// @desc    Mark a notification as read
router.put('/:id/read', verifyJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    if (notification.toEmail !== req.user.email) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    notification.isRead = true;
    await notification.save();

    return res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ message: 'Server error updating notification' });
  }
});

// @route   PUT /notifications/read-all
// @desc    Mark all notifications for current user as read
router.put('/read-all', verifyJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    await Notification.updateMany(
      { toEmail: req.user.email, isRead: false },
      { $set: { isRead: true } }
    );

    return res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    return res.status(500).json({ message: 'Server error updating notifications' });
  }
});

export default router;
