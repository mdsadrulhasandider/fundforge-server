import { Schema, model, Document, Types } from 'mongoose';

export interface IWithdrawal extends Document {
  creatorId: Types.ObjectId;
  creatorEmail: string;
  creatorName: string;
  withdrawCredits: number;
  withdrawAmount: number;
  paymentSystem: 'Stripe' | 'Bkash' | 'Rocket' | 'Nagad';
  accountNumber: string;
  status: 'pending' | 'approved';
  createdAt: Date;
}

const WithdrawalSchema = new Schema<IWithdrawal>({
  creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  creatorEmail: { type: String, required: true, lowercase: true, trim: true },
  creatorName: { type: String, required: true },
  withdrawCredits: { type: Number, required: true, min: 200 },
  withdrawAmount: { type: Number, required: true },
  paymentSystem: { type: String, enum: ['Stripe', 'Bkash', 'Rocket', 'Nagad'], required: true },
  accountNumber: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const Withdrawal = model<IWithdrawal>('Withdrawal', WithdrawalSchema);
