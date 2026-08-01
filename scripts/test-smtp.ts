import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 2525;
const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || "flash-mail.vaibhavs-h.xyz";

async function main() {
  const targetUser = process.argv[2] || "temp-user";
  const recipient = `${targetUser}@${DOMAIN}`;

  console.log(`\n📮 [SMTP Test Client] Sending test email...`);
  console.log(`   Target Server: localhost:${PORT}`);
  console.log(`   Recipient:     ${recipient}\n`);

  const transporter = nodemailer.createTransport({
    host: "localhost",
    port: PORT,
    secure: false, // TLS disabled for local testing
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: '"GitHub Notifications" <notifications@github.com>',
      to: recipient,
      subject: `🎉 Security verification code: ${Math.floor(100000 + Math.random() * 900000)}`,
      text: `Hello ${targetUser},\n\nYour security verification code is 492-019. This code expires in 10 minutes.\n\nThank you,\nGitHub Security Team`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0f172a; color: #f8fafc; border-radius: 10px;">
          <h2 style="color: #38bdf8;">Security Verification</h2>
          <p>Hello <b>${targetUser}</b>,</p>
          <p>Use the verification code below to authorize your sign-in to <b>flash-mail.vaibhavs-h.xyz</b>:</p>
          <div style="background-color: #1e293b; padding: 15px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #60a5fa; text-align: center; margin: 20px 0;">
            ${Math.floor(100000 + Math.random() * 900000)}
          </div>
          <p style="font-size: 12px; color: #94a3b8;">If you did not request this code, you can safely ignore this email.</p>
        </div>
      `,
    });

    console.log(`✅ [SMTP Test Success] Email delivered to local daemon! Message ID: ${info.messageId}`);
  } catch (err: any) {
    console.error(`❌ [SMTP Test Failed] Error sending email:`, err.message);
  }
}

main();
