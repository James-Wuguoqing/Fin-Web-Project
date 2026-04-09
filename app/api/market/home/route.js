import { NextResponse } from "next/server";
import { getCachedHomepageData } from "../../../../lib/market-data";

export async function GET() {
  const data = await getCachedHomepageData();
  return NextResponse.json(data);
}
