const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const prisma = require('./prisma');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id, displayName, emails, photos } = profile;
        const email = emails[0].value;
        const avatar = photos[0].value;

        // Check if user exists
        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    { googleId: id },
                    { email: email }
                ]
            }
        });

        if (user) {
          // Update googleId if not present (case where email exists but first time login with google)
          if (!user.googleId) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleId: id, avatar: avatar },
            });
          }
          return done(null, user);
        }

        // Create new user if not exists
        user = await prisma.user.create({
          data: {
            name: displayName,
            email: email,
            googleId: id,
            avatar: avatar,
            role: 'BUYER',
          },
        });

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
