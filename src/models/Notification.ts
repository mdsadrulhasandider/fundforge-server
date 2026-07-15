import { Schema, model, Document, Types } from 'mongoose';

export interface INotification extends Document {
  message: string;
  toEmail: string;
  type: 'info' | 'success' | 'warning' | 'error';
  actionRoute: string;
  isRead: boolean;
  fromUser?: Types.ObjectId; // Link to user initiating the action
  entityType?: 'campaign' | 'contribution' | 'withdrawal' | 'info';
  entityId?: string; // ID of the referenced document
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  message: { type: String, required: true },
  toEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
  actionRoute: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  fromUser: { type: Schema.Types.ObjectId, ref: 'User' },
  entityType: { type: String, enum: ['campaign', 'contribution', 'withdrawal', 'info'], default: 'info' },
  entityId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

export const Notification = model<INotification>('Notification', NotificationSchema);
