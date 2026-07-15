import { Schema, model, Document, Types } from 'mongoose';

export interface IContribution extends Document {
  campaignId: Types.ObjectId;
  campaignTitle: string;
  contributionAmount: number;
  supporterId: Types.ObjectId;
  supporterEmail: string;
  supporterName: string;
  creatorEmail: string;
  creatorName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

const ContributionSchema = new Schema<IContribution>({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
  campaignTitle: { type: String, required: true },
  contributionAmount: { type: Number, required: true, min: 1 },
  supporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  supporterEmail: { type: String, required: true, lowercase: true, trim: true },
  supporterName: { type: String, required: true },
  creatorEmail: { type: String, required: true, lowercase: true, trim: true },
  creatorName: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const Contribution = model<IContribution>('Contribution', ContributionSchema);
