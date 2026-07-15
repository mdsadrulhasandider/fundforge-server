import { Schema, model, Document, Types } from 'mongoose';

export interface ICampaign extends Document {
  title: string;
  campaignStory: string;
  category: string;
  fundingGoal: number;
  minimumContribution: number;
  deadline: Date;
  rewardInfo: string;
  image: string;
  creatorId: Types.ObjectId;
  creatorEmail: string;
  creatorName: string;
  amountRaised: number;
  supportersCount: number;
  views: number;
  status: 'pending' | 'approved' | 'rejected' | 'suspended' | 'completed' | 'expired';
  createdAt: Date;
}

const CampaignSchema = new Schema<ICampaign>({
  title: { type: String, required: true, trim: true },
  campaignStory: { type: String, required: true },
  category: { type: String, required: true, trim: true },
  fundingGoal: { type: Number, required: true, min: 0 },
  minimumContribution: { type: Number, required: true, min: 0 },
  deadline: { type: Date, required: true },
  rewardInfo: { type: String, required: true },
  image: { type: String, required: true },
  creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  creatorEmail: { type: String, required: true, lowercase: true, trim: true },
  creatorName: { type: String, required: true },
  amountRaised: { type: Number, default: 0 },
  supportersCount: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended', 'completed', 'expired'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

CampaignSchema.index({ title: 'text', campaignStory: 'text', category: 'text' });

export const Campaign = model<ICampaign>('Campaign', CampaignSchema);
