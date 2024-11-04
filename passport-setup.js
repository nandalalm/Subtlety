const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth2").Strategy;
const User = require("./model/user"); // Adjust the path to your User model
passport.use(
  new GoogleStrategy(
    {
      clientID:
        "669675691251-65vog03j0sf3bj3f1d9jm6ios9p315ph.apps.googleusercontent.com",
      clientSecret: "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",
      callbackURL: "/auth/google/callback",
      scope: ["profile", "email"],
      prompt: "select_account", // Ensures the account selection screen appears
    },
    async (accessToken, refreshToken, profile, done) => {
      const { id, emails, name } = profile;
      const [email] = emails;

      try {
        let existingUser = await User.findOne({ email: email.value });

        if (existingUser) {
          if (existingUser.isBlocked) {
            return done(null, false, { message: "User is blocked" }); // Pass message to callback
          }
          return done(null, existingUser);
        }

        // Create a new user if not found
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
  done(null, user.id); // Store user ID in the session
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    // Find the user by ID and pass the user object to `done`
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    // Handle any errors that occur
    console.error("Error deserializing user:", error);
    done(error, null);
  }
});