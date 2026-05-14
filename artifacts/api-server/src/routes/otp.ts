import { Router } from "express";
import { sendOtp, verifyOtp } from "../services/otpService";

const router = Router();

router.post("/otp/send", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }
  const emailLower = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const result = await sendOtp(emailLower);
  if (!result.success) return res.status(429).json({ error: result.message });
  return res.json({ success: true, message: result.message });
});

router.post("/otp/verify", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }
  if (!/^\d{6}$/.test(String(otp).trim())) {
    return res.status(400).json({ error: "OTP must be a 6-digit number" });
  }

  const result = await verifyOtp(email.toLowerCase().trim(), String(otp).trim());
  if (!result.success) return res.status(400).json({ error: result.message });
  return res.json({ success: true, message: result.message });
});

export default router;
