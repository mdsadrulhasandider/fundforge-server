import { Schema, model, Document, Types } from 'mongoose';

export interface IReport extends Document {
  campaignId: Types.ObjectId;
  campaignTitle: string;
  reporterEmail: string;
  reporterName: string;
  reason: string;
  status: 'pending' | 'resolved';
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
  campaignTitle: { type: String, required: true },
  reporterEmail: { type: String, required: true, lowercase: true, trim: true },
  reporterName: { type: String, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const Report = model<IReport>('Report', ReportSchema);
