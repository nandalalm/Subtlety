import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getOtpEmailTemplate = (otp, year) => `
  <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="cid:logo" alt="Subtlety Logo" style="width: 150px;">
    </div>
    <h2 style="color: #9135ED; text-align: center;">Email Verification</h2>
    <p style="font-size: 16px; color: #333; line-height: 1.5;">
      Hello, <br><br>
      Thank you for choosing <strong>Subtlety</strong>. To complete your registration, please use the following One-Time Password (OTP):
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 32px; font-weight: bold; color: #9135ED; letter-spacing: 5px; border: 2px dashed #9135ED; padding: 10px 20px; border-radius: 5px;">${otp}</span>
    </div>
    <p style="font-size: 14px; color: #666; text-align: center;">
      This OTP is valid for <strong>60 seconds</strong>. For security reasons, please do not share this code with anyone.
    </p>
    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; text-align: center;">
      If you didn't request this email, you can safely ignore it. <br>
      &copy; ${year} Subtlety. All rights reserved.
    </p>
  </div>
`;

export const getPasswordResetEmailTemplate = (otp, year) => `
  <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="cid:logo" alt="Subtlety Logo" style="width: 150px;">
    </div>
    <h2 style="color: #9135ED; text-align: center;">Password Reset</h2>
    <p style="font-size: 16px; color: #333; line-height: 1.5;">
      Hello, <br><br>
      We received a request to reset your password for your <strong>Subtlety</strong> account. Use the following One-Time Password (OTP) to proceed:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 32px; font-weight: bold; color: #9135ED; letter-spacing: 5px; border: 2px dashed #9135ED; padding: 10px 20px; border-radius: 5px;">${otp}</span>
    </div>
    <p style="font-size: 14px; color: #666; text-align: center;">
      This OTP is valid for <strong>60 seconds</strong>. If you did not request a password reset, please ignore this email.
    </p>
    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; text-align: center;">
      &copy; ${year} Subtlety. All rights reserved.
    </p>
  </div>
`;

export const sendOtpEmail = async (email, otp, subject, templateFunc) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"Subtlety Support" <${process.env.EMAIL}>`,
    to: email,
    subject: subject,
    html: templateFunc(otp, new Date().getFullYear()),
    attachments: [{
      filename: 'logo.png',
      path: path.join(__dirname, '../public/images/logo-bg-removed.png'),
      cid: 'logo'
    }]
  };

  await transporter.sendMail(mailOptions);
};
