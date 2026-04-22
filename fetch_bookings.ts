import { getSkeduEvents } from "./server/skedu";
import * as fs from "fs";

async function run() {
  try {
    const data = await getSkeduEvents({
      startDate: "2026-03-01T00:00:00Z",
      endDate: "2026-04-16T23:59:59Z",
    });
    
    fs.writeFileSync("skedu_data.json", JSON.stringify(data, null, 2));
    console.log("Data fetched. Total items:", data.length || (data.data && data.data.length) || "unknown");
  } catch (error) {
    console.error("Error:", error.message);
    if (error.response) console.error(error.response.data);
  }
}

run();