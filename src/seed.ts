import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from './models/User';
import { Campaign } from './models/Campaign';
import { Contribution } from './models/Contribution';
import { CreditTransaction } from './models/CreditTransaction';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fundforge';

const seedDatabase = async () => {
  try {
    console.log('Connecting to database for seeding...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // Clear existing collections
    console.log('Clearing existing records...');
    await User.deleteMany({});
    await Campaign.deleteMany({});
    await Contribution.deleteMany({});
    await CreditTransaction.deleteMany({});

    // 1. Create Users
    console.log('Seeding users...');
    const hashedPassword = await bcrypt.hash('adminpassword123', 10);

    const admin = new User({
      name: 'Admin Forge',
      email: 'admin@fundforge.com',
      password: hashedPassword,
      role: 'Admin',
      credits: 999999,
      raisedCredits: 0,
      status: 'active'
    });
    await admin.save();

    const creator = new User({
      name: 'Sarah Connor',
      email: 'creator@fundforge.com',
      password: hashedPassword,
      role: 'Creator',
      credits: 20,
      raisedCredits: 1200,
      status: 'active'
    });
    await creator.save();

    const supporter = new User({
      name: 'John Doe',
      email: 'supporter@fundforge.com',
      password: hashedPassword,
      role: 'Supporter',
      credits: 1450,
      raisedCredits: 0,
      status: 'active'
    });
    await supporter.save();

    // 2. Create mock campaigns
    console.log('Seeding campaigns...');
    const campaignsData = [
      {
        title: 'OpenOptics Smart Glasses',
        campaignStory: 'We are engineering open-source AR spectacles built for educators, makers, and software designers. Features high fidelity optical overlays and fully modular frames.',
        category: 'Technology',
        fundingGoal: 2000,
        minimumContribution: 10,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        rewardInfo: 'Early Access Prototype Frame + Custom Dev Kit SDK',
        image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&q=80&w=600',
        creatorId: creator._id,
        creatorEmail: creator.email,
        creatorName: creator.name,
        amountRaised: 800,
        supportersCount: 2,
        views: 142,
        status: 'approved'
      },
      {
        title: 'CyberCity Retro RPG Game',
        campaignStory: 'A sprawling 2.5D pixel-art cyber RPG paying homage to classics. Navigate underground markets, upgrade augmentations, and solve city-wide corporate conspiracies.',
        category: 'Art',
        fundingGoal: 1500,
        minimumContribution: 5,
        deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        rewardInfo: 'Digital Copy of CyberCity + Original Soundtrack FLAC Bundle',
        image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=600',
        creatorId: creator._id,
        creatorEmail: creator.email,
        creatorName: creator.name,
        amountRaised: 300,
        supportersCount: 1,
        views: 89,
        status: 'approved'
      },
      {
        title: 'EcoPack Plantable Coffee Pods',
        campaignStory: 'Zero-waste coffee pods manufactured using mycelium pulp. After use, throw them into the garden where they enrich the soil and grow native flowers.',
        category: 'Community',
        fundingGoal: 800,
        minimumContribution: 2,
        deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now
        rewardInfo: 'Pack of 50 Plantable Pods + Ceramic Keep-Cup',
        image: 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&q=80&w=600',
        creatorId: creator._id,
        creatorEmail: creator.email,
        creatorName: creator.name,
        amountRaised: 100,
        supportersCount: 1,
        views: 54,
        status: 'approved'
      }
    ];

    const insertedCampaigns = await Campaign.insertMany(campaignsData);

    // 3. Create mock contributions & transactions
    console.log('Seeding contributions & transactions...');
    
    // John Doe contributed to OpenOptics
    const c1 = new Contribution({
      campaignId: insertedCampaigns[0]._id,
      campaignTitle: insertedCampaigns[0].title,
      contributionAmount: 500,
      supporterId: supporter._id,
      supporterEmail: supporter.email,
      supporterName: supporter.name,
      creatorEmail: creator.email,
      creatorName: creator.name,
      status: 'approved'
    });
    await c1.save();

    const t1 = new CreditTransaction({
      userId: supporter._id,
      userEmail: supporter.email,
      type: 'contribution',
      amount: 500,
      balanceBefore: 1950,
      balanceAfter: 1450,
      referenceId: c1._id.toString(),
      description: `Contributed to campaign: "${insertedCampaigns[0].title}"`
    });
    await t1.save();

    // Bonus logs for John Doe
    const t2 = new CreditTransaction({
      userId: supporter._id,
      userEmail: supporter.email,
      type: 'bonus',
      amount: 50,
      balanceBefore: 0,
      balanceAfter: 50,
      description: 'Registration welcome bonus credits'
    });
    await t2.save();

    // Purchase log for John Doe
    const t3 = new CreditTransaction({
      userId: supporter._id,
      userEmail: supporter.email,
      type: 'purchase',
      amount: 1900,
      balanceBefore: 50,
      balanceAfter: 1950,
      description: 'Purchased Ultimate Bundle credit package'
    });
    await t3.save();

    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedDatabase();
