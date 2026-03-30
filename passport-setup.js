import passport from "passport";
import "dotenv/config";
import { Strategy as GoogleStrategy } from "passport-google-oauth2";
import User from "./model/user.js"; 
import MESSAGES from "./Constants/messages.js";

function normalizeGoogleNamePart(value, fallback = "") {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 20);

  return normalized || fallback;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ["profile", "email"],
      prompt: "select_account",
    },
    async (accessToken, refreshToken, profile, done) => {
      const { id, emails, name } = profile;
      const [email] = emails;

      try {
        let existingUser = await User.findOne({ email: email.value });

        if (existingUser) {
          if (existingUser.isBlocked) {
            return done(null, false, { message: MESSAGES.AUTH.USER_BLOCKED }); 
          }
          return done(null, existingUser);
        }

        const normalizedFirstName =
          normalizeGoogleNamePart(name?.givenName) ||
          normalizeGoogleNamePart(name?.familyName) ||
          normalizeGoogleNamePart(profile?.displayName, "User");
        const normalizedLastname = normalizeGoogleNamePart(name?.familyName);

        const newUser = new User({
          googleId: id,
          firstname: normalizedFirstName.length >= 3 ? normalizedFirstName : "User",
          lastname: normalizedLastname,
          email: email.value,
        });
        await newUser.save();
        done(null, newUser);
      } catch (error) {
        console.error(MESSAGES.AUTH.PASSPORT_STRATEGY_ERROR, error);
        done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    console.error(MESSAGES.AUTH.PASSPORT_DESERIALIZE_ERROR, error);
    done(error, null);
  }
});
