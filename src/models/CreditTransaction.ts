import { Schema, model, Document, Types } from 'mongoose';

export interface ICreditTransaction extends Document {
  userId: Types.ObjectId;
  userEmail: string;
  type: 'purchase' | 'contribution' | 'refund' | 'withdrawal' | 'bonus';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string; // Links to Contribution ID, Withdrawal ID, or Payment ID
  description: string;
  createdAt: Date;
}

const CreditTransactionSchema = new Schema<ICreditTransaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userEmail: { type: String, required: true, lowercase: true, trim: true },
  type: {
    type: String,
    enum: ['purchase', 'contribution', 'refund', 'withdrawal', 'bonus'],
    required: true
  },
  amount: { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  referenceId: { type: String, default: '' },
  description: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const CreditTransaction = model<ICreditTransaction>('CreditTransaction', CreditTransactionSchema);
