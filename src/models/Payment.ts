import { Schema, model, Document, Types } from 'mongoose';

export interface IPayment extends Document {
  userId: Types.ObjectId;
  userEmail: string;
  packageName: string;
  credits: number;
  amount: number;
  transactionId: string;
  paymentMethod: string;
  status: string;
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail: { type: String, required: true, lowercase: true, trim: true },
  packageName: { type: String, required: true },
  credits: { type: Number, required: true },
  amount: { type: Number, required: true },
  transactionId: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  status: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Payment = model<IPayment>('Payment', PaymentSchema);
