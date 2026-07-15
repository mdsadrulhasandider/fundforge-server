import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User';
import { CreditTransaction } from '../models/CreditTransaction';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || 'dummy_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_secret',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email found in Google profile'), undefined);
        }

        // Find or create user
        let user = await User.findOne({ email });
        if (user) {
          return done(null, user as any);
        }

        // Create new user with 1000 credits signup bonus!
        const isFirstUser = (await User.countDocuments({})) === 0;
        const assignedRole = isFirstUser ? 'Admin' : 'Supporter';

        user = new User({
          name: profile.displayName || profile.name?.givenName || 'Google User',
          email,
          photo: profile.photos?.[0]?.value || '',
          role: assignedRole,
          credits: assignedRole === 'Supporter' ? 1000 : 0,
          status: 'active'
        });

        await user.save();

        // Create credit transaction ledger log for supporter bonus
        if (assignedRole === 'Supporter') {
          await CreditTransaction.create({
            userId: user._id,
            userEmail: user.email,
            amount: 1000,
            balanceBefore: 0,
            balanceAfter: 1000,
            type: 'bonus',
            description: '1,000 Sign Up Bonus Credits for Google Sign-In',
            status: 'success'
          });
        }

        return done(null, user as any);
      } catch (error: any) {
        return done(error, undefined);
      }
    }
  )
);
