const passport = require("passport");
require("dotenv").config();
const GoogleStrategy = require("passport-google-oauth2").Strategy;
const User = require("./model/user"); 
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
            return done(null, false, { message: "User is blocked" }); 
          }
          return done(null, existingUser);
        }

        const newUser = new User({
          googleId: id,
          firstname: name.givenName,
          lastname: name.familyName,
          email: email.value,
        });
        await newUser.save();
        done(null, newUser);
      } catch (error) {
        console.error("Error handling user:", error);
        done(error, null);
      }
    }
  )
);

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    console.error("Error deserializing user:", error);
    done(error, null);
  }
});
