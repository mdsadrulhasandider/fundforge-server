import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  photo?: string;
  role: 'Supporter' | 'Creator' | 'Admin';
  credits: number;
  raisedCredits: number;
  status: 'active' | 'suspended';
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  password: { type: String }, // optional because of Google Auth
  photo: { type: String, default: '' },
  role: { type: String, enum: ['Supporter', 'Creator', 'Admin'], default: 'Supporter' },
  credits: { type: Number, default: 0 },
  raisedCredits: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

export const User = model<IUser>('User', UserSchema);
