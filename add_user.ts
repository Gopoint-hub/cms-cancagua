import { createUser } from "./server/db";
import crypto from "crypto";
import bcrypt from "bcryptjs";

async function main() {
  try {
    const passwordHash = await bcrypt.hash("Cancagua2026!", 10);
    const openId = crypto.randomUUID();
    
    await createUser({
      openId,
      name: "Recepción",
      email: "contacto@cancagua.cl",
      passwordHash,
      role: "admin", 
      status: "active",
      loginMethod: "email"
    });
    console.log("User added successfully!");
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
main();
