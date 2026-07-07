import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

router.patch("/account/profile", requireAuth, async (req: any, res: any): Promise<void> => {
  const { phone, dateOfBirth, gender, language } = req.body;
  try {
    await clerkClient.users.updateUserMetadata(req.userId, {
      publicMetadata: {
        phone: phone ?? "",
        dateOfBirth: dateOfBirth ?? "",
        gender: gender ?? "",
        language: language ?? "English",
      },
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update profile metadata");
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
